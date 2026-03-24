import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Download Livinity Agent — Control Your PC from Anywhere',
  description:
    'Download the Livinity Agent for Windows, macOS, or Linux. Install in under a minute and control your PC from anywhere with AI.',
  openGraph: {
    title: 'Download Livinity Agent',
    description:
      'Download the Livinity Agent for Windows, macOS, or Linux. Control your PC from anywhere with AI.',
    url: 'https://livinity.io/download',
    siteName: 'Livinity',
    type: 'website',
  },
};

export default function DownloadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
