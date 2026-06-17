'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '../../admin-shell';
import {
  type DocCategory,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../../lib/docs-api';
import { Toast } from '../../components/toast';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function CategoriesPage() {
  return (
    <AdminShell>
      <Inner />
    </AdminShell>
  );
}

function Inner() {
  const [rows, setRows] = useState<DocCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  // New category form
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [sortOrder, setSortOrder] = useState(100);
  const [creating, setCreating] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      setRows(await listCategories());
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await createCategory({ name, slug, sort_order: Number(sortOrder) || 100 });
      setName('');
      setSlug('');
      setSlugTouched(false);
      setSortOrder(100);
      setToast({ msg: 'Category created.' });
      reload();
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveRow(c: DocCategory, patch: Partial<DocCategory>) {
    try {
      const updated = await updateCategory(c.id, patch);
      setRows((rs) => rs.map((r) => (r.id === c.id ? updated : r)));
      setToast({ msg: 'Saved.' });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : String(err), error: true });
    }
  }

  async function handleDelete(c: DocCategory) {
    if (!confirm(`Delete category "${c.name}"?\n\nCategories with articles can't be deleted — move the articles first.`)) {
      return;
    }
    try {
      await deleteCategory(c.id);
      setRows((rs) => rs.filter((r) => r.id !== c.id));
      setToast({ msg: 'Deleted.' });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : String(err), error: true });
    }
  }

  return (
    <>
      <div className="admin-ph">
        <div>
          <div className="admin-ph-eyebrow">{rows.length} categories</div>
          <h1 className="admin-ph-title">
            Docs <em>categories</em>
          </h1>
          <p className="admin-ph-sub">
            Categories group articles into sidebar sections on livinity.io/docs.
          </p>
        </div>
        <Link href="/admin/docs" className="btn ghost">
          ← Articles
        </Link>
      </div>

      <form className="form" onSubmit={handleCreate}>
        <div className="form-row two-col">
          <div>
            <label className="form-label">Name</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              required
              placeholder="Getting Started"
            />
          </div>
          <div>
            <label className="form-label">Slug</label>
            <input
              type="text"
              className="form-input"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              required
              placeholder="getting-started"
              pattern="[a-z0-9-]+"
            />
          </div>
        </div>
        <div className="form-row two-col">
          <div>
            <label className="form-label">Sort order</label>
            <input
              type="number"
              className="form-input"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="btn primary" disabled={creating}>
              {creating ? 'Adding…' : '+ Add category'}
            </button>
          </div>
        </div>
      </form>

      {loading ? (
        <p style={{ color: 'var(--fg-mute)', fontSize: 14 }}>Loading…</p>
      ) : (
        <div className="table" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th style={{ width: 110 }}>Sort</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <CategoryRow key={c.id} cat={c} onSave={handleSaveRow} onDelete={handleDelete} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--fg-mute)' }}>
                    No categories yet — add one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {toast && <Toast msg={toast.msg} error={toast.error} onClose={() => setToast(null)} />}
    </>
  );
}

function CategoryRow({
  cat,
  onSave,
  onDelete,
}: {
  cat: DocCategory;
  onSave: (c: DocCategory, patch: Partial<DocCategory>) => void;
  onDelete: (c: DocCategory) => void;
}) {
  const [name, setName] = useState(cat.name);
  const [sort, setSort] = useState(cat.sort_order);
  const dirty = name !== cat.name || sort !== cat.sort_order;

  return (
    <tr>
      <td>
        <input
          type="text"
          className="form-input"
          style={{ maxWidth: 280 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </td>
      <td className="row-slug" style={{ fontFamily: 'var(--mono)' }}>
        /{cat.slug}
      </td>
      <td>
        <input
          type="number"
          className="form-input"
          style={{ width: 90 }}
          value={sort}
          onChange={(e) => setSort(Number(e.target.value))}
        />
      </td>
      <td className="actions">
        <button
          type="button"
          className="btn ghost sm"
          disabled={!dirty}
          onClick={() => onSave(cat, { name, sort_order: Number(sort) || 100 })}
        >
          Save
        </button>
        <button type="button" className="btn danger sm" onClick={() => onDelete(cat)}>
          Delete
        </button>
      </td>
    </tr>
  );
}
