'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AdminShell } from '../../admin-shell';
import { getAdminUserDetail, type AdminUserDetail, type AdminActionRow } from '../../lib/admin-api';
import { StatusBadge } from '../../components/charts';
import { formatDate as formatShortDate, timeAgo } from '../../components/format';
import { UserActions } from '../../components/user-actions';

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

// Raw-string status badge for the install / tunnel / command tables (these carry
// arbitrary action/status strings, NOT the billing subscription_status that the
// billing-aware <StatusBadge> from charts.tsx renders).
function ActionStatusBadge({ status }: { status: string }) {
  if (status === 'connected' || status === 'ready') return <span className="badge badge-green">{status}</span>;
  if (status === 'failed' || status.includes('failed') || status.includes('error'))
    return <span className="badge badge-red">{status}</span>;
  if (status === 'running' || status === 'queued') return <span className="badge badge-amber">{status}</span>;
  return <span className="badge">{status}</span>;
}

const TOKEN_KEY = 'livinity_admin_token';

// Human-readable summary of an admin_actions row's detail jsonb (best-effort).
function summarizeActionDetail(detail: unknown): string | null {
  if (detail == null || typeof detail !== 'object') return null;
  const d = detail as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof d.note === 'string' && d.note.trim() !== '') {
    parts.push(`note: "${d.note.length > 60 ? `${d.note.slice(0, 60)}…` : d.note}"`);
  }
  if (d.immediate === true) parts.push('immediate');
  if (typeof d.confirm === 'string') parts.push(`confirm: ${d.confirm}`);
  if (typeof d.reason === 'string' && d.reason.trim() !== '') parts.push(d.reason);
  return parts.length ? parts.join(' · ') : null;
}

