'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const PLATFORM_LABELS: Record<string, string> = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
};

// Brand card surface — same recipe as the site's .card / .hey-liv components
// (bg-2 fill, hairline border, generous radius). See public/styles.css.
const CARD =
  'rounded-[22px] border border-[rgba(0,0,0,0.08)] bg-[#f5f5f7] p-8 dark:border-[rgba(255,255,255,0.10)] dark:bg-[#0a0a0c]';

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

  // Prefill the code from ?code= (deep-link from the desktop app), if present.
  // Prefill only — never auto-submit; the user still clicks "Approve Device"
  // (keeps the human-in-the-loop approval intact).
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('code');
    if (raw) {
      let v = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      if (v.length > 4) v = v.slice(0, 4) + '-' + v.slice(4);
      setCode(v);
    }
  }, []);

  // Check authentication on mount
  useEffect(() => {
    async function checkAuth() {
      // Preserve ?code= across the /login redirect bounce so a not-yet-signed-in
      // user lands back on a prefilled /device page instead of a bare one (D-17b).
      const back = '/device' + window.location.search;
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          router.push('/login?redirect=' + encodeURIComponent(back));
          return;
        }
      } catch {
        router.push('/login?redirect=' + encodeURIComponent(back));
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
      <div className={CARD}>
        <div className="flex items-center justify-center py-10">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[rgba(0,0,0,0.14)] border-t-[#1d1d1f] dark:border-[rgba(255,255,255,0.18)] dark:border-t-[#f5f5f7]" />
        </div>
      </div>
    );
  }

  if (approved) {
    return (
      <div className={CARD}>
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(22,163,74,0.10)] dark:bg-[rgba(74,222,128,0.15)]">
            <svg
              className="h-6 w-6 text-[#16a34a] dark:text-[#4ade80]"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#1d1d1f] dark:text-[#f5f5f7]">
            Device Approved
          </h2>
          <div className="text-sm text-[#6e6e73] dark:text-[#86868b]">
            <p className="font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
              {approved.deviceName}
            </p>
            <p className="mt-1">
              {PLATFORM_LABELS[approved.platform] || approved.platform}
            </p>
          </div>
          <p className="text-xs text-[#a1a1a6] dark:text-[#6e6e73]">
            The agent will connect automatically. You can close this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className={CARD}>
        <div className="mb-5 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[#6e6e73] dark:text-[#86868b]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#1d1d1f] dark:bg-[#f5f5f7]" />
          Device pairing
        </div>
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#1d1d1f] dark:text-[#f5f5f7]">
          Approve Device
        </h2>
        <p className="mb-6 mt-2 text-sm text-[#6e6e73] dark:text-[#86868b]">
          Enter the code displayed by the Livinity agent on your device.
        </p>

        {error && (
          <div className="mb-4 rounded-[10px] border border-[rgba(220,38,38,0.18)] bg-[rgba(220,38,38,0.07)] p-3 text-sm text-[#b91c1c] dark:border-[rgba(248,113,113,0.22)] dark:bg-[rgba(248,113,113,0.08)] dark:text-[#fca5a5]">
            {error}
          </div>
        )}

        <div className="relative rounded-xl border border-[rgba(0,0,0,0.08)] bg-white transition-colors focus-within:border-[#1d1d1f] focus-within:shadow-[0_0_0_4px_rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.10)] dark:bg-black dark:focus-within:border-[#f5f5f7] dark:focus-within:shadow-[0_0_0_4px_rgba(255,255,255,0.08)]">
          <span className="pointer-events-none absolute left-[18px] top-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#6e6e73] dark:text-[#86868b]">
            Code
          </span>
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
            className="w-full bg-transparent px-[18px] pb-3 pt-7 text-center font-mono text-2xl uppercase tracking-widest text-[#1d1d1f] outline-none placeholder:text-[#a1a1a6] dark:text-[#f5f5f7] dark:placeholder:text-[#48484a]"
          />
        </div>

        <button
          type="submit"
          disabled={loading || code.replace(/-/g, '').length !== 8}
          className="mt-3.5 w-full rounded-xl bg-[#1d1d1f] p-[15px] text-[15px] font-medium text-white transition-transform hover:-translate-y-px hover:opacity-90 disabled:translate-y-0 disabled:cursor-wait disabled:opacity-50 dark:bg-[#f5f5f7] dark:text-black"
        >
          {loading ? 'Approving...' : 'Approve Device'}
        </button>
      </div>
    </form>
  );
}
