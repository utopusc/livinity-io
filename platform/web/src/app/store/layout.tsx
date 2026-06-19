import type { Metadata } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import { StoreShell } from './store-shell';
import { StoreAdminGate } from './admin-gate';
import { prefetchApps } from './lib/prefetch-apps';
import './store.css';

// Phase 289 WS-B — the store catalog is per-token (read from the
// `liv_store_token` cookie in the RSC prefetch below), so this route can never
// be statically optimized. force-dynamic guarantees the server prefetch runs
// per request instead of being baked at build time.
export const dynamic = 'force-dynamic';

// Livinity Design System typography. CSS variables consumed via store.css
// (`var(--sans|--mono|--serif)`) — keep names in sync with that file.
const geist = Geist({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
});
const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
});

export const metadata: Metadata = {
  title: 'App Store | Livinity',
  description: 'Browse and install self-hosted apps for your LivOS server.',
};

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Phase 289 WS-B — server-prefetch the catalog so the store paints the real
  // app list on first render (no "Soon"/"Coming in Phase X" flash). Layouts
  // cannot read searchParams in the Next App Router, so we rely on the
  // `liv_store_token` cookie: middleware.ts:56-66 persists the `?token=` from
  // the iframe's first load as that cookie ON THE SAME RESPONSE, so by the time
  // this RSC reads cookies() the token IS present for the request. If for any
  // reason it isn't (or the DB hiccups), prefetchApps() returns [] and the
  // client useEffect in store-provider.tsx (unchanged) fills in the catalog.
  const initialApps = await prefetchApps();

  return (
    <div
      className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
      style={{
        // Bridge next/font CSS vars onto the DS-token names declared in store.css.
        // store.css reads --sans/--mono/--serif; next/font emits --font-* — alias them.
        ['--sans' as string]: 'var(--font-sans), -apple-system, BlinkMacSystemFont, "Helvetica Neue", system-ui, sans-serif',
        ['--mono' as string]: 'var(--font-mono), ui-monospace, Menlo, monospace',
        ['--serif' as string]: 'var(--font-serif), "New York", Georgia, serif',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
      } as React.CSSProperties}
    >
      <StoreAdminGate>
        <StoreShell initialApps={initialApps}>{children}</StoreShell>
      </StoreAdminGate>
    </div>
  );
}
