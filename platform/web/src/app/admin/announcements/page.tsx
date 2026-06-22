'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { AdminShell } from '../admin-shell';
import {
  type Announcement,
  listAnnouncements,
  deleteAnnouncement,
  getAnnouncement,
  createAnnouncement,
} from '../lib/announcements-api';
import { KIND_ICON } from '../lib/announcement-templates';
import { timeAgo } from '../components/format';
import { Toast } from '../components/toast';

export default function AnnouncementsListPage() {
  return (
    <AdminShell>
      <ListInner />
    </AdminShell>
  );
}

function fmtWindow(a: Announcement): string {
  const s = a.start_at ? new Date(a.start_at).toLocaleDateString() : '—';
  const e = a.end_at ? new Date(a.end_at).toLocaleDateString() : '∞';
  return `${s} → ${e}`;
}

type StatusFilter = 'all' | 'draft' | 'published' | 'archived';
const STATUS_FILTERS: StatusFilter[] = ['all', 'draft', 'published', 'archived'];

function ListInner() {
  const [rows, setRows] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');

  async function reload() {
    setLoading(true);
    try {
      const list = await listAnnouncements();
      setRows(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return r.title.toLowerCase().includes(q) || (r.slug ?? '').toLowerCase().includes(q);
    });
  }, [rows, filter, query]);

  // Per-status counts for the filter chips.
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: rows.length, draft: 0, published: 0, archived: 0 };
    for (const r of rows) {
      if (r.status === 'draft' || r.status === 'published' || r.status === 'archived') c[r.status] += 1;
    }
    return c;
  }, [rows]);

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"?\n\nThis removes the announcement and its seen/feedback data immediately.`)) {
      return;
    }
    try {
      await deleteAnnouncement(id);
      setRows((rs) => rs.filter((r) => r.id !== id));
      setToast({ msg: `Deleted "${title}".` });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : String(err), error: true });
    }
  }

  // Duplicate → a draft copy. Fetch the full record (the [id] GET returns the
  // editable raw_html_source) so HTML announcements clone faithfully.
  async function handleDuplicate(id: string) {
    try {
      const full = await getAnnouncement(id);
      const created = await createAnnouncement({
        title: `${full.title} (copy)`,
        slug: null, // avoid the unique-slug collision; admin can set one
        kind: full.kind,
        blocks: full.blocks ?? [],
        raw_html: full.raw_html_source ?? '',
        frequency: full.frequency,
        frequency_n: full.frequency_n,
        priority: full.priority,
        dismissible: full.dismissible,
        start_at: full.start_at,
        end_at: full.end_at,
        target_kind: full.target_kind,
        target_user_ids: full.target_user_ids ?? [],
        target_plan_tier: full.target_plan_tier,
        status: 'draft',
      });
      setRows((rs) => [created, ...rs]);
      setToast({ msg: `Duplicated as a draft: "${created.title}".` });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : String(err), error: true });
    }
  }

  return (
    <>
      <div className="admin-ph">
        <div>
          <div className="admin-ph-eyebrow">{rows.length} announcements · fleet pop-ups</div>
          <h1 className="admin-ph-title">
            Manage <em>announcements</em>
          </h1>
          <p className="admin-ph-sub">
            Compose a theme-aware pop-up and publish it to the fleet. Each user sees a
            published announcement once (per its frequency).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" type="button" onClick={reload}>
            Refresh
          </button>
          <Link href="/admin/announcements/new" className="btn primary">
            + New announcement
          </Link>
        </div>
      </div>

      {/* Filter chips + search */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'inline-flex', gap: 4 }}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`section-pill ${filter === f ? 'is-active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f[0].toUpperCase() + f.slice(1)} <span style={{ opacity: 0.6 }}>· {counts[f]}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          className="form-input"
          style={{ maxWidth: 240, marginLeft: 'auto' }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title or slug…"
        />
      </div>

      {error && (
        <div className="form" style={{ borderColor: 'var(--red)', color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {!error &&
        (loading ? (
          <p style={{ color: 'var(--fg-mute)', fontSize: 14 }}>Loading…</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Announcement</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th style={{ textAlign: 'right' }}>Window</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="row-name">{row.title}</span>{' '}
                      {row.slug && <span className="row-slug">/{row.slug}</span>}
                    </td>
                    <td>
                      <span className="section-chip">
                        <span aria-hidden="true">{KIND_ICON[row.kind] ?? ''}</span> {row.kind}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {row.status === 'published' ? (
                        <span style={{ color: 'var(--green)' }}>
                          ● Published
                          {row.published_at && (
                            <span style={{ color: 'var(--fg-mute)' }}> · {timeAgo(row.published_at)}</span>
                          )}
                        </span>
                      ) : row.status === 'archived' ? (
                        <span style={{ color: 'var(--fg-mute)' }}>▢ Archived</span>
                      ) : (
                        <span style={{ color: 'var(--fg-mute)' }}>○ Draft</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{row.priority}</td>
                    <td
                      className="row-slug"
                      style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}
                    >
                      {fmtWindow(row)}
                    </td>
                    <td className="actions">
                      <Link href={`/admin/announcements/${row.id}`} className="btn ghost sm">
                        Edit
                      </Link>
                      <Link href={`/admin/announcements/${row.id}/analytics`} className="btn ghost sm">
                        Analytics
                      </Link>
                      <button type="button" className="btn ghost sm" onClick={() => handleDuplicate(row.id)}>
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="btn danger sm"
                        onClick={() => handleDelete(row.id, row.title)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--fg-mute)' }}>
                      {rows.length === 0
                        ? 'No announcements yet. Create your first one →'
                        : 'No announcements match this filter.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ))}

      {toast && <Toast msg={toast.msg} error={toast.error} onClose={() => setToast(null)} />}
    </>
  );
}
