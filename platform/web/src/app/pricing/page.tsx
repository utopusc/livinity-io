'use client';

// /pricing — Livinity Pro: $7.99/mo or $69.99/yr, 3-day free trial (card upfront).
// [Start free trial] → POST /api/stripe/checkout { interval } → Stripe-hosted
// Checkout. 401 → /register (not signed in), 409 → /dashboard (already subscribed).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check } from 'lucide-react';

const FEATURES = [
  'Your own {username}.livinity.io subdomain',
  'Secure Cloudflare Tunnel — no port forwarding',
  'One-line LivOS install on your own hardware',
  'App Store: self-host apps with one click',
  'Liv AI assistant built in',
  'Custom domains (up to 3)',
  'Remote access from anywhere',
];

type Interval = 'monthly' | 'yearly';

export default function PricingPage() {
  const router = useRouter();
  const [interval, setInterval] = useState<Interval>('monthly');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval }),
      });
      if (res.status === 401) {
        router.push('/register');
        return;
      }
      if (res.status === 409) {
        router.push('/dashboard');
        return;
      }
      const d = await res.json();
      if (res.ok && d.url) {
        window.location.href = d.url;
        return;
      }
      setError(d.error === 'Verify your email first'
        ? 'Please verify your email first, then come back to start your trial.'
        : d.error || 'Could not start checkout. Please try again.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setStarting(false);
    }
  }

  const isYearly = interval === 'yearly';

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Livinity</Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50">Sign in</Link>
            <Link href="/dashboard" className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-16">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Simple pricing
          </h1>
          <p className="mt-3 text-zinc-500">
            Try Livinity Pro free for 3 days. Cancel anytime — you won&apos;t be charged.
          </p>
        </div>

        {/* Monthly / Yearly toggle */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
            <button
              onClick={() => setInterval('monthly')}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                !isYearly
                  ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval('yearly')}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                isYearly
                  ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50'
              }`}
            >
              Yearly <span className={isYearly ? 'opacity-80' : 'text-emerald-600 dark:text-emerald-400'}>−27%</span>
            </button>
          </div>
        </div>

        {/* Plan card */}
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Livinity Pro</h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              3 days free
            </span>
          </div>

          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {isYearly ? '$69.99' : '$7.99'}
            </span>
            <span className="text-zinc-500">/{isYearly ? 'year' : 'month'}</span>
          </div>
          {isYearly && (
            <p className="mt-1 text-sm text-zinc-400">≈ $5.83/month — 2+ months free</p>
          )}

          <ul className="mt-6 space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-600 dark:text-zinc-300">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                {f}
              </li>
            ))}
          </ul>

          <button
            onClick={startCheckout}
            disabled={starting}
            className="mt-8 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {starting ? 'Redirecting…' : 'Start 3-day free trial'}
          </button>
          {error && <p className="mt-3 text-center text-sm text-red-600 dark:text-red-400">{error}</p>}

          <p className="mt-4 text-center text-xs text-zinc-400">
            Card required · {isYearly ? '$69.99/year' : '$7.99/month'} after the trial unless you cancel ·
            Cancel anytime from your dashboard
          </p>
        </div>
      </main>
    </div>
  );
}
