import type { Metadata } from 'next';
import { StoreShell } from './store-shell';

export const metadata: Metadata = {
  title: 'App Store | Livinity',
  description: 'Browse and install self-hosted apps for your LivOS server.',
};

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StoreShell>{children}</StoreShell>;
}
