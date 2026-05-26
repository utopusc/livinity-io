import type { Metadata } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import { StoreShell } from './store-shell';
import { StoreAdminGate } from './admin-gate';
import './store.css';

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

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
        <StoreShell>{children}</StoreShell>
      </StoreAdminGate>
    </div>
  );
}
