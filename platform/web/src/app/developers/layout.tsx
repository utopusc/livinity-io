import type { Metadata } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import '../store/store.css';
import './developers.css';

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
  title: 'Developers · Livinity',
  description:
    'Build plugins for LivOS — Plugin SDK reference, manifest spec, and submission flow.',
};

export default function DevelopersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable} dev-root`}
      style={
        {
          ['--sans' as string]:
            'var(--font-sans), -apple-system, BlinkMacSystemFont, "Helvetica Neue", system-ui, sans-serif',
          ['--mono' as string]:
            'var(--font-mono), ui-monospace, Menlo, monospace',
          ['--serif' as string]:
            'var(--font-serif), "New York", Georgia, serif',
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
