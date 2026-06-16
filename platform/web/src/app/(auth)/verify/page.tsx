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
  // sessionMode = true → there's a logged-in (legacy) unverified user, so the
  // resend uses the session. false → new signup, no session yet: resend by email.
  const [sessionMode, setSessionMode] = useState(false);
  // knownEmail = false → we couldn't recover the signup email (no session, no
  // sessionStorage, e.g. the tab was reopened) → show an email input to resend
  // rather than dead-ending at /login (a pending signup has no users row yet).
  const [knownEmail, setKnownEmail] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  // Branch 1: token in URL → verify it. On success the server creates the user
  // (new signups) and sets the session cookie, so we land on /pricing logged in.
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
          try {
            sessionStorage.removeItem('liv_pending_email');
          } catch {
            /* ignore */
          }
          setStatus('success');
          // Phase 274: pick a username before pricing. The new user row has
          // username=NULL; /username claims it, then routes on to /pricing.
          setTimeout(() => router.push('/username'), 1500);
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

  // Branch 2: no token → "check your email" pending state. Two sources:
  //   (a) a logged-in legacy user who isn't verified yet (session resend), or
  //   (b) a brand-new signup with NO session — email comes from sessionStorage
  //       (set by the register page) and resend goes by email.
  useEffect(() => {
    if (token) return;

    function fallbackToPending() {
      let pendingEmail: string | null = null;
      try {
        pendingEmail = sessionStorage.getItem('liv_pending_email');
      } catch {
        /* sessionStorage unavailable */
      }
      setSessionMode(false);
      if (pendingEmail) {
        setEmail(pendingEmail);
        setKnownEmail(true);
      } else {
        // No session and no stored email — still show the pending screen and
        // ask for the email so the user can resend, instead of bouncing to a
        // /login that can't authenticate a not-yet-created (pending) account.
        setEmail('');
        setKnownEmail(false);
      }
      setStatus('pending');
    }

    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.user) {
          if (data.user.emailVerified) {
            // Already verified — let the dashboard's billing redirect decide.
            router.push('/dashboard');
            return;
          }
          setEmail(data.user.email);
          setKnownEmail(true);
          setSessionMode(true);
          setStatus('pending');
          return;
        }
        fallbackToPending();
      })
      .catch(fallbackToPending);
  }, [token, router]);

  async function handleResend() {
    if (!sessionMode && !email) {
      setResendMsg('Enter your email to resend the verification link.');
      return;
    }
    setResending(true);
    setResendMsg(null);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        // Session mode: no body → server uses the session. New-signup mode:
        // identify the pending row by email.
        body: sessionMode ? undefined : JSON.stringify({ email }),
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

          {knownEmail ? (
            <>
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
            </>
          ) : (
            <>
              <p className="mb-4 text-sm text-zinc-500">We sent you a verification link. Didn&apos;t get it? Enter your email and we&apos;ll resend it.</p>
              <input
                type="email"
                placeholder="you@example.com"
                value={email ?? ''}
                onChange={(e) => setEmail(e.target.value)}
                className="mb-3 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              />
              <button
                onClick={handleResend}
                disabled={resending || !email}
                className="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {resending ? 'Sending…' : 'Send verification link'}
              </button>
            </>
          )}

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
