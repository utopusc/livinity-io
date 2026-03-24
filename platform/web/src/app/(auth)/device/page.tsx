'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const PLATFORM_LABELS: Record<string, string> = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
};

export default function DeviceApprovePage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [approved, setApproved] = useState<{
    deviceName: string;
    platform: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check authentication on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          router.push('/login?redirect=/device');
          return;
        }
      } catch {
        router.push('/login?redirect=/device');
        return;
      }
      setCheckingAuth(false);
    }
    checkAuth();
  }, [router]);

  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value.length > 8) value = value.slice(0, 8);
    if (value.length > 4) {
      value = value.slice(0, 4) + '-' + value.slice(4);
    }
    setCode(value);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const stripped = code.replace(/-/g, '');
    if (stripped.length !== 8) {
      setError('Please enter a complete 8-character code.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/device/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_code: code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to approve device');
        return;
      }

      setApproved({
        deviceName: data.deviceName,
        platform: data.platform,
      });
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-50" />
        </div>
      </div>
    );
  }

  if (approved) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col items-center space-y-4 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <svg
              className="h-6 w-6 text-green-600 dark:text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Device Approved
          </h2>
          <div className="text-center text-sm text-zinc-600 dark:text-zinc-400">
            <p className="font-medium text-zinc-900 dark:text-zinc-50">
              {approved.deviceName}
            </p>
            <p className="mt-1">
              {PLATFORM_LABELS[approved.platform] || approved.platform}
            </p>
          </div>
          <p className="text-center text-xs text-zinc-500">
            The agent will connect automatically. You can close this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Approve Device
        </h2>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          Enter the code displayed by the Livinity agent on your device.
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          placeholder="XXXX-XXXX"
          value={code}
          onChange={handleCodeChange}
          maxLength={9}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-center text-2xl font-mono uppercase tracking-widest outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />

        <button
          type="submit"
          disabled={loading || code.replace(/-/g, '').length !== 8}
          className="mt-4 w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {loading ? 'Approving...' : 'Approve Device'}
        </button>
      </div>
    </form>
  );
}
