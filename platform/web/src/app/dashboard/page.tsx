'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  userId: string;
  username: string;
  email: string;
  emailVerified: boolean;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (!data.user) {
          router.push('/login');
          return;
        }
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => {
        router.push('/login');
      });
  }, [router]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Livinity</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-500">{user?.username}</span>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {!user?.emailVerified && (
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900 dark:bg-yellow-950">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Please verify your email address. Check your inbox for a verification link.
            </p>
          </div>
        )}

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Dashboard</h2>
          <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
            <p><span className="font-medium text-zinc-900 dark:text-zinc-50">Username:</span> {user?.username}</p>
            <p><span className="font-medium text-zinc-900 dark:text-zinc-50">Email:</span> {user?.email}</p>
            <p><span className="font-medium text-zinc-900 dark:text-zinc-50">Your URL:</span> https://{user?.username}.livinity.io</p>
            <p>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">Email verified:</span>{' '}
              {user?.emailVerified ? 'Yes' : 'No — check your inbox'}
            </p>
          </div>
          <p className="mt-6 text-sm text-zinc-400">API key management and server status will be added in Phase 12.</p>
        </div>
      </main>
    </div>
  );
}
