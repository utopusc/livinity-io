'use client';

import { useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  type AdminApp,
  createApp,
  updateApp,
  uploadIcon,
  MANIFEST_TEMPLATES,
  CATEGORY_OPTIONS,
} from '../lib/admin-api';
import { Toast } from './toast';

type FormState = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  section: AdminApp['section'];
  version: string;
  docker_compose: string;
  manifest: string;
  icon_url: string;
  featured: boolean;
  verified: boolean;
};

function appToForm(app: AdminApp): FormState {
  return {
    slug: app.slug,
    name: app.name,
    tagline: app.tagline,
    description: app.description,
    category: app.category,
    section: app.section,
    version: app.version,
    docker_compose: app.docker_compose,
    manifest: JSON.stringify(app.manifest, null, 2),
    icon_url: app.icon_url,
    featured: app.featured,
    verified: app.verified,
  };
}

function defaultForm(): FormState {
  return {
    slug: '',
    name: '',
    tagline: '',
    description: '',
    category: 'productivity',
    section: 'app',
    version: '1.0.0',
    docker_compose: '',
    manifest: MANIFEST_TEMPLATES.app,
    icon_url: '',
    featured: false,
    verified: false,
  };
}

export function AppForm({ initial }: { initial?: AdminApp }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEdit = !!initial;

  const [state, setState] = useState<FormState>(() =>
    initial ? appToForm(initial) : defaultForm(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  const manifestParseError = useMemo(() => {
    if (!state.manifest.trim()) return null;
    try {
      JSON.parse(state.manifest);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [state.manifest]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  // When section changes, swap the manifest template only if user hasn't
  // already edited it from a template — otherwise their work would clobber.
  function handleSectionChange(newSection: AdminApp['section']) {
    const currentTemplate = MANIFEST_TEMPLATES[state.section];
    const isStillTemplate = state.manifest.trim() === currentTemplate.trim();
    setState((s) => ({
      ...s,
      section: newSection,
      manifest: isStillTemplate ? MANIFEST_TEMPLATES[newSection] : s.manifest,
    }));
  }

  async function handleIconFile(file: File) {
    if (!state.slug) {
      setToast({ msg: 'Set a slug first — icon path uses it.', error: true });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadIcon(state.slug, file);
      set('icon_url', url);
      setToast({ msg: 'Icon uploaded.' });
    } catch (err) {
      setToast({
        msg: err instanceof Error ? err.message : String(err),
        error: true,
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (manifestParseError) {
      setToast({ msg: `manifest JSON invalid: ${manifestParseError}`, error: true });
      return;
    }
    setSubmitting(true);
    try {
      const body: Partial<AdminApp> = {
        slug: state.slug,
        name: state.name,
        tagline: state.tagline,
        description: state.description,
        category: state.category,
        section: state.section,
        version: state.version,
        docker_compose: state.docker_compose,
        manifest: JSON.parse(state.manifest),
        icon_url: state.icon_url,
        featured: state.featured,
        verified: state.verified,
      };
      if (isEdit && initial) {
        await updateApp(initial.slug, body);
        setToast({ msg: 'Saved.' });
      } else {
        await createApp(body);
        setToast({ msg: 'Created.' });
      }
      // Small delay so the toast is briefly visible, then redirect.
      setTimeout(() => router.push('/admin/apps'), 600);
    } catch (err) {
      setToast({
        msg: err instanceof Error ? err.message : String(err),
        error: true,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form-row two-col">
        <div>
          <label className="form-label">Slug</label>
          <input
            type="text"
            className="form-input"
            value={state.slug}
            onChange={(e) => set('slug', e.target.value)}
            disabled={isEdit}
            required
            placeholder="my-app"
            pattern="[a-z0-9-]+"
            title="lowercase letters, digits and hyphens"
          />
          <div className="form-help">
            URL-safe handle. Used in /store/{state.slug || '<slug>'} and as the icon storage prefix. Locked after creation.
          </div>
        </div>
        <div>
          <label className="form-label">Section</label>
          <select
            className="form-select"
            value={state.section}
            onChange={(e) => handleSectionChange(e.target.value as AdminApp['section'])}
          >
            <option value="app">App (Docker)</option>
            <option value="webapp">Web App</option>
            <option value="native">Native Linux</option>
            <option value="ai">AI tool (MCP / Agent / GSD)</option>
            <option value="plugin">Plugin</option>
          </select>
          <div className="form-help">
            Determines the manifest shape. Switching sections swaps the template
            if you haven't started editing it yet.
          </div>
        </div>
      </div>

      <div className="form-row two-col">
        <div>
          <label className="form-label">Name</label>
          <input
            type="text"
            className="form-input"
            value={state.name}
            onChange={(e) => set('name', e.target.value)}
            required
            placeholder="My App"
          />
        </div>
        <div>
          <label className="form-label">Version</label>
          <input
            type="text"
            className="form-input"
            value={state.version}
            onChange={(e) => set('version', e.target.value)}
            placeholder="1.0.0"
          />
        </div>
      </div>

      <div className="form-row">
        <label className="form-label">Tagline</label>
        <input
          type="text"
          className="form-input"
          value={state.tagline}
          onChange={(e) => set('tagline', e.target.value)}
          placeholder="Short one-line pitch — shown on app cards"
          maxLength={160}
        />
      </div>

      <div className="form-row">
        <label className="form-label">Description</label>
        <textarea
          className="form-textarea"
          style={{ minHeight: 100, fontFamily: 'inherit', fontSize: 13.5 }}
          value={state.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Full description shown on the detail page."
        />
      </div>

      <div className="form-row two-col">
        <div>
          <label className="form-label">Category</label>
          <select
            className="form-select"
            value={state.category}
            onChange={(e) => set('category', e.target.value)}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">Icon</label>
          <div className="icon-uploader">
            <div className="icon-preview">
              {state.icon_url ? (
                <img src={state.icon_url} alt="icon" />
              ) : (
                <span>none</span>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <input
                type="text"
                className="form-input"
                value={state.icon_url}
                onChange={(e) => set('icon_url', e.target.value)}
                placeholder="https://..."
              />
              <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? 'Uploading…' : 'Upload file'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleIconFile(f);
                  }}
                />
              </div>
            </div>
          </div>
          <div className="form-help">
            Max 8 MB · PNG / JPEG / WebP / SVG. Stored at{' '}
            <code>app-icons/{state.slug || '<slug>'}/…</code>
          </div>
        </div>
      </div>

      <div className="form-row two-col">
        <label className="form-check">
          <input
            type="checkbox"
            checked={state.featured}
            onChange={(e) => set('featured', e.target.checked)}
          />
          Featured (promoted in /store)
        </label>
        <label className="form-check">
          <input
            type="checkbox"
            checked={state.verified}
            onChange={(e) => set('verified', e.target.checked)}
          />
          Verified (green badge on the card)
        </label>
      </div>

      <div className="form-row">
        <label className="form-label">
          Manifest <span style={{ color: 'var(--fg-mute)', fontWeight: 400, fontSize: 11 }}>· JSON · shape varies by section (SPEC.md §2)</span>
        </label>
        <textarea
          className="form-textarea tall"
          value={state.manifest}
          onChange={(e) => set('manifest', e.target.value)}
          spellCheck={false}
        />
        {manifestParseError && (
          <div className="form-help" style={{ color: 'var(--red)' }}>
            JSON parse error: {manifestParseError}
          </div>
        )}
      </div>

      {state.section === 'app' && (
        <div className="form-row">
          <label className="form-label">
            docker-compose.yml <span style={{ color: 'var(--fg-mute)', fontWeight: 400, fontSize: 11 }}>· required for section=app</span>
          </label>
          <textarea
            className="form-textarea tall"
            value={state.docker_compose}
            onChange={(e) => set('docker_compose', e.target.value)}
            spellCheck={false}
            placeholder={`version: "3.8"\nservices:\n  myapp:\n    image: ...`}
          />
        </div>
      )}

      <div className="form-actions">
        <div className="left">
          {manifestParseError && (
            <span style={{ color: 'var(--red)', fontSize: 12 }}>
              Fix manifest JSON before saving
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn ghost"
          onClick={() => router.push('/admin/apps')}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn primary"
          disabled={submitting || !!manifestParseError}
        >
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
        </button>
      </div>

      {toast && (
        <Toast
          msg={toast.msg}
          error={toast.error}
          onClose={() => setToast(null)}
        />
      )}
    </form>
  );
}
