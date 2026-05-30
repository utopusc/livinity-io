'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type MeResponse = {
  user: {
    userId: string;
    username: string;
    email: string;
    emailVerified: boolean;
    is_admin?: boolean;
  } | null;
};

export function StoreAdminGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'allowed'>('checking');

  useEffect(() => {
    let cancelled = false;
    // UAT 252: the embedded LivOS App Store iframe loads /store?token=<api_key>
    // — it carries no livinity.io session and is authenticated per-request at
    // /api/apps via X-Api-Key. Skip the admin-console is_admin check (which
    // would otherwise bounce the iframe to /dashboard) and render the store
    // directly when a token is present. The bare /store admin console (no
    // token) still runs the full is_admin gate below.
    const hasToken =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('token');
    if (hasToken) {
      setStatus('allowed');
      return;
    }
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          router.replace('/login?next=/store');
          return;
        }
        const body = (await res.json()) as MeResponse;
        if (!body.user) {
          router.replace('/login?next=/store');
          return;
        }
        if (!body.user.is_admin) {
          router.replace('/dashboard');
          return;
        }
        setStatus('allowed');
      })
      .catch(() => {
        if (cancelled) return;
        router.replace('/login?next=/store');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (status === 'checking') {
    return (
      <div
        style={{
          minHeight: '60vh',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--fg-mute)',
          fontSize: 14,
        }}
      >
        Checking access…
      </div>
    );
  }

  return <>{children}</>;
}
