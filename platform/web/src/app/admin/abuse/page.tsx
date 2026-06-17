'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminShell } from '../admin-shell';
import { formatBytes, timeAgo } from '../components/format';
import { getAbuseSignals, type AbuseSignalRow, type AbuseSignalsResult } from '../lib/admin-api';

const LEVEL_STYLE: Record<AbuseSignalRow['level'], { bg: string; fg: string; label: string }> = {
  high: { bg: 'rgba(220,0,32,0.12)', fg: '#dc0020', label: 'HIGH' },
  watch: { bg: 'rgba(200,120,0,0.14)', fg: '#b06800', label: 'WATCH' },
  ok: { bg: 'rgba(120,120,120,0.10)', fg: 'var(--fg-mute)', label: 'ok' },
};

function Chip({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <span
      className="badge"
      style={{ background: bg, color: fg, borderColor: 'transparent', whiteSpace: 'nowrap' }}
    >
      {children}
    </span>
  );
}

export default function AdminAbusePage() {
  const [data, setData] = useState<AbuseSignalsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAbuseSignals()
      .then((d) => {
        if (cancelled) return;
        setData(d);
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

  const signals = data?.signals ?? [];
  const flaggedCount = signals.filter((s) => s.level !== 'ok').length;
  const everScanned = signals.some((s) => s.scanned_at !== null);

  return (
    <AdminShell>
      <div className="admin-page">
        <header className="admin-page-head">
          <h1>Abuse</h1>
          <p className="admin-page-sub">
            Per-tenant risk signals — bandwidth anomaly (CFC-03) + reputation, refreshed daily by the
            abuse-scan cron. Worst first. {signals.length} tenant(s)
            {flaggedCount > 0 ? ` · ${flaggedCount} flagged` : ''}.
          </p>
        </header>

        {error ? <p style={{ color: 'var(--red)', margin: 0 }}>Error: {error}</p> : null}
        {loading ? <p style={{ color: 'var(--fg-mute)', margin: 0 }}>Loading…</p> : null}

        {data && !data.signalsAvailable ? (
          <p style={{ color: 'var(--fg-mute)', margin: 0, fontSize: 13 }}>
            ⚠ The <code>abuse_signals</code> table isn&apos;t set up yet (run migration 0024). Showing
            live signals only — egress &amp; reputation will populate after the next abuse-scan.
          </p>
        ) : null}
        {data && data.signalsAvailable && !everScanned && !loading ? (
          <p style={{ color: 'var(--fg-mute)', margin: 0, fontSize: 13 }}>
            No scan has run yet (the abuse-scan cron runs daily at 05:00 UTC). Egress &amp; reputation
            will fill in then. If egress stays empty, verify <code>CF_API_TOKEN</code> has Zone
            Analytics: Read.
          </p>
        ) : null}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Risk</th>
                <th>Egress (24h)</th>
                <th>Reputation</th>
                <th>Subdomains</th>
                <th>Scanned</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {signals.map((s) => {
                const lvl = LEVEL_STYLE[s.level];
                return (
                  <tr key={s.user_id}>
                    <td>
                      <Link
                        href={`/admin/users/${s.user_id}`}
                        className="admin-table-link"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                      >
                        <span>{s.username}</span>
                        {s.suspended ? <span className="badge badge-red">suspended</span> : null}
                        {s.revoked && !s.suspended ? (
                          <span className="badge" style={{ color: 'var(--fg-mute)' }}>revoked</span>
                        ) : null}
                      </Link>
                    </td>
                    <td>
                      <Chip bg={lvl.bg} fg={lvl.fg}>{lvl.label}</Chip>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: s.egress_flagged ? '#b06800' : 'var(--fg-dim)' }}>
                      {s.egress_24h_bytes !== null ? formatBytes(s.egress_24h_bytes) : '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {s.reputation === 'flagged' ? (
                        <Chip bg="rgba(220,0,32,0.12)" fg="#dc0020">
                          {s.reputation_detail ?? 'flagged'}
                        </Chip>
                      ) : s.reputation === 'clean' ? (
                        <span style={{ color: 'var(--fg-mute)', fontSize: 12 }}>clean</span>
                      ) : (
                        <span style={{ color: 'var(--fg-mute)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--fg-dim)' }}>{s.subdomain_count}</td>
                    <td style={{ color: 'var(--fg-mute)', whiteSpace: 'nowrap' }}>
                      {s.scanned_at ? timeAgo(s.scanned_at) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Link href={`/admin/users/${s.user_id}`} className="admin-table-action">
                        Details →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!loading && signals.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--fg-mute)' }}>
                    No provisioned tenants.
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
