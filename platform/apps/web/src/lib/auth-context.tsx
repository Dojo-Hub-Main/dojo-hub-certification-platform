'use client';

import { createContext, useCallback, useContext } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserRole } from '@dojo-hub/shared';
import { api, ApiError } from './api-client';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
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
  login: (email: string, password: string) => Promise<AuthUser>;
  /** Public sign-up always creates a student account. */
  register: (name: string, email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
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
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      api.post<{ user: AuthUser }>('/auth/login', { email, password }),
  });

  const registerMutation = useMutation({
    mutationFn: (input: { name: string; email: string; password: string }) =>
      api.post<{ user: AuthUser }>('/auth/register', input),
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.post('/auth/logout'),
  });

  const login = useCallback(
    async (email: string, password: string) => {
      const { user } = await loginMutation.mutateAsync({ email, password });
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
