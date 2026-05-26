'use client';

// Lightweight gate: requires ?token=... in the URL (re-uses the same
// api-key the store uses). Persists into sessionStorage so deeper routes
// can pick it up. Renders children only after a token is present.

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

const TOKEN_KEY = 'livinity_admin_token';

export function useAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

function AdminGateInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  // CARRY-P213-NON-ADMIN-REDIRECT-CLIENT — verify is_admin via /api/admin/whoami
  // after a token is set. Non-admin → redirect to /dashboard.
  const [adminVerified, setAdminVerified] = useState<'idle' | 'checking' | 'admin' | 'denied'>('idle');

  useEffect(() => {
    // Persist token from URL if present, then strip it from the visible URL.
    const urlToken = searchParams.get('token');
    if (urlToken) {
      sessionStorage.setItem(TOKEN_KEY, urlToken);
      setToken(urlToken);
      // Clean URL — remove token from query string but keep pathname.
      router.replace(pathname);
      return;
    }
    const stored = sessionStorage.getItem(TOKEN_KEY);
    if (stored) setToken(stored);
  }, [searchParams, router, pathname]);

  // Probe admin status whenever the token changes.
  useEffect(() => {
    if (!token) {
      setAdminVerified('idle');
      return;
    }
    setAdminVerified('checking');
    let cancelled = false;
    fetch('/api/admin/whoami', {
      headers: { 'X-Api-Key': token },
      credentials: 'same-origin',
    })
      .then((res) => {
        if (cancelled) return;
        if (res.status === 403) {
          // Authenticated but not admin → bounce to dashboard.
          setAdminVerified('denied');
          router.replace('/dashboard');
          return;
        }
        if (!res.ok) {
          // 401 (bad token) — clear sessionStorage so the prompt re-appears.
          sessionStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setAdminVerified('idle');
          return;
        }
        setAdminVerified('admin');
      })
      .catch(() => {
        if (cancelled) return;
        // Network failure — leave gate as-is, user can retry.
        setAdminVerified('idle');
      });
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (token && adminVerified === 'checking') {
    return (
      <div className="gate">
        <div className="gate-card">
          <p className="gate-desc" style={{ margin: 0 }}>Verifying admin access…</p>
        </div>
      </div>
    );
  }

  if (token && adminVerified === 'denied') {
    return (
      <div className="gate">
        <div className="gate-card">
          <p className="gate-desc" style={{ margin: 0 }}>
            Not authorized. Redirecting to dashboard…
          </p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="admin-ph-eyebrow">Restricted</div>
          <h1 className="gate-title">
            Operator <em>only</em>
          </h1>
          <p className="gate-desc">
            This panel manages the LivOS Store catalog. Paste your operator
            api-key to continue. Same key the store uses.
          </p>
          <input
            type="password"
            className="form-input"
            placeholder="liv_k_..."
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && manualInput.trim()) {
                sessionStorage.setItem(TOKEN_KEY, manualInput.trim());
                setToken(manualInput.trim());
              }
            }}
            autoFocus
          />
          <div className="form-actions">
            <button
              className="btn primary"
              type="button"
              onClick={() => {
                if (manualInput.trim()) {
                  sessionStorage.setItem(TOKEN_KEY, manualInput.trim());
                  setToken(manualInput.trim());
                }
              }}
            >
              Enter
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function AdminGate({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AdminGateInner>{children}</AdminGateInner>
    </Suspense>
  );
}
