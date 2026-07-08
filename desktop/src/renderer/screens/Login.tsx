/**
 * src/renderer/screens/Login.tsx
 *
 * AUTH-01 native dark login form (email + password), D-08's self-throttle
 * countdown (display-only -- the throttle window itself is enforced main-side
 * by auth.ipc.ts's module-level state, per T-02-05), D-04's external
 * forgot-password link, and the "Continue with Google" outline button.
 *
 * The Google button's onClick is a PLACEHOLDER only. Per the 2026-07-08
 * UI-SPEC Amendment (D-16/D-18), the embedded-browser OAuth window is
 * retired -- the real behavior (device-flow trigger + in-card waiting state)
 * is wired into this same file by Plan 02-09, which adds new IPC methods
 * that do not exist yet at this plan's wave. This file must never reference
 * the old embedded-window flow.
 */

import { useEffect, useRef, useState } from 'react';
import type { RouteResult } from '../../../shared/ipc-contract';

interface LoginProps {
  onRouted: (route: RouteResult) => void;
  expired: boolean;
}

export default function Login({ onRouted, expired }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorText, setErrorText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up the countdown interval on unmount.
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function startCountdown(retryAfterMs: number): void {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setCountdown(Math.ceil(retryAfterMs / 1000));
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (countdown > 0 || submitting) return;

    setSubmitting(true);
    setErrorText('');
    try {
      const r = await window.api.authLogin(email, password);

      if (r.ok) {
        onRouted(r.route);
        return;
      }

      // The main process is the single source of truth for the throttle
      // window (T-02-05) -- this screen only ever displays the countdown it
      // was handed back, never computes or owns the delay itself.
      if (r.error === 'throttled' || r.retryAfterMs) {
        if (r.retryAfterMs) startCountdown(r.retryAfterMs);
      } else if (r.status === 401 || r.status === 400) {
        setErrorText('Invalid email or password.');
      } else {
        setErrorText("Couldn't reach Livinity. Check your connection and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleForgotPassword(): void {
    void window.api.authOpenExternal('reset-password');
  }

  function handleGoogleClick(): void {
    /* device-flow trigger + waiting state wired in Plan 02-09 (this file) */
  }

  const displayError = countdown > 0 ? `Too many attempts. Try again in ${countdown}s.` : errorText;
  const signInLabel = countdown > 0 ? `Try again in ${countdown}s` : 'Sign in';

  return (
    <section className="card">
      <h1 className="heading">Sign in to Livinity</h1>
      {expired && <p className="note-line">Your session expired — please sign in again.</p>}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label className="field-label" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            className="field-input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            className="field-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <p className="error-line" aria-live="polite">
          {displayError}
        </p>

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={countdown > 0 || submitting}
        >
          {signInLabel}
        </button>

        <div style={{ textAlign: 'right', marginTop: 8 }}>
          <button type="button" className="link-mute" onClick={handleForgotPassword}>
            Forgot password?
          </button>
        </div>
      </form>

      <div className="divider">or</div>

      <button type="button" className="btn btn-block" onClick={handleGoogleClick}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            d="M21 12a9 9 0 1 1-3.2-6.9M21 12h-7.5"
          />
        </svg>
        Continue with Google
      </button>
    </section>
  );
}
