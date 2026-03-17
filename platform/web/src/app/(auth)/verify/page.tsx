'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function VerifyPage() {
  return (
    <Suspense fallback={<p className="text-center text-zinc-500">Loading...</p>}>
      <VerifyContent />
    </Suspense>
  );
}

function VerifyContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No verification token provided');
      return;
    }

    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStatus('success');
        } else {
          setStatus('error');
          setError(data.error || 'Verification failed');
        }
      })
      .catch(() => {
        setStatus('error');
        setError('Something went wrong');
      });
  }, [token]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {status === 'loading' && <p className="text-zinc-500">Verifying your email...</p>}
      {status === 'success' && (
        <>
          <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Email verified!</h2>
          <p className="mb-4 text-sm text-zinc-500">Your account is now fully activated.</p>
          <Link href="/dashboard" className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50">
            Go to dashboard
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
