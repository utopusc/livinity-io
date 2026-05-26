'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from './admin-shell';
import {
  getMetricsSummary,
  getAdminAppsSummary,
  getBandwidth,
  type MetricsSummary,
  type AppsSummary,
  type BandwidthResult,
} from './lib/admin-api';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

type KpiCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'green' | 'red' | 'amber';
};

function KpiCard({ label, value, hint, tone = 'default' }: KpiCardProps) {
  return (
    <div className={`kpi-card kpi-tone-${tone}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{typeof value === 'number' ? formatNumber(value) : value}</div>
      {hint ? <div className="kpi-hint">{hint}</div> : null}
    </div>
  );
}

type BarRow = { label: string; sublabel?: string; value: number; display: string };

function BarChart({ title, rows, emptyMessage }: { title: string; rows: BarRow[]; emptyMessage: string }) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
  return (
    <section className="bar-chart">
      <h3 className="bar-chart-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="bar-chart-empty">{emptyMessage}</p>
      ) : (
        <ul className="bar-list">
          {rows.map((r, idx) => (
            <li key={idx} className="bar-row">
              <div className="bar-row-head">
                <span className="bar-row-label">{r.label}</span>
                <span className="bar-row-value">{r.display}</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: max ? `${Math.max(2, Math.round((r.value / max) * 100))}%` : '0%' }}
                />
              </div>
              {r.sublabel ? <div className="bar-row-sub">{r.sublabel}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [apps, setApps] = useState<AppsSummary | null>(null);
  const [bandwidth, setBandwidth] = useState<BandwidthResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getMetricsSummary(), getAdminAppsSummary(), getBandwidth()])
      .then(([m, a, b]) => {
        if (cancelled) return;
        setMetrics(m);
        setApps(a);
        setBandwidth(b);
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
          <h1>Dashboard</h1>
          <p className="admin-page-sub">Real-time system overview from Supabase.</p>
        </header>

        {loading ? <p style={{ color: 'var(--fg-mute)' }}>Loading…</p> : null}
        {error ? <p style={{ color: 'var(--red)' }}>Error: {error}</p> : null}

        {metrics ? (
          <div className="kpi-grid">
            <KpiCard label="Users total" value={metrics.users_total} />
            <KpiCard label="Users active (24h)" value={metrics.users_active_24h} hint="Last seen within 24h" />
            <KpiCard
              label="Tunnels online"
              value={metrics.tunnels_online}
              tone={metrics.tunnels_online > 0 ? 'green' : 'amber'}
              hint={metrics.tunnels_online === 0 ? 'CARRY-P212-TUNNEL-PERSIST' : undefined}
            />
            <KpiCard label="Apps in catalog" value={metrics.apps_total} />
            <KpiCard label="Installs total" value={metrics.installs_total} />
            <KpiCard
              label="Install failures (24h)"
              value={metrics.installs_failed_24h}
              tone={metrics.installs_failed_24h > 0 ? 'red' : 'default'}
            />
            <KpiCard label="Bandwidth total" value={formatBytes(metrics.bandwidth_total_bytes)} />
          </div>
        ) : null}

        <div className="charts-grid">
          {apps ? (
            <BarChart
              title="Top installs by app"
              emptyMessage="No installs recorded yet."
              rows={apps.installs_per_app
                .filter((r) => r.install_count > 0)
                .slice(0, 10)
                .map((r) => ({
                  label: r.name,
                  sublabel: r.slug,
                  value: r.install_count,
                  display: formatNumber(r.install_count),
                }))}
            />
          ) : null}

          {bandwidth ? (
            <BarChart
              title={`Top bandwidth by user (${bandwidth.period})`}
              emptyMessage="No bandwidth recorded for this period."
              rows={bandwidth.users
                .slice(0, 10)
                .map((r) => ({
                  label: r.username ?? r.user_id.slice(0, 8),
                  value: r.bytes_in + r.bytes_out,
                  display: formatBytes(r.bytes_in + r.bytes_out),
                }))}
            />
          ) : null}
        </div>
      </div>
    </AdminShell>
  );
}
