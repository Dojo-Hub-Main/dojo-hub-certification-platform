'use client';

import { createContext, useCallback, useContext } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserRole } from '@dojo-hub/shared';
import { api, ApiError } from './api-client';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  /** The workspace this session is acting as — what every page checks. */
  role: UserRole;
  /** Every role the account holds. More than one means the workspace chooser applies. */
  roles?: UserRole[];
  status: 'ACTIVE' | 'SUSPENDED';
  /** Opt-out for course announcements; transactional email is always sent. */
  emailNotifications?: boolean;
  studentProfile?: {
    currentLevel: { id: string; name: string; order: number; passingScore: number };
  } | null;
}

interface AuthContextValue {
  user: AuthUser | null | undefined;
  isLoading: boolean;
  /** `rememberMe` false ends the session when the browser closes. */
  login: (email: string, password: string, rememberMe?: boolean) => Promise<AuthUser>;
  /** Public sign-up always creates a student account. */
  register: (name: string, email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /** Moves this session into another of the account's workspaces. */
  switchWorkspace: (role: UserRole) => Promise<AuthUser>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery<AuthUser>({
    queryKey: ['me'],
    queryFn: () => api.get<AuthUser>('/auth/me'),
    retry: false,
    staleTime: 60_000,
  });

  const loginMutation = useMutation({
    mutationFn: (input: { email: string; password: string; rememberMe: boolean }) =>
      api.post<{ user: AuthUser }>('/auth/login', input),
  });

  const registerMutation = useMutation({
    mutationFn: (input: { name: string; email: string; password: string }) =>
      api.post<{ user: AuthUser }>('/auth/register', input),
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.post('/auth/logout'),
  });

  const switchMutation = useMutation({
    mutationFn: (role: UserRole) => api.post<{ user: AuthUser }>('/auth/switch-workspace', { role }),
  });

  const login = useCallback(
    async (email: string, password: string, rememberMe = true) => {
      const { user } = await loginMutation.mutateAsync({ email, password, rememberMe });
      queryClient.setQueryData(['me'], user);
      await queryClient.invalidateQueries();
      return user;
    },
    [loginMutation, queryClient],
  );

  /**
   * Creates the account only. Registration no longer starts a session, so nothing is
   * written to the ['me'] cache — the caller sends the user to the sign-in page.
   */
  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const { user } = await registerMutation.mutateAsync({ name, email, password });
      return user;
    },
    [registerMutation],
  );

  const switchWorkspace = useCallback(
    async (role: UserRole) => {
      const { user } = await switchMutation.mutateAsync(role);
      // Cached data belongs to the previous workspace; start clean in the new one.
      queryClient.setQueryData(['me'], user);
      await queryClient.invalidateQueries();
      return user;
    },
    [switchMutation, queryClient],
  );

  const logout = useCallback(async () => {
    // Sign-out must always succeed client-side, even if the network call fails
    // (expired session, offline, server error) — the user should never get stuck.
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // ignored — local session state is cleared below regardless
    } finally {
      queryClient.setQueryData(['me'], null);
      queryClient.clear();
    }
  }, [logoutMutation, queryClient]);

  const isAuthError = meQuery.error instanceof ApiError && (meQuery.error.status === 401 || meQuery.error.status === 403);

  return (
    <AuthContext.Provider
      value={{
        user: isAuthError ? null : meQuery.data,
        isLoading: meQuery.isLoading,
        login,
        register,
        logout,
        switchWorkspace,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
