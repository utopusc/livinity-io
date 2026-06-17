'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  type DocArticle,
  type DocCategory,
  createArticle,
  updateArticle,
  listCategories,
  uploadDocImage,
} from '../lib/docs-api';
import { DocsMarkdown } from '../../docs/_components/markdown';
import { Toast } from './toast';

type FormState = {
  slug: string;
  title: string;
  description: string;
  category_id: string;
  content: string;
  cover_url: string;
  published: boolean;
  featured: boolean;
  sort_order: number;
};

function articleToForm(a: DocArticle): FormState {
  return {
    slug: a.slug,
    title: a.title,
    description: a.description,
    category_id: a.category_id,
    content: a.content,
    cover_url: a.cover_url ?? '',
    published: a.published,
    featured: a.featured,
    sort_order: a.sort_order,
  };
}

function defaultForm(): FormState {
  return {
    slug: '',
    title: '',
    description: '',
    category_id: '',
    content: '',
    cover_url: '',
    published: false,
    featured: false,
    sort_order: 100,
  };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function ArticleForm({ initial }: { initial?: DocArticle }) {
  const router = useRouter();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const isEdit = !!initial;

  const [state, setState] = useState<FormState>(() =>
    initial ? articleToForm(initial) : defaultForm(),
  );
  const [categories, setCategories] = useState<DocCategory[]>([]);
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [insertingImage, setInsertingImage] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  useEffect(() => {
    listCategories()
      .then((cats) => {
        setCategories(cats);
        // Default the category select to the first one when creating.
        setState((s) =>
          !s.category_id && cats[0] ? { ...s, category_id: cats[0].id } : s,
        );
      })
      .catch((err) =>
        setToast({ msg: err instanceof Error ? err.message : String(err), error: true }),
      );
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function handleTitleChange(value: string) {
    setState((s) => ({
      ...s,
      title: value,
      slug: slugTouched ? s.slug : slugify(value),
    }));
  }

  async function handleCoverFile(file: File) {
    setUploadingCover(true);
    try {
      const url = await uploadDocImage(state.slug || slugify(state.title), file);
      set('cover_url', url);
      setToast({ msg: 'Cover uploaded.' });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleInlineImage(file: File) {
    setInsertingImage(true);
    try {
      const url = await uploadDocImage(state.slug || slugify(state.title), file);
      const altGuess = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
      const snippet = `\n\n![${altGuess}](${url})\n\n`;
      const el = contentRef.current;
      const at = el ? el.selectionStart : state.content.length;
      const next = state.content.slice(0, at) + snippet + state.content.slice(at);
      set('content', next);
      setToast({ msg: 'Image inserted into the article.' });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      setInsertingImage(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!state.category_id) {
      setToast({ msg: 'Pick a category (create one first if the list is empty).', error: true });
      return;
    }
    setSubmitting(true);
    try {
      const body: Partial<DocArticle> = {
        slug: state.slug,
        title: state.title,
        description: state.description,
        category_id: state.category_id,
        content: state.content,
        cover_url: state.cover_url || null,
        published: state.published,
        featured: state.featured,
        sort_order: Number(state.sort_order) || 100,
      };
      if (isEdit && initial) {
        await updateArticle(initial.slug, body);
        setToast({ msg: 'Saved.' });
      } else {
        await createArticle(body);
        setToast({ msg: 'Created.' });
      }
      setTimeout(() => router.push('/admin/docs'), 600);
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form-row two-col">
        <div>
          <label className="form-label">Title</label>
          <input
            type="text"
            className="form-input"
            value={state.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            required
            placeholder="Installing LivOS on Ubuntu"
          />
        </div>
        <div>
          <label className="form-label">Slug</label>
          <input
            type="text"
            className="form-input"
            value={state.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set('slug', e.target.value);
            }}
            disabled={isEdit}
            required
            placeholder="installing-livos-ubuntu"
            pattern="[a-z0-9-]+"
            title="lowercase letters, digits and hyphens"
          />
          <div className="form-help">
            URL: <code>/docs/&lt;category&gt;/{state.slug || '<slug>'}</code>. Locked after creation.
          </div>
        </div>
      </div>

      <div className="form-row two-col">
        <div>
          <label className="form-label">Category</label>
          <select
            className="form-select"
            value={state.category_id}
            onChange={(e) => set('category_id', e.target.value)}
          >
            {categories.length === 0 && <option value="">No categories yet</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="form-help">
            Manage categories under <code>/admin/docs/categories</code>.
          </div>
        </div>
        <div>
          <label className="form-label">Sort order</label>
          <input
            type="number"
            className="form-input"
            value={state.sort_order}
            onChange={(e) => set('sort_order', Number(e.target.value))}
            placeholder="100"
          />
          <div className="form-help">Lower numbers appear first in the sidebar.</div>
        </div>
      </div>

      <div className="form-row">
        <label className="form-label">Description</label>
        <input
          type="text"
          className="form-input"
          value={state.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="One-line summary — shown in lists and as the SEO description."
          maxLength={200}
        />
      </div>

      <div className="form-row">
        <label className="form-label">Cover image</label>
        <div className="icon-uploader">
          <div className="icon-preview">
            {state.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={state.cover_url} alt="cover" />
            ) : (
              <span>none</span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <input
              type="text"
              className="form-input"
              value={state.cover_url}
              onChange={(e) => set('cover_url', e.target.value)}
              placeholder="https://… (optional)"
            />
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingCover}
              >
                {uploadingCover ? 'Uploading…' : 'Upload cover'}
              </button>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCoverFile(f);
                }}
              />
            </div>
          </div>
        </div>
        <div className="form-help">Max 2 MB · PNG / JPEG / WebP / SVG.</div>
      </div>

      <div className="form-row">
        <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
            Content <span style={{ color: 'var(--fg-mute)', fontWeight: 400, fontSize: 11 }}>· markdown</span>
          </span>
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => inlineInputRef.current?.click()}
              disabled={insertingImage}
            >
              {insertingImage ? 'Uploading…' : '＋ Insert image'}
            </button>
            <input
              ref={inlineInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleInlineImage(f);
                e.target.value = '';
              }}
            />
          </span>
        </label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 12,
            alignItems: 'stretch',
          }}
        >
          <textarea
            ref={contentRef}
            className="form-textarea tall"
            style={{ minHeight: 460, fontFamily: 'var(--mono)', fontSize: 13 }}
            value={state.content}
            onChange={(e) => set('content', e.target.value)}
            spellCheck={false}
            placeholder={'## Heading\n\nWrite the guide here. Use `code`, lists, > callouts, and the Insert image button.'}
          />
          <div
            style={{
              minHeight: 460,
              overflow: 'auto',
              background: 'var(--bg)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r)',
              padding: '20px 24px',
            }}
          >
            {state.content.trim() ? (
              <DocsMarkdown content={state.content} />
            ) : (
              <p style={{ color: 'var(--fg-mute)', fontSize: 13 }}>Live preview…</p>
            )}
          </div>
        </div>
      </div>

      <div className="form-row two-col">
        <label className="form-check">
          <input
            type="checkbox"
            checked={state.published}
            onChange={(e) => set('published', e.target.checked)}
          />
          Published (visible on livinity.io/docs)
        </label>
        <label className="form-check">
          <input
            type="checkbox"
            checked={state.featured}
            onChange={(e) => set('featured', e.target.checked)}
          />
          Featured (highlighted on the docs home)
        </label>
      </div>

      <div className="form-actions">
        <div className="left" />
        <button type="button" className="btn ghost" onClick={() => router.push('/admin/docs')}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={submitting}>
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create article'}
        </button>
      </div>

      {toast && <Toast msg={toast.msg} error={toast.error} onClose={() => setToast(null)} />}
    </form>
  );
}
