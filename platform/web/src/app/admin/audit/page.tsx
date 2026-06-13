'use client';

// PAGE F (ws=PageAudit) — global admin-action audit log at /admin/audit.
// Reads GET /api/admin/audit (getAuditLog) which returns [] when the
// admin_actions table has not been created yet, so the empty state doubles
// as the "schema not applied" state. Pure read-only view: When / Action /
// Admin / Target / Detail.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminShell } from '../admin-shell';
import { getAuditLog, type AdminActionRow } from '../lib/admin-api';
import { formatDate, timeAgo } from '../components/format';

const LIMIT = 100;

// snake_case action → human-readable label. Falls back to a Title-cased
// version of the raw action so unknown/future actions still render sensibly.
const ACTION_LABELS: Record<string, string> = {
  grant_comp: 'Granted comp',
  remove_comp: 'Removed comp',
  revoke: 'Revoked access',
  restore: 'Restored access',
  cancel_subscription: 'Cancelled subscription',
  resume_subscription: 'Resumed subscription',
  make_admin: 'Made admin',
  remove_admin: 'Removed admin',
  verify_email: 'Verified email',
  suspend: 'Suspended',
  unsuspend: 'Unsuspended',
  set_note: 'Set note',
  delete_user: 'Deleted user',
};

function humanizeAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  if (!action) return '—';
  return action
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// Compact one-line JSON of the detail blob, truncated so a fat payload
// doesn't blow out the table row.
function formatDetail(detail: unknown): string {
  if (detail == null) return '—';
  let str: string;
  try {
    str = typeof detail === 'string' ? detail : JSON.stringify(detail);
  } catch {
    return '—';
  }
  if (str === '{}' || str === '""' || str === 'null') return '—';
  const MAX = 120;
  return str.length > MAX ? `${str.slice(0, MAX - 1)}…` : str;
}

export default function AdminAuditPage() {
  const [actions, setActions] = useState<AdminActionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAuditLog({ limit: LIMIT })
      .then((res) => {
        if (cancelled) return;
        setActions(res.actions);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminShell>
      <div className="admin-page">
        <header className="admin-page-head">
          <h1>Audit log</h1>
          <p className="admin-page-sub">Admin actions</p>
        </header>

        {error ? <p style={{ color: 'var(--red)' }}>Error: {error}</p> : null}
        {loading ? <p style={{ color: 'var(--fg-mute)' }}>Loading…</p> : null}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Admin</th>
                <th>Target</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id}>
                  <td title={formatDate(a.created_at)}>{timeAgo(a.created_at)}</td>
                  <td>{humanizeAction(a.action)}</td>
                  <td>{a.admin_username ?? '—'}</td>
                  <td>
                    {a.target_user_id ? (
                      <Link
                        href={`/admin/users/${a.target_user_id}`}
                        className="admin-table-link"
                      >
                        {a.target_username ?? a.target_user_id}
                      </Link>
                    ) : (
                      a.target_username ?? '—'
                    )}
                  </td>
                  <td>
                    <code
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 11,
                        color: 'var(--fg-mute)',
                      }}
                    >
                      {formatDetail(a.detail)}
                    </code>
                  </td>
                </tr>
              ))}
              {!loading && actions.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: 'center', color: 'var(--fg-mute)' }}
                  >
                    No admin actions recorded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