function AdminActionRowItem({ a }: { a: AdminActionRow }) {
  const summary = summarizeActionDetail(a.detail);
  return (
    <li className="activity-item">
      <span className="activity-dot" aria-hidden="true" />
      <div className="activity-body">
        <span className="activity-title">
          <span className="badge">{a.action}</span>
          {a.admin_username ? (
            <span style={{ marginLeft: 8, color: 'var(--fg-mute)' }}>by {a.admin_username}</span>
          ) : null}
        </span>
        <span className="activity-sub">
          {summary ? `${summary} · ` : ''}
          <span title={formatDate(a.created_at)}>{formatShortDate(a.created_at)}</span>
        </span>
      </div>
      <span className="activity-time">{timeAgo(a.created_at)}</span>
    </li>
  );
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params?.id ?? '';
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentAdminId, setCurrentAdminId] = useState<string | undefined>(undefined);

  // Reusable fetch — also called after a moderation action so the page reflects
  // the now-stale user row + a fresh admin_actions entry.
  const refetch = useCallback(async () => {
    if (!userId) return;
    try {
      const d = await getAdminUserDetail(userId);
      setDetail(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

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

  // Resolve the acting admin's id so <UserActions> can hide the self
  // "Remove admin" / "Delete" buttons. Best-effort: if whoami fails we pass
  // undefined and the panel simply doesn't apply the self-guard (acceptable).
  useEffect(() => {
    let cancelled = false;
    const token = typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) || '' : '';
    fetch('/api/admin/whoami', {
      headers: { 'X-Api-Key': token },
      credentials: 'same-origin',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { userId?: string } | null) => {
        if (cancelled || !data) return;
        if (typeof data.userId === 'string') setCurrentAdminId(data.userId);
      })
      .catch(() => {
        // leave currentAdminId undefined — self-guard simply won't apply
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const u = detail?.user;

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

        {detail && u ? (
          <>
            <section>
              <h2 className="walkthrough-section h2" style={{ fontSize: 18, fontWeight: 500, margin: '4px 0 14px' }}>
                Profile
              </h2>
              <dl className="admin-detail">
                <dt>Role</dt>
                <dd>
                  {u.is_admin ? (
                    <span className="badge badge-green">admin</span>
                  ) : (
                    <span className="badge">user</span>
                  )}
                </dd>
                <dt>Email verified</dt>
                <dd>{u.email_verified ? 'Yes' : 'No'}</dd>
                <dt>Created</dt>
                <dd>{formatDate(u.created_at)}</dd>
                <dt>Last seen</dt>
                <dd>{formatDate(u.last_seen_at)}</dd>
                <dt>CF tunnel</dt>
                <dd>
                  {u.cf_tunnel_id ? (
                    <code>{u.cf_tunnel_id}</code>
                  ) : (
                    <span style={{ color: 'var(--fg-mute)' }}>not provisioned</span>
                  )}
                </dd>
                <dt>CF provisioned at</dt>
                <dd>{formatDate(u.cf_provisioned_at)}</dd>
              </dl>
            </section>

            {/* AUM: Billing & access — subscription/billing/moderation snapshot */}
            <section>
              <h2 style={{ fontSize: 18, fontWeight: 500, margin: '14px 0' }}>Billing &amp; access</h2>
              <dl className="admin-detail">
                <dt>Status</dt>
                <dd>
                  <StatusBadge
                    status={u.subscription_status}
                    legacyFree={u.legacy_free}
                    revoked={u.access_revoked_at != null}
                  />
                  {u.subscription_status ? (
                    <span style={{ marginLeft: 8, color: 'var(--fg-mute)', fontSize: 12 }}>
                      <code>{u.subscription_status}</code>
                    </span>
                  ) : null}
                </dd>
                <dt>Comp (legacy free)</dt>
                <dd>
                  {u.legacy_free ? (
                    <span className="badge badge-blue">Comp</span>
                  ) : (
                    <span style={{ color: 'var(--fg-mute)' }}>No</span>
                  )}
                </dd>
                <dt>Trial used</dt>
                <dd>{u.has_used_trial ? 'Yes' : 'No'}</dd>
                <dt>Suspended</dt>
                <dd>
                  {u.suspended_at != null ? (
                    <>
                      <span className="badge badge-red">Suspended</span>
                      <span style={{ marginLeft: 8, color: 'var(--fg-mute)', fontSize: 12 }}>
                        {formatDate(u.suspended_at)}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: 'var(--fg-mute)' }}>No</span>
                  )}
                </dd>
                <dt>Revoked</dt>
                <dd>
                  {u.access_revoked_at != null ? (
                    <>
                      <span className="badge badge-red">Revoked</span>
                      <span style={{ marginLeft: 8, color: 'var(--fg-mute)', fontSize: 12 }}>
                        {formatDate(u.access_revoked_at)}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: 'var(--fg-mute)' }}>No</span>
                  )}
                </dd>
                <dt>Current period end</dt>
                <dd>{formatDate(u.current_period_end)}</dd>
                <dt>Cancel at period end</dt>
                <dd>
                  {u.cancel_at_period_end ? (
                    <span className="badge badge-amber">Cancelling</span>
                  ) : (
                    <span style={{ color: 'var(--fg-mute)' }}>No</span>
                  )}
                </dd>
                <dt>Past due since</dt>
                <dd>{formatDate(u.past_due_since)}</dd>
                <dt>Stripe customer</dt>
                <dd>
                  {u.stripe_customer_id ? (
                    <code style={{ fontSize: 11 }}>{u.stripe_customer_id}</code>
                  ) : (
                    <span style={{ color: 'var(--fg-mute)' }}>—</span>
                  )}
                </dd>
                <dt>Stripe subscription</dt>
                <dd>
                  {u.stripe_subscription_id ? (
                    <code style={{ fontSize: 11 }}>{u.stripe_subscription_id}</code>
                  ) : (
                    <span style={{ color: 'var(--fg-mute)' }}>—</span>
                  )}
                </dd>
                <dt>Admin note</dt>
                <dd>
                  {u.admin_note ? (
                    <span style={{ whiteSpace: 'pre-wrap' }}>{u.admin_note}</span>
                  ) : (
                    <span style={{ color: 'var(--fg-mute)' }}>— none —</span>
                  )}
                </dd>
              </dl>
            </section>

            {/* AUM: moderation + billing action panel */}
            <section>
              <h2 style={{ fontSize: 18, fontWeight: 500, margin: '14px 0' }}>Actions</h2>
              <UserActions
                user={u}
                currentAdminId={currentAdminId ?? ''}
                onChanged={() => void refetch()}
              />
            </section>

            {/* AUM: admin action audit trail for this user */}
            <section>
              <h2 style={{ fontSize: 18, fontWeight: 500, margin: '14px 0' }}>Admin actions history</h2>
              {detail.admin_actions.length === 0 ? (
                <p style={{ color: 'var(--fg-mute)' }}>No admin actions recorded for this user.</p>
              ) : (
                <ul className="activity-feed">
                  {detail.admin_actions.map((a) => (
                    <AdminActionRowItem key={a.id} a={a} />
                  ))}
                </ul>
              )}
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
                            <ActionStatusBadge status={h.action} />
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
                            <ActionStatusBadge status={c.status} />
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
                            <ActionStatusBadge status={t.status} />
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
