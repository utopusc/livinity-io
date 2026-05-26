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
  // CARRY-P213-NON-ADMIN-REDIRECT-CLIENT — verify is_admin via /api/admin/whoami.
  // Two auth paths probed: (a) session cookie alone, (b) sessionStorage api-key.
  // 'idle' = not started, 'checking' = probe in flight, 'admin' = green, 'denied'
  // = authenticated but not admin (redirect /dashboard), 'needs-key' = no
  // session and no token → show api-key prompt.
  const [adminVerified, setAdminVerified] = useState<
    'idle' | 'checking' | 'admin' | 'denied' | 'needs-key'
  >('checking');

  useEffect(() => {
    // Persist token from URL if present, then strip it from the visible URL.
    const urlToken = searchParams.get('token');
    if (urlToken) {
      sessionStorage.setItem(TOKEN_KEY, urlToken);
      setToken(urlToken);
      router.replace(pathname);
      return;
    }
    const stored = sessionStorage.getItem(TOKEN_KEY);
    if (stored) setToken(stored);
  }, [searchParams, router, pathname]);

  // Probe admin status. Runs on mount AND when token changes.
  // Order: (1) try with X-Api-Key if token present, OR cookie-only if not.
  // (2) On 401 with token, clear token and retry as cookie-only.
  // (3) On 401 cookie-only AND no token → show api-key prompt.
  useEffect(() => {
    let cancelled = false;
    setAdminVerified('checking');

    async function probe() {
      const headers: Record<string, string> = {};
      if (token) headers['X-Api-Key'] = token;

      try {
        const res = await fetch('/api/admin/whoami', {
          headers,
          credentials: 'same-origin',
        });
        if (cancelled) return;

        if (res.status === 200) {
          setAdminVerified('admin');
          return;
        }
        if (res.status === 403) {
          // Authenticated but not admin → bounce to dashboard.
          setAdminVerified('denied');
          router.replace('/dashboard');
          return;
        }
        if (res.status === 401) {
          if (token) {
            // Bad api-key — clear it and retry as cookie-only by setting
            // token=null. The state change re-fires this effect.
            sessionStorage.removeItem(TOKEN_KEY);
            setToken(null);
            return;
          }
          // No session and no token → show the api-key prompt.
          setAdminVerified('needs-key');
          return;
        }
        // Any other status — fall back to idle / prompt.
        setAdminVerified('needs-key');
      } catch {
        if (cancelled) return;
        setAdminVerified('needs-key');
      }
    }

    void probe();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (adminVerified === 'checking') {
    return (
      <div className="gate">
        <div className="gate-card">
          <p className="gate-desc" style={{ margin: 0 }}>Verifying admin access…</p>
        </div>
      </div>
    );
  }

  if (adminVerified === 'denied') {
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

  if (adminVerified === 'needs-key') {
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
