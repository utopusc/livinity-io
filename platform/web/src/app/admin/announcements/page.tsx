'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AdminShell } from '../admin-shell';
import { type Announcement, listAnnouncements, deleteAnnouncement } from '../lib/announcements-api';
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

function ListInner() {
  const [rows, setRows] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

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
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="row-name">{row.title}</span>{' '}
                      {row.slug && <span className="row-slug">/{row.slug}</span>}
                    </td>
                    <td>
                      <span className="section-chip">{row.kind}</span>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {row.status === 'published' ? (
                        <span style={{ color: 'var(--green)' }}>● Published</span>
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
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--fg-mute)' }}>
                      No announcements yet. Create your first one →
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
