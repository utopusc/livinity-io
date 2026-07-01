import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Livinity — Your Personal AI Server, Accessible Anywhere',
  description:
    'Install LivOS on any machine and access it from anywhere via livinity.io. AI assistant, app store, multi-user — all self-hosted.',
  openGraph: {
    title: 'Livinity — Your Personal AI Server, Accessible Anywhere',
    description:
      'Install LivOS on any machine and access it from anywhere. AI assistant, app store, multi-user — all self-hosted.',
    url: 'https://livinity.io',
    siteName: 'Livinity',
    type: 'website',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
