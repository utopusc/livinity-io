'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminGate } from './admin-gate';

type NavItem = { href: string; label: string; exact?: boolean };

const NAV_OVERVIEW: NavItem[] = [
  { href: '/admin', label: 'Dashboard', exact: true },
];

const NAV_CATALOG: NavItem[] = [
  { href: '/admin/apps', label: 'Apps' },
  { href: '/admin/store', label: 'Store' },
];

const NAV_OPERATIONS: NavItem[] = [
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/tunnels', label: 'Tunnels' },
  { href: '/admin/walkthrough', label: 'Walkthrough' },
];

function NavLinks({ items, pathname }: { items: NavItem[]; pathname: string | null }) {
  return (
    <>
      {items.map((n) => {
        const active = n.exact ? pathname === n.href : pathname?.startsWith(n.href);
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
    </>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <AdminGate>
      <div className="admin-shell">
        <aside className="admin-side">
          <Link href="/admin" className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <span>Livinity</span>
            <span className="brand-crumb">Admin</span>
          </Link>

          <div className="admin-side-label">Overview</div>
          <NavLinks items={NAV_OVERVIEW} pathname={pathname} />

          <div className="admin-side-label">Catalog</div>
          <NavLinks items={NAV_CATALOG} pathname={pathname} />

          <div className="admin-side-label">Operations</div>
          <NavLinks items={NAV_OPERATIONS} pathname={pathname} />

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
