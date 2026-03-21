import type { Metadata } from 'next';
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
      </body>
    </html>
  );
}
