'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AdminShell } from '../../admin-shell';
import { listAdminUsers, type AdminUserRow } from '../../lib/admin-api';

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params?.id ?? '';
  const [user, setUser] = useState<AdminUserRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    // Minimal lookup: scan the existing list endpoint. Full per-user query
    // is CARRY-P213-USERS-DRILLDOWN.
    listAdminUsers({ limit: 200, offset: 0 })
      .then((res) => {
        if (cancelled) return;
        const match = res.users.find((u) => u.id === userId);
        setUser(match ?? null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <AdminShell>
      <div className="admin-page">
        <header className="admin-page-head">
          <Link href="/admin/users" className="admin-back-link">
            ← Users
          </Link>
          <h1>User detail</h1>
        </header>

        {loading ? <p style={{ color: 'var(--fg-mute)' }}>Loading…</p> : null}
        {error ? <p style={{ color: 'var(--red)' }}>Error: {error}</p> : null}
        {!loading && !user ? (
          <p style={{ color: 'var(--fg-mute)' }}>
            User <code>{userId}</code> not found in the first 200 rows. Full per-user drill-down
            ships in CARRY-P213-USERS-DRILLDOWN.
          </p>
        ) : null}

        {user ? (
          <dl className="admin-detail">
            <dt>User ID</dt>
            <dd>
              <code>{user.id}</code>
            </dd>
            <dt>Username</dt>
            <dd>{user.username}</dd>
            <dt>Email</dt>
            <dd>{user.email ?? '—'}</dd>
            <dt>Role</dt>
            <dd>
              {user.is_admin ? (
                <span className="badge badge-green">admin</span>
              ) : (
                <span className="badge">user</span>
              )}
            </dd>
            <dt>Email verified</dt>
            <dd>{user.email_verified ? 'Yes' : 'No'}</dd>
            <dt>Created</dt>
            <dd>{new Date(user.created_at).toLocaleString('en-US')}</dd>
            <dt>Last seen</dt>
            <dd>{user.last_seen_at ? new Date(user.last_seen_at).toLocaleString('en-US') : 'Never'}</dd>
          </dl>
        ) : null}

        {user ? (
          <p className="admin-page-sub" style={{ marginTop: '2rem' }}>
            Full drill-down (per-user install history, bandwidth chart, tunnel session log) is
            tracked as CARRY-P213-USERS-DRILLDOWN.
          </p>
        ) : null}
      </div>
    </AdminShell>
  );
}
