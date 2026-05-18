'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminGate } from './admin-gate';

const NAV = [
  { href: '/admin/apps', label: 'Apps' },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <AdminGate>
      <div className="admin-shell">
        <aside className="admin-side">
          <Link href="/admin/apps" className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <span>Livinity</span>
            <span className="brand-crumb">Admin</span>
          </Link>

          <div className="admin-side-label">Catalog</div>
          {NAV.map((n) => {
            const active = pathname?.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`admin-link${active ? ' is-active' : ''}`}
              >
                {n.label}
              </Link>
            );
          })}

          <div className="admin-side-label">External</div>
          <a href="/store" className="admin-link" target="_blank" rel="noreferrer">
            View store →
          </a>
        </aside>
        <main className="admin-main">{children}</main>
      </div>
    </AdminGate>
  );
}
