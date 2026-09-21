'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import DojoHubLogo from '@/components/DojoHubLogo';
import { PasswordInput } from '@/components/ui/PasswordInput';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

const ROLE_HOME: Record<string, string> = { STUDENT: '/home', EVALUATOR: '/queue', ADMIN: '/metrics' };

/**
 * Where to go after signing in. `next` carries the page someone was trying to reach —
 * a course they clicked "enrol" on, say — so they arrive back there instead of on a
 * dashboard, having lost what they came for.
 *
 * Only same-origin paths are honoured. A value starting with "//" is protocol-relative
 * and would send them to another site entirely, so it is rejected along with anything
 * that is not a plain path.
 */
function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null;
  return next;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  // Set when arriving straight from registration, so we can confirm the account was
  // created and save them retyping the address.
  const justRegistered = params.get('registered') === '1';
  const justReset = params.get('reset') === '1';
  const prefillEmail = params.get('email') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  // Only this specific failure is recoverable by re-sending a link.
  const needsVerification = Boolean(error && /confirm your email/i.test(error));
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    // Ticked by default, which is how signing in behaved before the choice existed.
    defaultValues: { email: prefillEmail, rememberMe: true },
  });

  const handleResend = async () => {
    setResendState('sending');
    try {
      await api.post('/auth/resend-verification', { email: getValues('email') });
    } catch {
      // The endpoint always reports success; treat any transport error as sent too,
      // so this never reveals whether an address has an account.
    }
    setResendState('sent');
  };

  const onSubmit = async (values: FormValues) => {
    setError(null);
    setResendState('idle');
    try {
      const user = await login(values.email, values.password, values.rememberMe);
      const next = safeNext(params.get('next'));
      // More than one role: pick a workspace first, carrying the destination along.
      if ((user.roles?.length ?? 0) > 1) {
        router.replace(`/choose-workspace${next ? `?next=${encodeURIComponent(next)}` : ''}`);
        return;
      }
      router.replace(next ?? ROLE_HOME[user.role] ?? '/home');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <div className="relative w-full max-w-md bg-white rounded-3xl border border-black/[0.06] shadow-2xl shadow-black/40 p-6 sm:p-8 z-10 text-left space-y-6 animate-scaleUp">
      <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-crimson-500/50 to-transparent" />
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <div className="bg-white p-2.5 rounded-2xl shadow-md shadow-black/5 border border-black/[0.05] flex items-center justify-center">
            <DojoHubLogo size={72} />
          </div>
        </div>
        <h1 className="text-2xl sm:text-[1.75rem] font-extrabold text-navy-950 tracking-tight leading-tight text-balance">
          Dojo Hub <span className="text-crimson-600">Learning Platform</span>
        </h1>
        <p className="text-sm text-navy-500 max-w-xs mx-auto">Sign in with your credentials to access your workspace</p>
      </div>

      {justReset && !error && (
        <div className="p-3.5 bg-green-50 border border-green-200 text-green-800 rounded-xl text-sm font-medium animate-fadeIn">
          Password updated. Sign in with your new password.
        </div>
      )}

      {justRegistered && !error && (
        <div className="p-3.5 bg-green-50 border border-green-200 text-green-800 rounded-xl text-sm font-medium animate-fadeIn">
          Account created. Check your email for a confirmation link — you&apos;ll need it before you can sign in.
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-crimson-50 border border-crimson-200 text-crimson-700 rounded-xl text-sm font-medium animate-fadeIn space-y-2">
          <p>{error}</p>
          {needsVerification && (
            <button
              type="button"
              onClick={handleResend}
              disabled={resendState === 'sending'}
              className="underline font-bold hover:text-crimson-900 disabled:opacity-60"
            >
              {resendState === 'sending' ? 'Sending…' : 'Send me a new confirmation link'}
            </button>
          )}
          {resendState === 'sent' && (
            <p className="text-green-700">Sent. Check your inbox for the new link.</p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs font-mono uppercase tracking-wider font-bold text-navy-500 block">Email Address</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-navy-400 pointer-events-none">
              <Mail className="w-[18px] h-[18px]" />
            </span>
            <input type="email" {...register('email')} className="input input-icon bg-navy-50" placeholder="e.g. alex.mercer@dojo.edu" />
          </div>
          {errors.email && <p className="text-xs text-crimson-600">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-mono uppercase tracking-wider font-bold text-navy-500 block">Password</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-navy-400 pointer-events-none">
              <Lock className="w-[18px] h-[18px]" />
            </span>
            <PasswordInput {...register('password')} className="input input-icon bg-navy-50" placeholder="••••••••" />
          </div>
          {errors.password && <p className="text-xs text-crimson-600">{errors.password.message}</p>}
          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-xs font-semibold text-navy-500 hover:text-crimson-600 transition-colors"
            >
              Forgot your password?
            </Link>
          </div>
        </div>

        {/* Unticked, the session ends with the browser — what someone on a shared or
            office computer expects when they just close the window. */}
        <div className="space-y-1">
          <label htmlFor="rememberMe" className="flex items-start gap-2.5 cursor-pointer">
            <input
              id="rememberMe"
              type="checkbox"
              {...register('rememberMe')}
              className="mt-0.5 w-4 h-4 accent-crimson-600 cursor-pointer"
            />
            <span className="text-sm font-semibold text-navy-700">Keep me signed in on this device</span>
          </label>
          <p className="text-xs text-navy-400 pl-[26px]">
            Leave this unticked on a shared computer — closing the browser will sign you out.
          </p>
        </div>

        <Button type="submit" loading={isSubmitting} className="w-full py-3.5 text-base">
          <span>Sign In</span>
          <ArrowRight className="w-[18px] h-[18px]" />
        </Button>
      </form>

      <div className="text-center pt-3 border-t border-black/[0.06]">
        <Link href="/register" className="link-sweep text-sm font-semibold text-crimson-600 hover:text-crimson-700">
          Don&apos;t have an account? Sign Up
        </Link>
      </div>
    </div>
  );
}
