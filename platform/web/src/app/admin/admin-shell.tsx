'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminGate } from './admin-gate';

const TOKEN_KEY = 'livinity_admin_token';

async function handleLogout(): Promise<void> {
  // Best-effort server-side session revoke (ignore network errors).
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {
    // proceed regardless
  }
  // Clear the legacy api-key cache.
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(TOKEN_KEY);
  }
  // Force a full reload so middleware sees the empty cookie + fresh state.
  window.location.assign('/login');
}

type NavItem = { href: string; label: string; exact?: boolean };

const NAV_OVERVIEW: NavItem[] = [
  { href: '/admin', label: 'Dashboard', exact: true },
];

const NAV_INSIGHTS: NavItem[] = [
  { href: '/admin/billing', label: 'Billing' },
  { href: '/admin/analytics', label: 'Analytics' },
];

const NAV_CATALOG: NavItem[] = [
  { href: '/admin/apps', label: 'Apps' },
  { href: '/admin/store', label: 'Store' },
];

const NAV_CONTENT: NavItem[] = [
  { href: '/admin/docs', label: 'Docs' },
  { href: '/admin/announcements', label: 'Announcements' },
];

const NAV_OPERATIONS: NavItem[] = [
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/abuse', label: 'Abuse' },
  { href: '/admin/feedback', label: 'Feedback' },
  { href: '/admin/audit', label: 'Audit' },
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

          <div className="admin-side-label">Insights</div>
          <NavLinks items={NAV_INSIGHTS} pathname={pathname} />

          <div className="admin-side-label">Catalog</div>
          <NavLinks items={NAV_CATALOG} pathname={pathname} />

          <div className="admin-side-label">Content</div>
          <NavLinks items={NAV_CONTENT} pathname={pathname} />

          <div className="admin-side-label">Operations</div>
          <NavLinks items={NAV_OPERATIONS} pathname={pathname} />

          <div className="admin-side-label">External</div>
          <a href="/store" className="admin-link" target="_blank" rel="noreferrer">
            View store →
          </a>

          <div className="admin-side-foot">
            <button
              type="button"
              className="admin-link admin-link-logout"
              onClick={() => void handleLogout()}
            >
              Log out
            </button>
          </div>
        </aside>
        <main className="admin-main">{children}</main>
      </div>
    </AdminGate>
  );
}
