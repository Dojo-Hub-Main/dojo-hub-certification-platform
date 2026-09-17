'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, BookOpen, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { UserRole } from '@dojo-hub/shared';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import DojoHubLogo from '@/components/DojoHubLogo';

/**
 * Where someone with more than one role picks which workspace to open — straight after
 * signing in, or later from "Switch workspace" in the account menu. It only ever offers
 * roles the account holds; an account with a single role is sent straight on.
 */

const ROLE_HOME: Record<UserRole, string> = { STUDENT: '/home', EVALUATOR: '/queue', ADMIN: '/metrics' };

const WORKSPACES: Record<UserRole, { label: string; description: string; icon: typeof BookOpen }> = {
  [UserRole.STUDENT]: { label: 'Student', description: 'Your courses, lessons, quizzes and certificates.', icon: BookOpen },
  [UserRole.EVALUATOR]: { label: 'Evaluator', description: 'Review and grade work submitted by students.', icon: ClipboardCheck },
  [UserRole.ADMIN]: { label: 'Admin', description: 'Courses, accounts, evaluators and platform reports.', icon: ShieldCheck },
};

const ORDER: UserRole[] = [UserRole.STUDENT, UserRole.EVALUATOR, UserRole.ADMIN];

/** Same-origin paths only — see the login page. */
function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null;
  return next;
}

export default function ChooseWorkspacePage() {
  return (
    <Suspense fallback={null}>
      <WorkspaceChooser />
    </Suspense>
  );
}

function WorkspaceChooser() {
  const { user, isLoading, switchWorkspace, logout } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roles = user ? (user.roles?.length ? user.roles : [user.role]) : [];
  const roleCount = roles.length;
  const next = safeNext(params.get('next'));
  const fromMenu = params.get('from') === 'menu';

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace('/login');
    else if (roleCount <= 1) router.replace(next ?? ROLE_HOME[user.role]);
  }, [isLoading, user, roleCount, next, router]);

  const choose = async (role: UserRole) => {
    if (!user) return;
    setError(null);
    setPending(role);
    try {
      if (role !== user.role) await switchWorkspace(role);
      // A link someone was following (usually a course page) belongs to the student side.
      router.replace(role === UserRole.STUDENT && next ? next : ROLE_HOME[role]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not open that workspace. Please try again.');
      setPending(null);
    }
  };

  if (isLoading || !user || roleCount <= 1) {
    return <div className="text-sm text-navy-300 font-mono animate-pulse z-10">Loading your workspaces…</div>;
  }

  const firstName = user.name.split(' ')[0];

  return (
    <div className="relative w-full max-w-md bg-white rounded-3xl border border-black/[0.06] shadow-2xl shadow-black/40 p-6 sm:p-8 z-10 text-left space-y-6 animate-scaleUp">
      <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-crimson-500/50 to-transparent" />
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <div className="bg-white p-2.5 rounded-2xl shadow-md shadow-black/5 border border-black/[0.05] flex items-center justify-center">
            <DojoHubLogo size={56} />
          </div>
        </div>
        <h1 className="text-2xl font-extrabold text-navy-950 tracking-tight text-balance">Choose a workspace</h1>
        <p className="text-sm text-navy-500 max-w-xs mx-auto">
          Hi {firstName}, your account has access to more than one workspace. You can switch any time from your account menu.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-3.5 bg-crimson-50 border border-crimson-200 text-crimson-700 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}

      <ul className="space-y-2.5">
        {ORDER.filter((r) => roles.includes(r)).map((role) => {
          const { label, description, icon: Icon } = WORKSPACES[role];
          const current = fromMenu && role === user.role;
          return (
            <li key={role}>
              <button
                type="button"
                onClick={() => choose(role)}
                disabled={pending !== null}
                className="w-full flex items-center gap-4 rounded-2xl border border-navy-200 bg-navy-50/60 px-4 py-3.5 text-left transition-colors hover:border-crimson-400 hover:bg-white disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-500/60"
              >
                <span className="w-10 h-10 rounded-xl bg-navy-950 text-white flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-bold text-navy-950">{label}</span>
                    {current && (
                      <span className="text-[11px] font-mono uppercase tracking-wider text-navy-500 bg-navy-100 rounded px-1.5 py-0.5">
                        You&apos;re here
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-navy-500 mt-0.5">{description}</span>
                </span>
                <ArrowRight
                  className={`w-4 h-4 shrink-0 ${pending === role ? 'text-crimson-600 animate-pulse' : 'text-navy-400'}`}
                />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="text-center pt-3 border-t border-black/[0.06]">
        <button
          type="button"
          onClick={async () => {
            await logout();
            router.replace('/login');
          }}
          className="text-sm font-semibold text-navy-500 hover:text-crimson-600"
        >
          Not you? Sign out
        </button>
      </div>
    </div>
  );
}
