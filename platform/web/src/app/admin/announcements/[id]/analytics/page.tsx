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
import { KpiCard, BarList, Section, type BarListRow } from '../../../components/charts';

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

  // Group votes by block_id into BarList groups.
  const voteGroups = useMemo(() => {
    const groups = new Map<string, BarListRow[]>();
    for (const v of data?.votes ?? []) {
      const key = v.block_id ?? ROOT_BLOCK;
      const rows = groups.get(key) ?? [];
      rows.push({ label: v.vote_option, value: v.votes, display: String(v.votes) });
      groups.set(key, rows);
    }
    return Array.from(groups.entries());
  }, [data]);

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
