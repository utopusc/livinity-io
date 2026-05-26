'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AdminShell } from '../../admin-shell';
import { getAdminUserDetail, type AdminUserDetail } from '../../lib/admin-api';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'connected' || status === 'ready') return <span className="badge badge-green">{status}</span>;
  if (status === 'failed' || status.includes('failed') || status.includes('error'))
    return <span className="badge badge-red">{status}</span>;
  if (status === 'running' || status === 'queued') return <span className="badge badge-amber">{status}</span>;
  return <span className="badge">{status}</span>;
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params?.id ?? '';
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    getAdminUserDetail(userId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
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
          <h1>{detail?.user.username ?? 'User detail'}</h1>
          {detail ? (
            <p className="admin-page-sub">
              <code>{detail.user.id}</code>
              {' · '}
              {detail.user.email ?? 'no email'}
            </p>
          ) : null}
        </header>

        {loading ? <p style={{ color: 'var(--fg-mute)' }}>Loading…</p> : null}
        {error ? <p style={{ color: 'var(--red)' }}>Error: {error}</p> : null}

        {detail ? (
          <>
            <section>
              <h2 className="walkthrough-section h2" style={{ fontSize: 18, fontWeight: 500, margin: '4px 0 14px' }}>
                Profile
              </h2>
              <dl className="admin-detail">
                <dt>Role</dt>
                <dd>
                  {detail.user.is_admin ? (
                    <span className="badge badge-green">admin</span>
                  ) : (
                    <span className="badge">user</span>
                  )}
                </dd>
                <dt>Email verified</dt>
                <dd>{detail.user.email_verified ? 'Yes' : 'No'}</dd>
                <dt>Created</dt>
                <dd>{formatDate(detail.user.created_at)}</dd>
                <dt>Last seen</dt>
                <dd>{formatDate(detail.user.last_seen_at)}</dd>
                <dt>CF tunnel</dt>
                <dd>
                  {detail.user.cf_tunnel_id ? (
                    <code>{detail.user.cf_tunnel_id}</code>
                  ) : (
                    <span style={{ color: 'var(--fg-mute)' }}>not provisioned</span>
                  )}
                </dd>
                <dt>CF provisioned at</dt>
                <dd>{formatDate(detail.user.cf_provisioned_at)}</dd>
              </dl>
            </section>

            <section>
              <h2 style={{ fontSize: 18, fontWeight: 500, margin: '14px 0' }}>
                Bandwidth (last 12 periods)
              </h2>
              {detail.bandwidth.length === 0 ? (
                <p style={{ color: 'var(--fg-mute)' }}>No bandwidth recorded.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>In</th>
                        <th>Out</th>
                        <th>Total</th>
                        <th>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.bandwidth.map((b) => (
                        <tr key={b.period_month}>
                          <td>{b.period_month}</td>
                          <td>{formatBytes(b.bytes_in)}</td>
                          <td>{formatBytes(b.bytes_out)}</td>
                          <td>{formatBytes(b.bytes_in + b.bytes_out)}</td>
                          <td>{formatDate(b.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h2 style={{ fontSize: 18, fontWeight: 500, margin: '14px 0' }}>App subdomains</h2>
              {detail.subdomains.length === 0 ? (
                <p style={{ color: 'var(--fg-mute)' }}>No subdomains provisioned.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>App slug</th>
                        <th>Subdomain</th>
                        <th>Port</th>
                        <th>CF DNS record</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.subdomains.map((s) => (
                        <tr key={s.id}>
                          <td>{s.app_slug}</td>
                          <td>
                            <code>{s.subdomain}</code>
                          </td>
                          <td>{s.port ?? '—'}</td>
                          <td>
                            <code style={{ fontSize: 11 }}>{s.cf_dns_record_id ?? '—'}</code>
                          </td>
                          <td>{formatDate(s.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h2 style={{ fontSize: 18, fontWeight: 500, margin: '14px 0' }}>
                Install history (last 100)
              </h2>
              {detail.install_history.length === 0 ? (
                <p style={{ color: 'var(--fg-mute)' }}>No install history.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>App</th>
                        <th>Action</th>
                        <th>Instance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.install_history.map((h) => (
                        <tr key={h.id}>
                          <td>{formatDate(h.created_at)}</td>
                          <td>{h.app_name ?? h.app_slug ?? <code>{h.app_id?.slice(0, 8) ?? '—'}</code>}</td>
                          <td>
                            <StatusBadge status={h.action} />
                          </td>
                          <td>{h.instance_name ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h2 style={{ fontSize: 18, fontWeight: 500, margin: '14px 0' }}>
                Install commands queue (last 50)
              </h2>
              {detail.install_commands.length === 0 ? (
                <p style={{ color: 'var(--fg-mute)' }}>No queued / running / completed install commands.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Created</th>
                        <th>App</th>
                        <th>Status</th>
                        <th>Started</th>
                        <th>Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.install_commands.map((c) => (
                        <tr key={c.id}>
                          <td>{formatDate(c.created_at)}</td>
                          <td>{c.app_name ?? c.app_slug ?? <code>{c.app_id.slice(0, 8)}</code>}</td>
                          <td>
                            <StatusBadge status={c.status} />
                          </td>
                          <td>{formatDate(c.started_at)}</td>
                          <td>{formatDate(c.completed_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h2 style={{ fontSize: 18, fontWeight: 500, margin: '14px 0' }}>
                Tunnel sessions
              </h2>
              {detail.tunnel_sessions.length === 0 ? (
                <p style={{ color: 'var(--fg-mute)' }}>
                  No tunnel sessions recorded. Wiring gap documented in <code>HEARTBEAT-AUDIT.md</code>{' '}
                  (CARRY-P212-TUNNEL-PERSIST).
                </p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Connected</th>
                        <th>Status</th>
                        <th>Disconnected</th>
                        <th>Client version</th>
                        <th>Client IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.tunnel_sessions.map((t) => (
                        <tr key={t.id}>
                          <td>{formatDate(t.connected_at)}</td>
                          <td>
                            <StatusBadge status={t.status} />
                          </td>
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
              )}
            </section>
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}
