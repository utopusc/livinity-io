'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '../admin-shell';
import { listTunnels, type AdminTunnelRow } from '../lib/admin-api';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'connected') return <span className="badge badge-green">connected</span>;
  if (status === 'disconnected') return <span className="badge">disconnected</span>;
  return <span className="badge badge-amber">{status}</span>;
}

export default function AdminTunnelsPage() {
  const [tunnels, setTunnels] = useState<AdminTunnelRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listTunnels({ limit: 100 })
      .then((res) => {
        if (cancelled) return;
        setTunnels(res.tunnels);
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
  }, []);

  return (
    <AdminShell>
      <div className="admin-page">
        <header className="admin-page-head">
          <h1>Tunnels</h1>
          <p className="admin-page-sub">
            Recent tunnel_connections rows from Supabase (newest 100).
          </p>
        </header>

        {error ? <p style={{ color: 'var(--red)' }}>Error: {error}</p> : null}
        {loading ? <p style={{ color: 'var(--fg-mute)' }}>Loading…</p> : null}

        {tunnels && tunnels.length === 0 ? (
          <div className="admin-empty">
            <strong>No tunnel sessions recorded yet.</strong>
            <p>
              This table is populated by the relay process when a Mini PC connects. As of Phase 212
              the wiring gap is documented in <code>.planning/phases/212-admin-panel-auth-data-model/HEARTBEAT-AUDIT.md</code>{' '}
              — fix carries are <code>CARRY-P212-TUNNEL-PERSIST</code> and <code>CARRY-V41-RELAY-DOWN</code>.
            </p>
          </div>
        ) : null}

        {tunnels && tunnels.length > 0 ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Status</th>
                  <th>Connected</th>
                  <th>Disconnected</th>
                  <th>Client version</th>
                  <th>Client IP</th>
                </tr>
              </thead>
              <tbody>
                {tunnels.map((t) => (
                  <tr key={t.id}>
                    <td>{t.username ?? <code>{t.user_id.slice(0, 8)}</code>}</td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td>{formatDate(t.connected_at)}</td>
                    <td>{formatDate(t.disconnected_at)}</td>
                    <td>{t.client_version ?? '—'}</td>
                    <td>
                      <code>{t.client_ip ?? '—'}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
