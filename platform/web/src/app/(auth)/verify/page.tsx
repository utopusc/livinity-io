'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function VerifyPage() {
  return (
    <Suspense fallback={<p className="text-center text-zinc-500">Loading...</p>}>
      <VerifyContent />
    </Suspense>
  );
}

type Status = 'loading' | 'pending' | 'success' | 'error';

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [email, setEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  // Branch 1: token in URL → verify it.
  useEffect(() => {
    if (!token) return;
    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStatus('success');
          // Billing-first onboarding: choose a plan before the install wizard.
          // (/dashboard/install re-checks billing and bounces back if skipped.)
          setTimeout(() => router.push('/pricing'), 1500);
        } else {
          setStatus('error');
          setError(data.error || 'Verification failed');
        }
      })
      .catch(() => {
        setStatus('error');
        setError('Something went wrong');
      });
  }, [token, router]);

  // Branch 2: no token → user just signed up; show "check your email" pending state.
  useEffect(() => {
    if (token) return;
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!data || !data.user) {
          router.push('/login');
          return;
        }
        if (data.user.emailVerified) {
          // Already verified — let the dashboard's billing redirect decide
          // between /pricing (no subscription) and the normal dashboard.
          router.push('/dashboard');
          return;
        }
        setEmail(data.user.email);
        setStatus('pending');
      })
      .catch(() => router.push('/login'));
  }, [token, router]);

  async function handleResend() {
    setResending(true);
    setResendMsg(null);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setResendMsg('Verification email re-sent — check your inbox.');
      } else {
        setResendMsg(data.error || 'Couldn\'t resend. Try again in a minute.');
      }
    } catch {
      setResendMsg('Network error. Try again.');
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {status === 'loading' && <p className="text-zinc-500">Verifying your email...</p>}

      {status === 'pending' && (
        <>
          <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Check your email</h2>
          <p className="mb-1 text-sm text-zinc-500">We sent a verification link to</p>
          <p className="mb-4 text-sm font-medium text-zinc-900 dark:text-zinc-50">{email}</p>
          <p className="mb-6 text-xs text-zinc-500">Click the link in the email to activate your account. You&apos;ll then pick a plan (3-day free trial) and get your install command.</p>
          <button
            onClick={handleResend}
            disabled={resending}
            className="text-sm font-medium text-zinc-900 hover:underline disabled:opacity-50 dark:text-zinc-50"
          >
            {resending ? 'Sending…' : 'Resend verification email'}
          </button>
          {resendMsg && <p className="mt-3 text-xs text-zinc-500">{resendMsg}</p>}
        </>
      )}

      {status === 'success' && (
        <>
          <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Email verified!</h2>
          <p className="mb-4 text-sm text-zinc-500">Redirecting to choose your plan…</p>
          <Link href="/pricing" className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50">
            Continue to pricing
          </Link>
        </>
      )}

      {status === 'error' && (
        <>
          <h2 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">Verification failed</h2>
          <p className="mb-4 text-sm text-zinc-500">{error}</p>
          <Link href="/login" className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50">
            Go to login
          </Link>
        </>
      )}
    </div>
  );
}
