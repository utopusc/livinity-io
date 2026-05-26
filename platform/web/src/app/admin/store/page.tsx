import Link from 'next/link';
import { AdminShell } from '../admin-shell';

export default function AdminStorePlaceholderPage() {
  return (
    <AdminShell>
      <div className="admin-page">
        <header className="admin-page-head">
          <h1>Store admin</h1>
          <p className="admin-page-sub">
            Real implementation lives in Phase 214 (store admin-only gate + UX polish).
          </p>
        </header>

        <div className="admin-empty">
          <strong>Coming in Phase 214.</strong>
          <p>
            This page will host the admin-only store catalog with install management. For now,
            head to <Link href="/admin/apps">Apps</Link> to manage the catalog directly, or open{' '}
            <a href="/store" target="_blank" rel="noreferrer">the public store</a> for a preview.
          </p>
        </div>
      </div>
    </AdminShell>
  );
}
