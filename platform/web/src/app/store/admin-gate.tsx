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
