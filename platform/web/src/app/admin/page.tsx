'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from './admin-shell';
import {
  Section,
  KpiCard,
  AreaChart,
  BarList,
  ActivityFeed,
} from './components/charts';
import { formatBytes, formatNumber, formatUsd, timeAgo } from './components/format';
import {
  getMetricsSummary,
  getMetricsTimeseries,
  getRecentActivity,
  getAdminAppsSummary,
  getBandwidth,
  type MetricsSummary,
  type TimeseriesResult,
  type ActivityResult,
  type AppsSummary,
  type BandwidthResult,
} from './lib/admin-api';

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [series, setSeries] = useState<TimeseriesResult | null>(null);
  const [activity, setActivity] = useState<ActivityResult | null>(null);
  const [apps, setApps] = useState<AppsSummary | null>(null);
  const [bandwidth, setBandwidth] = useState<BandwidthResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getMetricsSummary(),
      getMetricsTimeseries(),
      getRecentActivity({ limit: 20 }),
      getAdminAppsSummary(),
      getBandwidth(),
    ])
      .then(([m, t, act, a, b]) => {
        if (cancelled) return;
        setMetrics(m);
        setSeries(t);
        setActivity(act);
        setApps(a);
        setBandwidth(b);
        setUpdatedAt(new Date().toISOString());
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
  }, [refreshKey]);

  return (
    <AdminShell>
      <div className="admin-page">
        <div className="admin-toolbar">
          {updatedAt ? (
            <span className="admin-toolbar-stamp">Updated {timeAgo(updatedAt)}</span>
          ) : null}
          <button type="button" className="btn ghost sm" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <header className="admin-page-head">
          <h1>Dashboard</h1>
          <p className="admin-page-sub">Real-time system overview from Supabase.</p>
        </header>

        {error ? <p style={{ color: 'var(--red)' }}>Error: {error}</p> : null}
        {loading && !metrics ? <p style={{ color: 'var(--fg-mute)' }}>Loading…</p> : null}

        {metrics ? (
          <>
            {/* ---- 1. Users & Growth ---- */}
            <Section title="Users & Growth">
              <div className="kpi-grid">
                <KpiCard
                  label="Users total"
                  value={metrics.users_total}
                  spark={series ? series.cumulative_users.map((d) => d.total) : undefined}
                />
                <KpiCard
                  label="Active (24h)"
                  value={metrics.users_active_24h}
                  hint="Seen within 24h"
                />
                <KpiCard
                  label="Signups (7d)"
                  value={metrics.signups_7d}
                  hint={`${formatNumber(metrics.signups_today)} today`}
                />
                <KpiCard
                  label="Provisioned"
                  value={metrics.provisioned_total}
                  hint="CF tunnel set up"
                />
                <KpiCard
                  label="Tunnels online"
                  value={metrics.tunnels_online}
                  tone={metrics.tunnels_online > 0 ? 'green' : 'default'}
                />
              </div>
            </Section>

            {/* ---- 2. Billing & Revenue ---- */}
            <Section title="Billing & Revenue">
              <div className="kpi-grid">
                <KpiCard label="MRR" value={formatUsd(metrics.mrr_usd)} tone="green" hint="Monthly recurring" />
                <KpiCard label="Paying" value={metrics.subs_active} tone="green" />
                <KpiCard label="Trialing" value={metrics.subs_trialing} tone="amber" />
                <KpiCard
                  label="Trials ending 3d"
                  value={metrics.trials_ending_3d}
                  tone={metrics.trials_ending_3d > 0 ? 'red' : 'amber'}
                />
                <KpiCard
                  label="Past due"
                  value={metrics.subs_past_due}
                  tone={metrics.subs_past_due > 0 ? 'red' : 'default'}
                />
                <KpiCard label="Cancelling" value={metrics.subs_cancelling} />
                <KpiCard
                  label="Revoked"
                  value={metrics.revoked_count}
                  tone={metrics.revoked_count > 0 ? 'red' : 'default'}
                />
              </div>
            </Section>

            {/* ---- 3. Infrastructure & Apps ---- */}
            <Section title="Infrastructure & Apps">
              <div className="kpi-grid">
                <KpiCard
                  label="Bandwidth this month"
                  value={formatBytes(metrics.bandwidth_this_month_bytes)}
                />
                <KpiCard label="Installs (24h)" value={metrics.installs_24h} />
                <KpiCard label="Installs (7d)" value={metrics.installs_7d} />
                <KpiCard
                  label="Install failures (24h)"
                  value={metrics.installs_failed_24h}
                  tone={metrics.installs_failed_24h > 0 ? 'red' : 'default'}
                />
                <KpiCard label="Apps in catalog" value={metrics.apps_total} />
              </div>
            </Section>
          </>
        ) : null}

        {/* ---- 4. Signups trend ---- */}
        {series ? (
          <Section title="Signups" meta="Last 30 days">
            <AreaChart
              data={series.signups_daily.map((d) => ({ label: d.date.slice(5), value: d.count }))}
              tone="blue"
              valueFormat={formatNumber}
            />
          </Section>
        ) : null}

        {/* ---- 5. Top installs / Top bandwidth ---- */}
        {(apps || bandwidth) ? (
          <div className="charts-grid">
            {apps ? (
              <Section title="Top installs by app">
                <BarList
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
              </Section>
            ) : null}

            {bandwidth ? (
              <Section title="Top bandwidth by user" meta={bandwidth.period}>
                <BarList
                  emptyMessage="No bandwidth recorded for this period."
                  rows={bandwidth.users.slice(0, 10).map((r) => ({
                    label: r.username ?? r.user_id.slice(0, 8),
                    value: r.bytes_in + r.bytes_out,
                    display: formatBytes(r.bytes_in + r.bytes_out),
                  }))}
                />
              </Section>
            ) : null}
          </div>
        ) : null}

        {/* ---- 6. Recent activity ---- */}
        {activity ? (
          <Section title="Recent activity">
            <ActivityFeed events={activity.events} />
          </Section>
        ) : null}
      </div>
    </AdminShell>
  );
}
