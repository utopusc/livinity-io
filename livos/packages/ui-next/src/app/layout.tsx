import type { Metadata, Viewport } from 'next';
import { Toaster } from '@/components/ui/toast';
import { Providers } from './providers';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'LivOS',
  description: 'AI-powered home server',
  icons: { icon: '/favicon.ico' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f5f5f7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-dvh antialiased">
        <Providers>
          {children}
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
