'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { AdminShell } from '../admin-shell';
import {
  type DocArticle,
  type DocCategory,
  listArticles,
  listCategories,
  deleteArticle,
} from '../lib/docs-api';
import { Toast } from '../components/toast';

export default function DocsListPage() {
  return (
    <AdminShell>
      <ListInner />
    </AdminShell>
  );
}

function ListInner() {
  const [rows, setRows] = useState<DocArticle[]>([]);
  const [cats, setCats] = useState<DocCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const [articles, categories] = await Promise.all([listArticles(), listCategories()]);
      setRows(articles);
      setCats(categories);
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

  const catName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cats) m.set(c.id, c.name);
    return m;
  }, [cats]);

  const catSlug = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cats) m.set(c.id, c.slug);
    return m;
  }, [cats]);

  async function handleDelete(slug: string, title: string) {
    if (!confirm(`Delete "${title}" (${slug})?\n\nThis removes the article from livinity.io/docs immediately.`)) {
      return;
    }
    try {
      await deleteArticle(slug);
      setRows((rs) => rs.filter((r) => r.slug !== slug));
      setToast({ msg: `Deleted ${slug}.` });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : String(err), error: true });
    }
  }

  return (
    <>
      <div className="admin-ph">
        <div>
          <div className="admin-ph-eyebrow">{rows.length} articles · documentation</div>
          <h1 className="admin-ph-title">
            Manage the <em>docs</em>
          </h1>
          <p className="admin-ph-sub">
            Write install guides and how-tos. Published articles appear on
            livinity.io/docs immediately.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" type="button" onClick={reload}>
            Refresh
          </button>
          <Link href="/admin/docs/categories" className="btn ghost">
            Categories
          </Link>
          <Link href="/admin/docs/new" className="btn primary">
            + New article
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
                  <th>Article</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Updated</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="row-name">{row.title}</span>{' '}
                      <span className="row-slug">/{row.slug}</span>
                    </td>
                    <td>
                      <span className="section-chip">
                        {catName.get(row.category_id) ?? 'uncategorized'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {row.published ? (
                        <span style={{ color: 'var(--green, #16a34a)' }}>● Published</span>
                      ) : (
                        <span style={{ color: 'var(--fg-mute)' }}>○ Draft</span>
                      )}
                      {row.featured && (
                        <span style={{ marginLeft: 8, color: 'var(--fg-mute)' }}>★ featured</span>
                      )}
                    </td>
                    <td
                      className="row-slug"
                      style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}
                    >
                      {new Date(row.updated_at).toLocaleDateString()}
                    </td>
                    <td className="actions">
                      {catSlug.get(row.category_id) && (
                        // Opens the real /docs URL in a new tab; admins see
                        // drafts there (preview-auth), the public still 404s.
                        <a
                          href={`/docs/${catSlug.get(row.category_id)}/${row.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn ghost sm"
                        >
                          {row.published ? 'View ↗' : 'Preview ↗'}
                        </a>
                      )}
                      <Link href={`/admin/docs/${row.slug}`} className="btn ghost sm">
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="btn danger sm"
                        onClick={() => handleDelete(row.slug, row.title)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--fg-mute)' }}>
                      No articles yet. Create your first one →
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
