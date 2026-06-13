'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '../admin-shell';
import {
  KpiCard,
  Section,
  StatusBar,
  StatusBadge,
  type StatusSegment,
} from '../components/charts';
import { formatUsd, formatDate } from '../components/format';
import {
  getBillingSummary,
  listSubscribers,
  type BillingSummary,
  type SubscribersResult,
} from '../lib/admin-api';

export default function AdminBillingPage() {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [subs, setSubs] = useState<SubscribersResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getBillingSummary(), listSubscribers()])
      .then(([s, sub]) => {
        if (cancelled) return;
        setSummary(s);
        setSubs(sub);
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

  const segments: StatusSegment[] = summary
    ? [
        { label: 'Trialing', value: summary.counts.trialing, tone: 'amber' },
        { label: 'Active', value: summary.counts.active, tone: 'green' },
        { label: 'Past due', value: summary.counts.past_due, tone: 'red' },
        { label: 'Canceled', value: summary.counts.canceled, tone: 'default' },
        { label: 'Legacy free', value: summary.counts.legacy_free, tone: 'blue' },
        { label: 'Revoked', value: summary.counts.revoked, tone: 'red' },
      ]
    : [];

  return (
    <AdminShell>
      <div className="admin-page">
        <header className="admin-page-head">
          <h1>Billing</h1>
          <p className="admin-page-sub">Revenue and subscription health.</p>
        </header>

        {loading ? <p style={{ color: 'var(--fg-mute)' }}>Loading…</p> : null}
        {error ? <p style={{ color: 'var(--red)' }}>Error: {error}</p> : null}

        {summary ? (
          <div className="kpi-grid">
            <KpiCard label="MRR" value={formatUsd(summary.mrr_usd)} tone="green" hint="Monthly recurring" />
            <KpiCard label="ARR" value={formatUsd(summary.arr_usd)} hint="Annual run rate" />
            <KpiCard label="Paying" value={summary.paying} hint="Active subscribers" />
            <KpiCard label="Trialing" value={summary.trialing} tone="amber" />
            <KpiCard
              label="Conversion rate"
              value={summary.conversion_rate == null ? '—' : `${summary.conversion_rate}%`}
              hint="Active / (active + canceled)"
            />
          </div>
        ) : null}

        {summary ? (
          <Section title="Subscription distribution" meta="Current status across all billing-relevant accounts">
            <StatusBar segments={segments} />
          </Section>
        ) : null}

        {summary ? (
          <Section
            title="Trials ending soon"
            meta="Trialing accounts whose period ends within 7 days"
            right={
              <span className="admin-section-meta">{summary.trials_ending.length} ending</span>
            }
          >
            {summary.trials_ending.length === 0 ? (
              <p className="bar-chart-empty">No trials ending in the next 7 days.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Ends</th>
                      <th style={{ textAlign: 'right' }}>Days left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.trials_ending.map((t) => (
                      <tr key={t.user_id}>
                        <td>{t.username}</td>
                        <td style={{ color: 'var(--fg-mute)' }}>{t.email ?? '—'}</td>
                        <td>{formatDate(t.current_period_end)}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {t.days_left}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        ) : null}

        {subs ? (
          <Section
            title="Subscribers"
            meta="Billing-relevant accounts, ordered by status priority"
            right={<span className="admin-section-meta">{subs.subscribers.length} shown</span>}
          >
            {subs.subscribers.length === 0 ? (
              <p className="bar-chart-empty">No subscribers found.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Plan</th>
                      <th>Renews / Ends</th>
                      <th style={{ textAlign: 'right' }}>MRR</th>
                      <th>Tunnel</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.subscribers.map((s) => (
                      <tr key={s.user_id}>
                        <td>
                          <div>{s.username}</div>
                          {s.email ? (
                            <div style={{ color: 'var(--fg-mute)', fontSize: '0.85em' }}>{s.email}</div>
                          ) : null}
                        </td>
                        <td>
                          <StatusBadge
                            status={s.subscription_status}
                            legacyFree={s.legacy_free}
                            revoked={s.access_revoked_at != null}
                          />
                        </td>
                        <td>
                          <div>{formatDate(s.current_period_end)}</div>
                          {s.cancel_at_period_end ? (
                            <div style={{ color: 'var(--amber)', fontSize: '0.85em' }}>
                              Cancels at period end
                            </div>
                          ) : null}
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {formatUsd(s.mrr_usd)}
                        </td>
                        <td>{s.has_tunnel ? 'Yes' : 'No'}</td>
                        <td>{formatDate(s.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        ) : null}

        {summary ? (
          <Section
            title="Recently canceled"
            meta="Canceled or access-revoked accounts, newest first"
            right={
              <span className="admin-section-meta">{summary.recently_canceled.length} shown</span>
            }
          >
            {summary.recently_canceled.length === 0 ? (
              <p className="bar-chart-empty">No recent cancellations.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Period end</th>
                      <th>Access revoked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recently_canceled.map((c) => (
                      <tr key={c.user_id}>
                        <td>{c.username}</td>
                        <td style={{ color: 'var(--fg-mute)' }}>{c.email ?? '—'}</td>
                        <td>{formatDate(c.current_period_end)}</td>
                        <td>{formatDate(c.access_revoked_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        ) : null}
      </div>
    </AdminShell>
  );
}
