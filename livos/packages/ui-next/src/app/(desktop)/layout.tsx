'use client';

import { EnsureLoggedIn } from '@/providers/auth-guard';

export default function DesktopLayout({ children }: { children: React.ReactNode }) {
  return <EnsureLoggedIn>{children}</EnsureLoggedIn>;
}
