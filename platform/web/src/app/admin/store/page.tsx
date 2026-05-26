'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '../admin-shell';
import { Toast } from '../components/toast';
import {
  listApps,
  updateApp,
  syncCatalog,
  type AdminApp,
  type SyncCatalogResult,
} from '../lib/admin-api';

type ToastState = { msg: string; error?: boolean } | null;

export default function AdminStoreCurationPage() {
  const [apps, setApps] = useState<AdminApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listApps();
      setApps(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleToggle(app: AdminApp, field: 'featured' | 'verified') {
    const next = !app[field];
    // Optimistic update
    setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, [field]: next } : a)));
    try {
      await updateApp(app.slug, { [field]: next } as Partial<AdminApp>);
      setToast({ msg: `${app.name}: ${field}=${next}` });
    } catch (err) {
      // Rollback
      setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, [field]: !next } : a)));
      setToast({ msg: err instanceof Error ? err.message : String(err), error: true });
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const result: SyncCatalogResult = await syncCatalog({ limit: 20 });
      setToast({
        msg: `Sync: ${result.created} new, ${result.updated} updated, ${result.skipped} skipped${result.errors.length ? `, ${result.errors.length} errors` : ''}${result.next_offset != null ? ` (more at offset ${result.next_offset})` : ''}`,
      });
      await load();
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <AdminShell>
      <div className="admin-page">
        <header className="admin-page-head">
          <h1>Store curation</h1>
          <p className="admin-page-sub">
            Toggle featured / verified flags. Sync pulls new manifests from{' '}
            <code>utopusc/livinity-apps</code> (chunks of 20).
          </p>
        </header>

        <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
          <button
            type="button"
            className="admin-btn"
            disabled={syncing || loading}
            onClick={handleSync}
          >
            {syncing ? 'Syncing…' : 'Sync from GitHub'}
          </button>
          <button type="button" className="admin-btn" disabled={loading} onClick={() => void load()}>
            Refresh
          </button>
        </div>

        {error ? <p style={{ color: 'var(--red)' }}>Error: {error}</p> : null}
        {loading ? <p style={{ color: 'var(--fg-mute)' }}>Loading…</p> : null}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Slug</th>
                <th>Name</th>
                <th>Section</th>
                <th>Category</th>
                <th>Featured</th>
                <th>Verified</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <td>
                    <code>{a.slug}</code>
                  </td>
                  <td>{a.name}</td>
                  <td>{a.section ?? '—'}</td>
                  <td>{a.category ?? '—'}</td>
                  <td>
                    <button
                      type="button"
                      className={`badge ${a.featured ? 'badge-green' : ''}`}
                      style={{ cursor: 'pointer', border: 'none', font: 'inherit' }}
                      onClick={() => void handleToggle(a, 'featured')}
                    >
                      {a.featured ? '✓ featured' : 'off'}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`badge ${a.verified ? 'badge-green' : ''}`}
                      style={{ cursor: 'pointer', border: 'none', font: 'inherit' }}
                      onClick={() => void handleToggle(a, 'verified')}
                    >
                      {a.verified ? '✓ verified' : 'off'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {toast ? <Toast msg={toast.msg} error={toast.error} onClose={() => setToast(null)} /> : null}
      </div>
    </AdminShell>
  );
}
