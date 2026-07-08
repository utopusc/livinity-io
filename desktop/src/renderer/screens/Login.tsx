/**
 * src/renderer/screens/Login.tsx
 *
 * AUTH-01 native dark login form (email + password), D-08's self-throttle
 * countdown (display-only -- the throttle window itself is enforced main-side
 * by auth.ipc.ts's module-level state, per T-02-05), D-04's external
 * forgot-password link, and the device-flow "Continue with Google" trigger
 * (device-flow pivot, D-16/D-18 -- UI-SPEC Amendment 2026-07-08).
 *
 * The retired embedded-browser OAuth window's companion copy must never
 * reappear here -- that flow (an earlier plan's Screen 2) is dead. Clicking
 * "Continue with Google" now registers a device grant, opens the system
 * default browser at a fixed livinity.io deep link, and shows the code +
 * waiting state in-card until the update subscription reports a terminal
 * phase (approved/expired/error/cancelled).
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
  const [device, setDevice] = useState<{ code: string } | null>(null);
  const [deviceError, setDeviceError] = useState<'expired' | 'error' | null>(null);

  // Clean up the countdown interval on unmount.
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Subscribe to device-flow login progress (device-flow pivot, D-16/D-18).
  // The code itself was already handed back by startDeviceLogin -- this
  // subscription only ever needs to react to a later phase change.
  useEffect(() => {
    const unsub = window.api.onDeviceLoginUpdate((u) => {
      if (u.phase === 'approved') {
        setDevice(null);
        setDeviceError(null);
        onRouted(u.route);
        return;
      }
      if (u.phase === 'expired') {
        setDevice(null);
        setDeviceError('expired');
        return;
      }
      if (u.phase === 'error') {
        setDevice(null);
        setDeviceError('error');
        return;
      }
      if (u.phase === 'cancelled') {
        // A cancel is not a fault -- clear silently, no error copy.
        setDevice(null);
        setDeviceError(null);
        return;
      }
      // 'waiting' -- no-op, the code is already shown in-card.
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function handleGoogleClick(): Promise<void> {
    setDeviceError(null);
    const r = await window.api.startDeviceLogin();
    if (r.ok) {
      setDevice({ code: r.userCode });
      return;
    }
    if (r.reason === 'network') {
      setDeviceError('error');
    }
    // 'already_running' -- no-op, a flow is already waiting in-card.
  }

  async function handleCancelDeviceLogin(): Promise<void> {
    await window.api.cancelDeviceLogin();
    setDevice(null);
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

      {device ? (
        <div aria-live="polite" aria-busy="true">
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <span className="value-chip">{device.code}</span>
          </div>
          <p className="note-line">Approve in your browser…</p>
          <p className="note-line">
            We opened livinity.io in your browser — sign in there and enter this code.
          </p>
          <button type="button" className="btn btn-block" onClick={handleCancelDeviceLogin}>
            Cancel
          </button>
        </div>
      ) : (
        <>
          {deviceError === 'expired' && <p className="error-line">That code expired. Try again.</p>}
          {deviceError === 'error' && (
            <p className="error-line">Couldn&apos;t complete Google sign-in. Please try again.</p>
          )}
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
        </>
      )}
    </section>
  );
}
