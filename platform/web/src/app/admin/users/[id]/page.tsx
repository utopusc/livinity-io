'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AdminShell } from '../../admin-shell';
import { getAdminUserDetail, type AdminUserDetail, type AdminActionRow } from '../../lib/admin-api';
import { StatusBadge, ProgressMeter } from '../../components/charts';
import { formatBytes, formatDate as formatShortDate, timeAgo } from '../../components/format';
import { UserActions } from '../../components/user-actions';
import { Workspace, DetailHeader, WsCard, KV } from '../../components/workspace';

const TOKEN_KEY = 'livinity_admin_token';

// A user is "online" if last_seen_at landed inside the heartbeat window.
const ONLINE_WINDOW_MS = 2 * 60_000;

// Bandwidth meter denominator — matches the platform's per-account monthly cap
// (1TB, see POST-LAUNCH bandwidth-metering WS3). Display-only.
const BANDWIDTH_LIMIT_BYTES = 1024 ** 4; // 1 TiB

function isOnline(lastSeen: string | null | undefined): boolean {
  if (!lastSeen) return false;
  const t = new Date(lastSeen).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < ONLINE_WINDOW_MS;
}

// Full date+time for hover titles / precise timestamps.
function formatDateTime(iso: string | null | undefined): string {
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

// Humanize an admin_actions.action enum into a readable verb phrase.
function humanizeAction(action: string): string {
  switch (action) {
    case 'grant_comp':
      return 'Granted comp';
    case 'remove_comp':
      return 'Removed comp';
    case 'grant_access':
      return 'Granted access';
    case 'clear_grant':
      return 'Cleared grant';
    case 'revoke':
      return 'Revoked access';
    case 'restore':
      return 'Restored access';
    case 'cancel_subscription':
      return 'Cancelled subscription';
    case 'resume_subscription':
      return 'Resumed subscription';
    case 'make_admin':
      return 'Made admin';
    case 'remove_admin':
      return 'Removed admin';
    case 'verify_email':
      return 'Verified email';
    case 'suspend':
      return 'Suspended';
    case 'unsuspend':
      return 'Unsuspended';
    case 'set_note':
      return 'Saved note';
    case 'delete_user':
      return 'Deleted user';
    default:
      return action.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  }
}

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
  if (typeof d.months === 'number') parts.push(`+${d.months}mo`);
  if (typeof d.days === 'number') parts.push(`+${d.days}d`);
  return parts.length ? parts.join(' · ') : null;
}

