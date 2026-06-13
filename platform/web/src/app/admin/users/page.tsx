'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminShell } from '../admin-shell';
import { StatusBadge } from '../components/charts';
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

  // Search: `q` is the live input value; `query` is the debounced term that
  // actually drives the fetch. Keep them separate so typing doesn't fire a
  // request per keystroke.
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');

  // Track the latest in-flight request so stale responses can't clobber newer
  // ones (e.g. fast typing or rapid pagination).
  const reqSeq = useRef(0);

  const load = useCallback(
    async (nextOffset: number, term: string) => {
      const seq = ++reqSeq.current;
      setLoading(true);
      setError(null);
      try {
        const res = await listAdminUsers({ limit: PAGE_SIZE, offset: nextOffset, q: term });
        if (seq !== reqSeq.current) return; // superseded
        setUsers(res.users);
        setTotal(res.total);
        setOffset(res.offset);
      } catch (err) {
        if (seq !== reqSeq.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (seq === reqSeq.current) setLoading(false);
      }
    },
    [],
  );

  // Debounce the search box → commit into `query` after a short pause.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // A new (debounced) query always resets to the first page.
  useEffect(() => {
    void load(0, query);
  }, [load, query]);

  const hasPrev = offset > 0;
  const hasNext = offset + users.length < total;

  return (
    <AdminShell>
      <div className="admin-page">
        <header className="admin-page-head">
          <h1>Users</h1>
          <p className="admin-page-sub">
            {total} total · showing {users.length === 0 ? 0 : offset + 1}–{offset + users.length}
            {query ? ` · filtered by “${query}”` : ''}
          </p>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(q.trim());
          }}
          style={{ marginBottom: 14, display: 'flex', gap: 8, maxWidth: 420 }}
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search username or email…"
            aria-label="Search users"
            spellCheck={false}
            autoComplete="off"
            style={{
              flex: 1,
              background: 'var(--bg)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r-sm)',
              padding: '8px 12px',
              fontSize: 13,
              color: 'var(--fg)',
              fontFamily: 'inherit',
            }}
          />
          {q ? (
            <button type="button" className="admin-btn" onClick={() => setQ('')}>
              Clear
            </button>
          ) : null}
        </form>

        {error ? <p style={{ color: 'var(--red)' }}>Error: {error}</p> : null}
        {loading ? <p style={{ color: 'var(--fg-mute)' }}>Loading…</p> : null}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Plan</th>
                <th>Created</th>
                <th>Last seen</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Link href={`/admin/users/${u.id}`} className="admin-table-link">
                        {u.username}
                      </Link>
                      {u.is_admin ? <span className="badge badge-green">admin</span> : null}
                      {u.suspended ? <span className="badge badge-red">suspended</span> : null}
                    </span>
                  </td>
                  <td>{u.email ?? '—'}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <StatusBadge
                        status={u.subscription_status}
                        legacyFree={u.legacy_free}
                        revoked={u.suspended}
                      />
                    </span>
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
                    {query ? `No users match “${query}”.` : 'No users.'}
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
            onClick={() => load(Math.max(0, offset - PAGE_SIZE), query)}
          >
            ← Previous
          </button>
          <button
            type="button"
            className="admin-btn"
            disabled={!hasNext || loading}
            onClick={() => load(offset + PAGE_SIZE, query)}
          >
            Next →
          </button>
        </nav>
      </div>
    </AdminShell>
  );
}
