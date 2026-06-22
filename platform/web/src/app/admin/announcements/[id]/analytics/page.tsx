'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AdminShell } from '../../../admin-shell';
import {
  type Announcement,
  type AnnouncementAnalytics,
  type AnnouncementBlock,
  getAnnouncement,
  getAnnouncementAnalytics,
} from '../../../lib/announcements-api';
import { KpiCard, BarList, AreaChart, Section, type BarListRow } from '../../../components/charts';

export default function AnnouncementAnalyticsPage() {
  return (
    <AdminShell>
      <Inner />
    </AdminShell>
  );
}

const ROOT_BLOCK = '__root__';

function Inner() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [data, setData] = useState<AnnouncementAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([getAnnouncement(id), getAnnouncementAnalytics(id)])
      .then(([a, d]) => {
        setAnnouncement(a);
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  // Map block_id → poll question label (from the announcement's block JSON).
  const blockLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of (announcement?.blocks ?? []) as AnnouncementBlock[]) {
      if (b.type === 'poll') m.set(b.id, b.question);
    }
    return m;
  }, [announcement]);

  // Group votes by block_id, with per-option % + a "leading" marker on the top
  // option(s). The route already orders options by votes DESC within a block.
  const voteGroups = useMemo(() => {
    const raw = new Map<string, { opt: string; votes: number }[]>();
    for (const v of data?.votes ?? []) {
      const key = v.block_id ?? ROOT_BLOCK;
      const arr = raw.get(key) ?? [];
      arr.push({ opt: v.vote_option, votes: v.votes });
      raw.set(key, arr);
    }
    const groups = new Map<string, BarListRow[]>();
    for (const [key, arr] of raw) {
      const total = arr.reduce((s, r) => s + r.votes, 0);
      const max = arr.reduce((m, r) => Math.max(m, r.votes), 0);
      groups.set(
        key,
        arr.map((r) => {
          const pct = total > 0 ? Math.round((r.votes / total) * 100) : 0;
          return {
            label: r.opt,
            value: r.votes,
            display: `${r.votes} · ${pct}%`,
            sublabel: r.votes === max && max > 0 ? '🏆 Leading' : undefined,
          };
        }),
      );
    }
    return Array.from(groups.entries());
  }, [data]);

  // Engagement funnel — Seen → Voted → Dismissed (relative bars read as a funnel).
  const totalVotes = (data?.votes ?? []).reduce((s, v) => s + v.votes, 0);
  const funnelRows: BarListRow[] = data
    ? [
        { label: 'Seen (users)', value: data.seen.users_seen, display: String(data.seen.users_seen) },
        { label: 'Voted', value: totalVotes, display: String(totalVotes) },
        { label: 'Dismissed', value: data.seen.dismissed, display: String(data.seen.dismissed) },
      ]
    : [];

  // CSV export — votes + free-text feedback to a client-side blob download.
  function exportCsv() {
    if (!data) return;
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines: string[] = ['type,block,option_or_text,count_or_date'];
    for (const v of data.votes) {
      const label = v.block_id && v.block_id !== ROOT_BLOCK ? blockLabel.get(v.block_id) ?? v.block_id : 'overall';
      lines.push([esc('vote'), esc(label), esc(v.vote_option), esc(v.votes)].join(','));
    }
    for (const f of data.feedback) {
      const label = f.block_id && f.block_id !== ROOT_BLOCK ? blockLabel.get(f.block_id) ?? f.block_id : 'general';
      lines.push([esc('feedback'), esc(label), esc(f.free_text), esc(f.created_at)].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `announcement-${id ?? 'export'}-analytics.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="admin-ph">
        <div>
          <div className="admin-ph-eyebrow">Analytics</div>
          <h1 className="admin-ph-title">
            {announcement ? announcement.title : 'Announcement'} <em>results</em>
          </h1>
          <p className="admin-ph-sub">Aggregated seen counts, votes, and feedback for this announcement.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/announcements" className="btn ghost">
            ← Back
          </Link>
          <button type="button" className="btn ghost" onClick={exportCsv} disabled={!data}>
            ⬇ Export CSV
          </button>
          {id && (
            <Link href={`/admin/announcements/${id}`} className="btn ghost">
              Edit
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="form" style={{ borderColor: 'var(--red)', color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {!error && loading && <p style={{ color: 'var(--fg-mute)', fontSize: 14 }}>Loading…</p>}

      {!error && !loading && data && (
        <>
          <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <KpiCard label="Users seen" value={data.seen.users_seen} tone="blue" />
            <KpiCard label="Impressions" value={data.seen.impressions} tone="default" />
            <KpiCard label="Dismissed" value={data.seen.dismissed} tone="amber" />
            <KpiCard label="Feedback" value={data.feedback.length} tone="green" />
          </div>

          <Section title="Engagement funnel" meta="Seen → Voted → Dismissed">
            <BarList rows={funnelRows} emptyMessage="No engagement yet." />
          </Section>

          {data.series.length > 0 && (
            <Section title="Users seen over time" meta={`${data.series.length} day${data.series.length === 1 ? '' : 's'}`}>
              <AreaChart data={data.series.map((s) => ({ label: s.day.slice(5), value: s.users }))} tone="blue" />
            </Section>
          )}

          <Section title="Votes" meta={`${data.votes.reduce((s, v) => s + v.votes, 0)} total`}>
            {voteGroups.length === 0 ? (
              <p className="bar-chart-empty">No votes yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {voteGroups.map(([blockId, rows]) => (
                  <BarList
                    key={blockId}
                    title={blockId === ROOT_BLOCK ? 'Overall' : blockLabel.get(blockId) ?? `Poll ${blockId.slice(0, 8)}`}
                    rows={rows}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title="Free-text feedback" meta={`${data.feedback.length} responses`}>
            {data.feedback.length === 0 ? (
              <p className="bar-chart-empty">No written feedback yet.</p>
            ) : (
              <ul className="activity-feed">
                {data.feedback.map((f, i) => (
                  <li key={i} className="activity-item">
                    <div className="activity-body">
                      <span className="activity-title">{f.free_text}</span>
                      <span className="activity-sub">
                        {f.block_id && f.block_id !== ROOT_BLOCK ? (blockLabel.get(f.block_id) ?? 'feedback') : 'general'}
                      </span>
                    </div>
                    <span className="activity-time">{new Date(f.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </>
  );
}
