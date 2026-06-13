'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '../admin-shell';
import { Section, AreaChart, BarList, type BarListRow } from '../components/charts';
import { formatNumber, formatBytes } from '../components/format';
import {
  getMetricsTimeseries,
  getAdminAppsSummary,
  getBandwidth,
  type TimeseriesResult,
  type AppsSummary,
  type BandwidthResult,
} from '../lib/admin-api';

export default function AdminAnalyticsPage() {
  const [series, setSeries] = useState<TimeseriesResult | null>(null);
  const [apps, setApps] = useState<AppsSummary | null>(null);
  const [bandwidth, setBandwidth] = useState<BandwidthResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getMetricsTimeseries(), getAdminAppsSummary(), getBandwidth()])
      .then(([t, a, b]) => {
        if (cancelled) return;
        setSeries(t);
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

  // ---- Section (5) Top apps by installs --------------------------------------
  const topApps: BarListRow[] = (apps?.installs_per_app ?? [])
    .filter((r) => r.install_count > 0)
    .slice(0, 10)
    .map((r) => ({
      label: r.name,
      sublabel: r.slug,
      value: r.install_count,
      display: formatNumber(r.install_count),
    }));

  // ---- Section (6) Top bandwidth users ---------------------------------------
  const topBandwidthUsers: BarListRow[] = (bandwidth?.users ?? [])
    .map((r) => {
      const bytes = (Number(r.bytes_in) || 0) + (Number(r.bytes_out) || 0);
      return {
        label: r.username ?? r.user_id.slice(0, 8),
        value: bytes,
        display: formatBytes(bytes),
      };
    })
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // ---- Section (4) Bandwidth by month ----------------------------------------
  const bandwidthMonthly: BarListRow[] = (series?.bandwidth_monthly ?? []).map((r) => ({
    label: r.period,
    value: Number(r.bytes) || 0,
    display: formatBytes(Number(r.bytes) || 0),
  }));

  return (
    <AdminShell>
      <div className="admin-page">
        <header className="admin-page-head">
          <h1>Analytics</h1>
          <p className="admin-page-sub">Trends over time.</p>
        </header>

        {loading ? <p style={{ color: 'var(--fg-mute)' }}>Loading…</p> : null}
        {error ? <p style={{ color: 'var(--red)' }}>Error: {error}</p> : null}

        {series ? (
          <>
            {/* (1) New signups — 30d daily */}
            <Section title="New signups" meta="Last 30 days">
              <AreaChart
                data={series.signups_daily.map((d) => ({ label: d.date, value: d.count }))}
                tone="blue"
                valueFormat={formatNumber}
              />
            </Section>

            {/* (2) Cumulative users — running total over 30d */}
            <Section title="Cumulative users" meta="Running total, last 30 days">
              <AreaChart
                data={series.cumulative_users.map((d) => ({ label: d.date, value: d.total }))}
                tone="blue"
                valueFormat={formatNumber}
              />
            </Section>

            {/* (3) Installs — 14d daily */}
            <Section title="Installs" meta="Last 14 days">
              <AreaChart
                data={series.installs_daily.map((d) => ({ label: d.date, value: d.count }))}
                tone="green"
                valueFormat={formatNumber}
              />
            </Section>

            {/* (4) Bandwidth by month — last 6 months */}
            <Section title="Bandwidth by month" meta="Last 6 months">
              <BarList rows={bandwidthMonthly} emptyMessage="No bandwidth recorded." />
            </Section>
          </>
        ) : null}

        {(apps || bandwidth) ? (
          <div className="charts-grid">
            {/* (5) Top apps by installs */}
            {apps ? (
              <Section title="Top apps by installs">
                <BarList rows={topApps} emptyMessage="No installs recorded yet." />
              </Section>
            ) : null}

            {/* (6) Top bandwidth users */}
            {bandwidth ? (
              <Section title={`Top bandwidth users (${bandwidth.period})`}>
                <BarList rows={topBandwidthUsers} emptyMessage="No bandwidth recorded for this period." />
              </Section>
            ) : null}
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
