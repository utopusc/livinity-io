'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { AdminShell } from '../admin-shell';
import {
  type AdminApp,
  listApps,
  deleteApp,
} from '../lib/admin-api';
import { Toast } from '../components/toast';
import { appVisual } from '../../store/lib/app-visual';

type SectionFilter = 'all' | AdminApp['section'];

export default function AppsListPage() {
  return (
    <AdminShell>
      <ListInner />
    </AdminShell>
  );
}

function ListInner() {
  const [rows, setRows] = useState<AdminApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SectionFilter>('all');
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const data = await listApps();
      setRows(data);
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

  async function handleDelete(slug: string, name: string) {
    if (!confirm(`Delete "${name}" (${slug})?\n\nThis removes the catalog row immediately. install_history rows referencing this app will block — uninstall everywhere first.`)) {
      return;
    }
    try {
      await deleteApp(slug);
      setRows((rs) => rs.filter((r) => r.slug !== slug));
      setToast({ msg: `Deleted ${slug}.` });
    } catch (err) {
      setToast({
        msg: err instanceof Error ? err.message : String(err),
        error: true,
      });
    }
  }

  const counts = useMemo(() => {
    const c: Record<SectionFilter, number> = {
      all: rows.length,
      app: 0,
      webapp: 0,
      native: 0,
      ai: 0,
      plugin: 0,
    };
    for (const r of rows) c[r.section]++;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.section === filter);
  }, [rows, filter]);

  return (
    <>
      <div className="admin-ph">
        <div>
          <div className="admin-ph-eyebrow">{rows.length} apps · catalog</div>
          <h1 className="admin-ph-title">
            Manage the <em>catalog</em>
          </h1>
          <p className="admin-ph-sub">
            Add, edit, or remove rows from the Supabase apps table. Changes
            propagate to /store immediately.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" type="button" onClick={reload}>
            Refresh
          </button>
          <Link href="/admin/apps/new" className="btn primary">
            + New app
          </Link>
        </div>
      </div>

      <div className="section-pills">
        {(['all', 'app', 'webapp', 'native', 'ai', 'plugin'] as SectionFilter[]).map(
          (s) => (
            <button
              key={s}
              type="button"
              className={`section-pill${s === filter ? ' is-active' : ''}`}
              onClick={() => setFilter(s)}
            >
              {s === 'all' ? 'All' : s}
              <span className="count">{counts[s]}</span>
            </button>
          ),
        )}
      </div>

      {error && (
        <div
          className="form"
          style={{ borderColor: 'var(--red)', color: 'var(--red)', fontSize: 13 }}
        >
          {error}
        </div>
      )}

      {!error && (loading ? (
        <p style={{ color: 'var(--fg-mute)', fontSize: 14 }}>Loading…</p>
      ) : (
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>App</th>
                <th>Section</th>
                <th>Category</th>
                <th>Version</th>
                <th style={{ textAlign: 'right' }}>Flags</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const v = appVisual(row.slug, row.name);
                return (
                  <tr key={row.id}>
                    <td>
                      <span
                        className="row-icon"
                        style={{
                          background: `linear-gradient(135deg, ${v.c1}, ${v.c2})`,
                        }}
                      >
                        {v.mono}
                      </span>
                      <span className="row-name">{row.name}</span>{' '}
                      <span className="row-slug">/{row.slug}</span>
                    </td>
                    <td>
                      <span className="section-chip">{row.section}</span>
                    </td>
                    <td>{row.category}</td>
                    <td className="row-slug" style={{ fontFamily: 'var(--mono)' }}>
                      {row.version}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--fg-mute)' }}>
                      {row.featured && <span style={{ marginRight: 8 }}>★ featured</span>}
                      {row.verified && <span>✓ verified</span>}
                    </td>
                    <td className="actions">
                      <Link href={`/admin/apps/${row.slug}`} className="btn ghost sm">
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="btn danger sm"
                        onClick={() => handleDelete(row.slug, row.name)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--fg-mute)' }}>
                    No apps in this section.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      {toast && (
        <Toast
          msg={toast.msg}
          error={toast.error}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
