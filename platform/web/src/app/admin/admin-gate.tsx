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
