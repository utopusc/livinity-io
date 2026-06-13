'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminShell } from '../admin-shell';
import { StatusBadge } from '../components/charts';
import { formatDate, timeAgo } from '../components/format';
import { listAdminUsers, type AdminUserRow } from '../lib/admin-api';

const PAGE_SIZE = 50;

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
          style={{ display: 'flex', gap: 8, maxWidth: 420 }}
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

        {error ? <p style={{ color: 'var(--red)', margin: 0 }}>Error: {error}</p> : null}
        {loading ? <p style={{ color: 'var(--fg-mute)', margin: 0 }}>Loading…</p> : null}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Plan / Status</th>
                <th>Joined</th>
                <th>Last seen</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isComp = u.plan_label === 'Comp';
                return (
                  <tr key={u.id}>
                    <td>
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="admin-table-link"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                      >
                        <span>{u.username}</span>
                        {u.is_admin ? <span className="badge badge-blue">admin</span> : null}
                        {u.suspended ? <span className="badge badge-red">suspended</span> : null}
                      </Link>
                      {u.email ? (
                        <div style={{ color: 'var(--fg-mute)', fontSize: 12, marginTop: 3 }}>{u.email}</div>
                      ) : null}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <StatusBadge
                          status={u.subscription_status}
                          legacyFree={u.legacy_free}
                          revoked={u.suspended}
                        />
                        {isComp ? <span className="badge badge-green">Comp</span> : null}
                      </span>
                    </td>
                    <td style={{ color: 'var(--fg-dim)', whiteSpace: 'nowrap' }}>
                      {formatDate(u.created_at)}
                    </td>
                    <td style={{ color: 'var(--fg-mute)', whiteSpace: 'nowrap' }}>
                      {timeAgo(u.last_seen_at ?? '')}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Link href={`/admin/users/${u.id}`} className="admin-table-action">
                        Details →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!loading && users.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--fg-mute)' }}>
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