function AdminActionRowItem({ a }: { a: AdminActionRow }) {
  const summary = summarizeActionDetail(a.detail);
  return (
    <li className="activity-item">
      <span className="activity-dot" aria-hidden="true" />
      <div className="activity-body">
        <span className="activity-title">
          {humanizeAction(a.action)}
          {a.admin_username ? (
            <span style={{ marginLeft: 8, color: 'var(--fg-mute)', fontWeight: 400 }}>
              by {a.admin_username}
            </span>
          ) : null}
        </span>
        <span className="activity-sub" title={formatDateTime(a.created_at)}>
          {summary ? `${summary} · ` : ''}
          {formatShortDate(a.created_at)}
        </span>
      </div>
      <span className="activity-time" title={formatDateTime(a.created_at)}>
        {timeAgo(a.created_at)}
      </span>
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

  // Sum recent bandwidth (bytes_in + bytes_out across all returned periods) for
  // the meter; recompute only when the bandwidth rows change.
  const bandwidthTotalBytes = useMemo(() => {
    if (!detail) return 0;
    return detail.bandwidth.reduce((sum, b) => sum + (b.bytes_in || 0) + (b.bytes_out || 0), 0);
  }, [detail]);

  // DEFENSIVE-SCHEMA: comp_until may be null (column absent or no grant).
  // "Comped until" only renders when the grant parses AND lies in the future.
  const compUntilMs = u?.comp_until ? new Date(u.comp_until).getTime() : NaN;
  const compActive = !Number.isNaN(compUntilMs) && compUntilMs > Date.now();

  return (
    <AdminShell>
      <div className="admin-page">
        <Link href="/admin/users" className="admin-back-link" style={{ display: 'inline-block', marginBottom: 16 }}>
          ← Users
        </Link>

        {loading && !detail ? <p style={{ color: 'var(--fg-mute)' }}>Loading…</p> : null}
        {error ? <p style={{ color: 'var(--red)' }}>Error: {error}</p> : null}

        {detail && u ? (
          <Workspace
            header={
              <DetailHeader
                title={u.username}
                subtitle={
                  <>
                    {u.email ?? 'no email'}
                    {' · joined '}
                    <span title={formatDateTime(u.created_at)}>{formatShortDate(u.created_at)}</span>
                    {' · '}
                    <code>{u.id}</code>
                  </>
                }
                badges={
                  <>
                    <StatusBadge
                      status={u.subscription_status}
                      legacyFree={u.legacy_free}
                      revoked={u.access_revoked_at != null}
                    />
                    {isOnline(u.last_seen_at) ? (
                      <span className="badge badge-green">Online</span>
                    ) : (
                      <span className="badge badge-mute">Offline</span>
                    )}
                    {u.is_admin ? <span className="badge badge-blue">Admin</span> : null}
                    {u.suspended_at != null ? <span className="badge badge-red">Suspended</span> : null}
                  </>
                }
              />
            }
            rail={
              <UserActions
                user={u}
                currentAdminId={currentAdminId ?? ''}
                onChanged={() => void refetch()}
              />
            }
          >
            {/* (1) BILLING & ACCESS — subscription / comp / moderation snapshot */}
            <WsCard
              title="Billing & access"
              right={u.subscription_status ? <code>{u.subscription_status}</code> : null}
            >
              <KV label="Plan">
                <StatusBadge
                  status={u.subscription_status}
                  legacyFree={u.legacy_free}
                  revoked={u.access_revoked_at != null}
                />
              </KV>
              <KV label="Comp (time-boxed)">
                {compActive ? (
                  <>
                    Comped until{' '}
                    <strong title={formatDateTime(u.comp_until)}>{formatShortDate(u.comp_until)}</strong>
                  </>
                ) : (
                  <span style={{ color: 'var(--fg-mute)' }}>None</span>
                )}
              </KV>
              <KV label="Comp (legacy free)">
                {u.legacy_free ? (
                  <span className="badge badge-blue">Comp</span>
                ) : (
                  <span style={{ color: 'var(--fg-mute)' }}>No</span>
                )}
              </KV>
              <KV label="Trial used">{u.has_used_trial ? 'Yes' : 'No'}</KV>
              <KV label="Trial / period end">
                <span title={formatDateTime(u.current_period_end)}>{formatShortDate(u.current_period_end)}</span>
              </KV>
              <KV label="Cancel at period end">
                {u.cancel_at_period_end ? (
                  <span className="badge badge-amber">Cancelling</span>
                ) : (
                  <span style={{ color: 'var(--fg-mute)' }}>No</span>
                )}
              </KV>
              <KV label="Past due since">
                {u.past_due_since != null ? (
                  <span className="badge badge-red" title={formatDateTime(u.past_due_since)}>
                    {formatShortDate(u.past_due_since)}
                  </span>
                ) : (
                  <span style={{ color: 'var(--fg-mute)' }}>—</span>
                )}
              </KV>
              <KV label="Revoked">
                {u.access_revoked_at != null ? (
                  <span className="badge badge-red" title={formatDateTime(u.access_revoked_at)}>
                    {formatShortDate(u.access_revoked_at)}
                  </span>
                ) : (
                  <span style={{ color: 'var(--fg-mute)' }}>No</span>
                )}
              </KV>
              <KV label="Suspended">
                {u.suspended_at != null ? (
                  <span className="badge badge-red" title={formatDateTime(u.suspended_at)}>
                    {formatShortDate(u.suspended_at)}
                  </span>
                ) : (
                  <span style={{ color: 'var(--fg-mute)' }}>No</span>
                )}
              </KV>
              <KV label="Stripe customer">
                {u.stripe_customer_id ? (
                  <code style={{ fontSize: 11 }}>{u.stripe_customer_id}</code>
                ) : (
                  <span style={{ color: 'var(--fg-mute)' }}>—</span>
                )}
              </KV>
              <KV label="Stripe subscription">
                {u.stripe_subscription_id ? (
                  <code style={{ fontSize: 11 }}>{u.stripe_subscription_id}</code>
                ) : (
                  <span style={{ color: 'var(--fg-mute)' }}>—</span>
                )}
              </KV>
              <KV label="Admin note">
                {u.admin_note ? (
                  <span style={{ whiteSpace: 'pre-wrap', textAlign: 'left' }}>{u.admin_note}</span>
                ) : (
                  <span style={{ color: 'var(--fg-mute)' }}>— none —</span>
                )}
              </KV>
            </WsCard>

            {/* PROVISIONING — CF tunnel / last seen (compact facts) */}
            <WsCard title="Provisioning">
              <KV label="Email verified">{u.email_verified ? 'Yes' : 'No'}</KV>
              <KV label="Last seen">
                {u.last_seen_at ? (
                  <span title={formatDateTime(u.last_seen_at)}>{timeAgo(u.last_seen_at)}</span>
                ) : (
                  <span style={{ color: 'var(--fg-mute)' }}>never</span>
                )}
              </KV>
              <KV label="CF tunnel">
                {u.cf_tunnel_id ? (
                  <code style={{ fontSize: 11 }}>{u.cf_tunnel_id}</code>
                ) : (
                  <span style={{ color: 'var(--fg-mute)' }}>not provisioned</span>
                )}
              </KV>
              <KV label="CF provisioned at">
                <span title={formatDateTime(u.cf_provisioned_at)}>{formatShortDate(u.cf_provisioned_at)}</span>
              </KV>
            </WsCard>

            {/* (2) BANDWIDTH — meter (recent total vs 1TB) + per-period rows */}
            <WsCard
              title="Bandwidth"
              right={`${formatBytes(bandwidthTotalBytes)} recent`}
            >
              <div style={{ marginBottom: detail.bandwidth.length ? 14 : 0 }}>
                <ProgressMeter
                  used={bandwidthTotalBytes}
                  limit={BANDWIDTH_LIMIT_BYTES}
                  label={`${formatBytes(bandwidthTotalBytes)} of ${formatBytes(BANDWIDTH_LIMIT_BYTES)}`}
                />
              </div>
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
                          <td title={formatDateTime(b.updated_at)}>{formatShortDate(b.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </WsCard>

            {/* (3) APPS & ACTIVITY — subdomains + install history + commands + tunnels */}
            <WsCard title="App subdomains" right={`${detail.subdomains.length}`}>
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
                          <td title={formatDateTime(s.created_at)}>{formatShortDate(s.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </WsCard>

            <WsCard title="Install history" right="last 100">
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
                          <td title={formatDateTime(h.created_at)}>{formatShortDate(h.created_at)}</td>
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
            </WsCard>

            <WsCard title="Install commands queue" right="last 50">
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
                          <td title={formatDateTime(c.created_at)}>{formatShortDate(c.created_at)}</td>
                          <td>{c.app_name ?? c.app_slug ?? <code>{c.app_id.slice(0, 8)}</code>}</td>
                          <td>
                            <ActionStatusBadge status={c.status} />
                          </td>
                          <td title={formatDateTime(c.started_at)}>{formatShortDate(c.started_at)}</td>
                          <td title={formatDateTime(c.completed_at)}>{formatShortDate(c.completed_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </WsCard>

            <WsCard title="Tunnel sessions" right={`${detail.tunnel_sessions.length}`}>
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
                          <td title={formatDateTime(t.connected_at)}>{formatShortDate(t.connected_at)}</td>
                          <td>
                            <ActionStatusBadge status={t.status} />
                          </td>
                          <td title={formatDateTime(t.disconnected_at)}>{formatShortDate(t.disconnected_at)}</td>
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
            </WsCard>

            {/* (4) ADMIN HISTORY — moderation audit trail for this user */}
            <WsCard title="Admin history" right={`${detail.admin_actions.length}`}>
              {detail.admin_actions.length === 0 ? (
                <p style={{ color: 'var(--fg-mute)' }}>No admin actions recorded for this user.</p>
              ) : (
                <ul className="activity-feed">
                  {detail.admin_actions.map((a) => (
                    <AdminActionRowItem key={a.id} a={a} />
                  ))}
                </ul>
              )}
            </WsCard>
          </Workspace>
        ) : null}
      </div>
    </AdminShell>
  );
}
