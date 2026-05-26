'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '../admin-shell';
import { listAdminUsers, type AdminUserRow } from '../lib/admin-api';

const PAGE_SIZE = 50;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function relative(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return formatDate(iso);
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextOffset: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAdminUsers({ limit: PAGE_SIZE, offset: nextOffset });
      setUsers(res.users);
      setTotal(res.total);
      setOffset(res.offset);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(0);
  }, [load]);

  const hasPrev = offset > 0;
  const hasNext = offset + users.length < total;

  return (
    <AdminShell>
      <div className="admin-page">
        <header className="admin-page-head">
          <h1>Users</h1>
          <p className="admin-page-sub">
            {total} total · showing {offset + 1}–{offset + users.length}
          </p>
        </header>

        {error ? <p style={{ color: 'var(--red)' }}>Error: {error}</p> : null}
        {loading ? <p style={{ color: 'var(--fg-mute)' }}>Loading…</p> : null}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
                <th>Last seen</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link href={`/admin/users/${u.id}`} className="admin-table-link">
                      {u.username}
                    </Link>
                  </td>
                  <td>{u.email ?? '—'}</td>
                  <td>
                    {u.is_admin ? (
                      <span className="badge badge-green">admin</span>
                    ) : (
                      <span className="badge">user</span>
                    )}
                  </td>
                  <td>{formatDate(u.created_at)}</td>
                  <td>{relative(u.last_seen_at)}</td>
                  <td>
                    <Link href={`/admin/users/${u.id}`} className="admin-table-action">
                      Details →
                    </Link>
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--fg-mute)' }}>
                    No users.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <nav className="admin-pagination">
          <button
            type="button"
            className="admin-btn"
            disabled={!hasPrev || loading}
            onClick={() => load(Math.max(0, offset - PAGE_SIZE))}
          >
            ← Previous
          </button>
          <button
            type="button"
            className="admin-btn"
            disabled={!hasNext || loading}
            onClick={() => load(offset + PAGE_SIZE)}
          >
            Next →
          </button>
        </nav>
      </div>
    </AdminShell>
  );
}
