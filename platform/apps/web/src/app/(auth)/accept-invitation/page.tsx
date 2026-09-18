'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, BookOpen, Lock, ShieldCheck, User } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { PasswordInput } from '@/components/ui/PasswordInput';
import DojoHubLogo from '@/components/DojoHubLogo';

/**
 * Where an invited evaluator accepts. Someone new sets a password here; someone who
 * already has an account accepts with the password they use. Evaluator access exists only
 * after this page — an administrator inviting an address grants nothing on its own.
 */

type Invitation = {
  name: string;
  email: string;
  hasAccount: boolean;
  courses: { id: string; title: string }[];
  expiresAt: string;
};

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={null}>
      <AcceptInvitation />
    </Suspense>
  );
}

function AcceptInvitation() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: invitation, isLoading, error: loadError } = useQuery<Invitation>({
    queryKey: ['invitation', token],
    queryFn: () => api.get<Invitation>(`/evaluators/invitations/token/${token}`),
    enabled: !!token,
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () =>
      api.post(`/evaluators/invitations/token/${token}/accept`, {
        ...(invitation?.hasAccount ? {} : { password, name: (name || invitation?.name) ?? '' }),
      }),
    onSuccess: () => {
      router.replace(`/login?invited=1&email=${encodeURIComponent(invitation?.email ?? '')}`);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not accept the invitation. Please try again.'),
  });

  const card = 'relative w-full max-w-md bg-white rounded-3xl border border-black/[0.06] shadow-2xl shadow-black/40 p-6 sm:p-8 z-10 text-left space-y-6 animate-scaleUp';

  if (!token || loadError) {
    const message =
      loadError instanceof ApiError
        ? loadError.message
        : 'This invitation link is not valid. Ask an administrator to send a new one.';
    return (
      <div className={card}>
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-crimson-600 shrink-0" />
          <div className="space-y-1">
            <h1 className="text-lg font-extrabold text-navy-950">This invitation can&apos;t be used</h1>
            <p className="text-sm text-navy-600">{message}</p>
          </div>
        </div>
        <Link href="/login" className="block text-center text-sm font-semibold text-crimson-600 hover:text-crimson-700">
          Go to sign in
        </Link>
      </div>
    );
  }

  if (isLoading || !invitation) {
    return <div className="text-sm text-navy-300 font-mono animate-pulse z-10">Checking your invitation…</div>;
  }

  const needsPassword = !invitation.hasAccount;
  const canSubmit = !needsPassword || (password.length >= 8 && (name || invitation.name).trim().length >= 2);

  return (
    <div className={card}>
      <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-crimson-500/50 to-transparent" />
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <div className="bg-white p-2.5 rounded-2xl shadow-md shadow-black/5 border border-black/[0.05] flex items-center justify-center">
            <DojoHubLogo size={56} />
          </div>
        </div>
        <h1 className="text-2xl font-extrabold text-navy-950 tracking-tight text-balance">
          {needsPassword ? 'Set your password' : 'Accept evaluator access'}
        </h1>
        <p className="text-sm text-navy-500">
          {needsPassword
            ? `You've been invited to review student work on Dojo Hub Learning Platform.`
            : `Your existing account keeps the same email address and password — this adds the evaluator workspace to it.`}
        </p>
      </div>

      <div className="rounded-2xl border border-navy-200 bg-navy-50/70 p-4 space-y-2.5">
        <p className="flex items-center gap-2 text-sm">
          <ShieldCheck className="w-4 h-4 text-crimson-600 shrink-0" />
          <span className="font-semibold text-navy-950 truncate">{invitation.email}</span>
        </p>
        <div className="flex items-start gap-2 text-sm">
          <BookOpen className="w-4 h-4 text-crimson-600 shrink-0 mt-0.5" />
          <span className="text-navy-700">
            {invitation.courses.length > 0 ? (
              <>
                You&apos;ll review:{' '}
                <span className="font-semibold text-navy-950">
                  {invitation.courses.map((c) => c.title).join(', ')}
                </span>
              </>
            ) : (
              'No course assigned yet — an administrator will add one.'
            )}
          </span>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3.5 bg-crimson-50 border border-crimson-200 text-crimson-700 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          accept.mutate();
        }}
      >
        {needsPassword && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="invite-name" className="text-xs font-mono uppercase tracking-wider font-bold text-navy-500 block">
                Full Name
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-navy-400 pointer-events-none">
                  <User className="w-[18px] h-[18px]" />
                </span>
                <input
                  id="invite-name"
                  value={name || invitation.name}
                  onChange={(e) => setName(e.target.value)}
                  className="input input-icon bg-navy-50"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="invite-password" className="text-xs font-mono uppercase tracking-wider font-bold text-navy-500 block">
                Choose a Password
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-navy-400 pointer-events-none">
                  <Lock className="w-[18px] h-[18px]" />
                </span>
                <PasswordInput
                  id="invite-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input input-icon bg-navy-50"
                  placeholder="Minimum 8 characters"
                />
              </div>
            </div>
          </>
        )}

        <Button type="submit" loading={accept.isPending} disabled={!canSubmit} className="w-full py-3.5 text-base">
          <span>{needsPassword ? 'Create my account' : 'Accept and continue'}</span>
          <ArrowRight className="w-[18px] h-[18px]" />
        </Button>
        <p className="text-xs text-navy-400 text-center">
          Didn&apos;t expect this invitation? You can close this page and nothing will change.
        </p>
      </form>
    </div>
  );
}
