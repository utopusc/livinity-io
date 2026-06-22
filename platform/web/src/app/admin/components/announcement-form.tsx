'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  type Announcement,
  type AnnouncementBlock,
  type AnnouncementBlockType,
  type AnnouncementInput,
  createAnnouncement,
  updateAnnouncement,
  uploadAnnouncementImage,
} from '../lib/announcements-api';
import { ANNOUNCEMENT_TEMPLATES, getTemplate } from '../lib/announcement-templates';
import { Toast } from './toast';

type Mode = 'builder' | 'html';

type FormState = {
  title: string;
  slug: string;
  kind: Announcement['kind'];
  mode: Mode;
  blocks: AnnouncementBlock[];
  raw_html: string;
  frequency: Announcement['frequency'];
  frequency_n: number;
  priority: number;
  dismissible: boolean;
  start_at: string; // datetime-local value
  end_at: string;
  target_kind: Announcement['target_kind'];
  target_user_ids: string; // newline-separated UUIDs in the UI
  target_plan_tier: string;
  status: Announcement['status'];
};

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `b-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // YYYY-MM-DDTHH:mm in local time for <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function announcementToForm(a: Announcement): FormState {
  const hasHtml = !!(a.raw_html_source && a.raw_html_source.length) || !!(a.raw_html_sanitized && a.raw_html_sanitized.length);
  return {
    title: a.title,
    slug: a.slug ?? '',
    kind: a.kind,
    mode: hasHtml ? 'html' : 'builder',
    blocks: Array.isArray(a.blocks) ? a.blocks : [],
    raw_html: a.raw_html_source ?? '',
    frequency: a.frequency,
    frequency_n: a.frequency_n ?? 1,
    priority: a.priority,
    dismissible: a.dismissible,
    start_at: toLocalInput(a.start_at),
    end_at: toLocalInput(a.end_at),
    target_kind: a.target_kind,
    target_user_ids: (a.target_user_ids ?? []).join('\n'),
    target_plan_tier: a.target_plan_tier ?? '',
    status: a.status,
  };
}

function defaultForm(): FormState {
  return {
    title: '',
    slug: '',
    kind: 'announcement',
    mode: 'builder',
    blocks: [{ id: newId(), type: 'heading', text: 'Heading' }],
    raw_html: '',
    frequency: 'once_ever',
    frequency_n: 1,
    priority: 100,
    dismissible: true,
    start_at: '',
    end_at: '',
    target_kind: 'all',
    target_user_ids: '',
    target_plan_tier: '',
    status: 'draft',
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

function blankBlock(type: AnnouncementBlockType): AnnouncementBlock {
  const id = newId();
  switch (type) {
    case 'heading': return { id, type, text: 'Heading' };
    case 'text': return { id, type, text: '' };
    case 'image': return { id, type, url: '', alt: '' };
    case 'video': return { id, type, url: '' };
    case 'step': return { id, type, title: 'Step', body: '' };
    case 'button': return { id, type, label: 'Learn more', href: 'https://' };
    case 'poll': return { id, type, question: 'Your question?', options: ['Option 1', 'Option 2'] };
    case 'feedback': return { id, type, prompt: 'Tell us more…' };
  }
}

const BLOCK_TYPES: AnnouncementBlockType[] = [
  'heading', 'text', 'image', 'video', 'step', 'button', 'poll', 'feedback',
];

export function AnnouncementForm({ initial }: { initial?: Announcement }) {
  const router = useRouter();
  const isEdit = !!initial;
  const imageInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null); // block id currently uploading into

  const [state, setState] = useState<FormState>(() =>
    initial ? announcementToForm(initial) : defaultForm(),
  );
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function handleTitleChange(value: string) {
    setState((s) => ({ ...s, title: value, slug: slugTouched ? s.slug : slugify(value) }));
  }

  // ---- block ops ----------------------------------------------------------
  function addBlock(type: AnnouncementBlockType) {
    setState((s) => ({ ...s, blocks: [...s.blocks, blankBlock(type)] }));
  }
  function patchBlock(id: string, patch: Partial<AnnouncementBlock>) {
    setState((s) => ({
      ...s,
      blocks: s.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as AnnouncementBlock) : b)),
    }));
  }
  function removeBlock(id: string) {
    setState((s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== id) }));
  }
  function moveBlock(id: string, dir: -1 | 1) {
    setState((s) => {
      const i = s.blocks.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.blocks.length) return s;
      const next = [...s.blocks];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...s, blocks: next };
    });
  }

  function loadTemplate(key: string) {
    const tpl = getTemplate(key);
    if (!tpl) return;
    setState((s) => ({
      ...s,
      kind: tpl.kind,
      title: s.title || tpl.title,
      slug: slugTouched ? s.slug : slugify(s.title || tpl.title),
      mode: 'builder',
      // regenerate block ids so poll/feedback block_ids are unique per announcement
      blocks: tpl.blocks.map((b) => ({ ...b, id: newId() })),
    }));
    setToast({ msg: `Loaded the "${tpl.label}" template.` });
  }

  async function handleImageFile(file: File) {
    const blockId = uploadTargetRef.current;
    if (!blockId) return;
    try {
      const idForPrefix = state.slug || slugify(state.title) || 'draft';
      const url = await uploadAnnouncementImage(idForPrefix, file);
      patchBlock(blockId, { url } as Partial<AnnouncementBlock>);
      setToast({ msg: 'Image uploaded.' });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      uploadTargetRef.current = null;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!state.title.trim()) {
      setToast({ msg: 'A title is required.', error: true });
      return;
    }
    setSubmitting(true);
    try {
      // Submit per active mode: raw_html present → the box renders the sandboxed
      // iframe; otherwise it renders the native blocks. Only one is populated so
      // the renderer's "html ? iframe : blocks" rule is unambiguous.
      const isHtml = state.mode === 'html';
      const body: AnnouncementInput = {
        title: state.title.trim(),
        slug: state.slug.trim() || null,
        kind: state.kind,
        blocks: isHtml ? [] : state.blocks,
        raw_html: isHtml ? state.raw_html : '',
        frequency: state.frequency,
        frequency_n: state.frequency === 'n_times' ? Number(state.frequency_n) || 1 : null,
        priority: Number(state.priority) || 100,
        dismissible: state.dismissible,
        start_at: fromLocalInput(state.start_at),
        end_at: fromLocalInput(state.end_at),
        // MVP targeting per DEC-08; app-affinity/behavioral segments deferred.
        target_kind: state.target_kind,
        target_user_ids:
          state.target_kind === 'user_ids'
            ? state.target_user_ids.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
            : [],
        target_plan_tier: state.target_kind === 'plan_tier' ? state.target_plan_tier.trim() || null : null,
        status: state.status,
      };
      if (isEdit && initial) {
        await updateAnnouncement(initial.id, body);
        setToast({ msg: 'Saved.' });
      } else {
        await createAnnouncement(body);
        setToast({ msg: 'Created.' });
      }
      setTimeout(() => router.push('/admin/announcements'), 600);
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      {/* Title + slug + kind */}
      <div className="form-row two-col">
        <div>
          <label className="form-label">Title</label>
          <input
            type="text"
            className="form-input"
            value={state.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            required
            placeholder="What's new in LivOS"
          />
        </div>
        <div>
          <label className="form-label">Slug (optional)</label>
          <input
            type="text"
            className="form-input"
            value={state.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set('slug', e.target.value);
            }}
            placeholder="whats-new"
            pattern="[a-z0-9-]*"
            title="lowercase letters, digits and hyphens"
          />
        </div>
      </div>

      <div className="form-row two-col">
        <div>
          <label className="form-label">Kind</label>
          <select className="form-select" value={state.kind} onChange={(e) => set('kind', e.target.value as Announcement['kind'])}>
            <option value="announcement">Announcement</option>
            <option value="campaign">Campaign / discount</option>
            <option value="promo">Product promo</option>
            <option value="feature">Feature reveal</option>
            <option value="feedback">Feedback request</option>
          </select>
        </div>
        <div>
          <label className="form-label">Start from a template</label>
          <select
            className="form-select"
            value=""
            onChange={(e) => {
              if (e.target.value) loadTemplate(e.target.value);
              e.target.value = '';
            }}
          >
            <option value="">— pick a template —</option>
            {ANNOUNCEMENT_TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <div className="form-help">Loads preset blocks you can then edit.</div>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="form-row">
        <label className="form-label">Content mode</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={`btn ${state.mode === 'builder' ? 'primary' : 'ghost'} sm`}
            onClick={() => set('mode', 'builder')}
          >
            Visual builder
          </button>
          <button
            type="button"
            className={`btn ${state.mode === 'html' ? 'primary' : 'ghost'} sm`}
            onClick={() => set('mode', 'html')}
          >
            Raw HTML
          </button>
        </div>
      </div>

      {/* Hidden file input shared by image blocks */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImageFile(f);
          e.target.value = '';
        }}
      />

      {/* Builder mode */}
      {state.mode === 'builder' && (
        <div className="form-row">
          <label className="form-label">Content blocks</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {state.blocks.map((b, idx) => (
              <div
                key={b.id}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r)',
                  padding: 12,
                  background: 'var(--bg)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span className="section-chip">{b.type}</span>
                  <span style={{ display: 'inline-flex', gap: 4 }}>
                    <button type="button" className="btn ghost sm" onClick={() => moveBlock(b.id, -1)} disabled={idx === 0}>↑</button>
                    <button type="button" className="btn ghost sm" onClick={() => moveBlock(b.id, 1)} disabled={idx === state.blocks.length - 1}>↓</button>
                    <button type="button" className="btn danger sm" onClick={() => removeBlock(b.id)}>Remove</button>
                  </span>
                </div>
                <BlockEditor
                  block={b}
                  onPatch={(patch) => patchBlock(b.id, patch)}
                  onPickImage={() => {
                    uploadTargetRef.current = b.id;
                    imageInputRef.current?.click();
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {BLOCK_TYPES.map((t) => (
              <button key={t} type="button" className="btn ghost sm" onClick={() => addBlock(t)}>
                ＋ {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Raw HTML mode */}
      {state.mode === 'html' && (
        <div className="form-row">
          <label className="form-label">Raw HTML</label>
          <textarea
            className="form-textarea tall"
            style={{ minHeight: 280, fontFamily: 'var(--mono)', fontSize: 13 }}
            value={state.raw_html}
            onChange={(e) => set('raw_html', e.target.value)}
            spellCheck={false}
            placeholder="<h2>Big news</h2><p>Paste rich HTML here…</p>"
          />
          <div className="form-help">
            HTML is sanitized at publish and rendered inside a sandboxed iframe on every desktop —
            scripts never run. A live sandboxed preview is shown on the box.
          </div>
        </div>
      )}

      {/* Display settings */}
      <div className="form-row two-col">
        <div>
          <label className="form-label">Frequency</label>
          <select className="form-select" value={state.frequency} onChange={(e) => set('frequency', e.target.value as Announcement['frequency'])}>
            <option value="once_ever">Once ever</option>
            <option value="once_per_day">Once per day</option>
            <option value="n_times">N times</option>
          </select>
          {state.frequency === 'n_times' && (
            <input
              type="number"
              className="form-input"
              style={{ marginTop: 6 }}
              min={1}
              value={state.frequency_n}
              onChange={(e) => set('frequency_n', Number(e.target.value))}
              placeholder="3"
            />
          )}
        </div>
        <div>
          <label className="form-label">Priority</label>
          <input
            type="number"
            className="form-input"
            value={state.priority}
            onChange={(e) => set('priority', Number(e.target.value))}
            placeholder="100"
          />
          <div className="form-help">Lower number = higher priority (shown first when several stack).</div>
        </div>
      </div>

      <div className="form-row two-col">
        <div>
          <label className="form-label">Start at (optional)</label>
          <input type="datetime-local" className="form-input" value={state.start_at} onChange={(e) => set('start_at', e.target.value)} />
        </div>
        <div>
          <label className="form-label">End at (optional)</label>
          <input type="datetime-local" className="form-input" value={state.end_at} onChange={(e) => set('end_at', e.target.value)} />
        </div>
      </div>

      <div className="form-row two-col">
        <label className="form-check">
          <input type="checkbox" checked={state.dismissible} onChange={(e) => set('dismissible', e.target.checked)} />
          Dismissible (user can close it)
        </label>
        <div>
          <label className="form-label">Status</label>
          <select className="form-select" value={state.status} onChange={(e) => set('status', e.target.value as Announcement['status'])}>
            <option value="draft">Draft</option>
            <option value="published">Published (live to the fleet)</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* Targeting (MVP per DEC-08) */}
      <div className="form-row">
        <label className="form-label">Targeting</label>
        <select className="form-select" value={state.target_kind} onChange={(e) => set('target_kind', e.target.value as Announcement['target_kind'])}>
          <option value="all">Everyone</option>
          <option value="user_ids">Specific users (by ID)</option>
          <option value="plan_tier">By plan tier</option>
        </select>
        {state.target_kind === 'user_ids' && (
          <textarea
            className="form-textarea"
            style={{ marginTop: 6, minHeight: 90, fontFamily: 'var(--mono)', fontSize: 12 }}
            value={state.target_user_ids}
            onChange={(e) => set('target_user_ids', e.target.value)}
            placeholder="One cloud user UUID per line"
          />
        )}
        {state.target_kind === 'plan_tier' && (
          <input
            type="text"
            className="form-input"
            style={{ marginTop: 6 }}
            value={state.target_plan_tier}
            onChange={(e) => set('target_plan_tier', e.target.value)}
            placeholder="e.g. free / trialing / active / past_due / comp"
          />
        )}
      </div>

      <div className="form-actions">
        <div className="left" />
        <button type="button" className="btn ghost" onClick={() => router.push('/admin/announcements')}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={submitting}>
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create announcement'}
        </button>
      </div>

      {toast && <Toast msg={toast.msg} error={toast.error} onClose={() => setToast(null)} />}
    </form>
  );
}

// ---- per-block editors ----------------------------------------------------

function BlockEditor({
  block,
  onPatch,
  onPickImage,
}: {
  block: AnnouncementBlock;
  onPatch: (patch: Partial<AnnouncementBlock>) => void;
  onPickImage: () => void;
}) {
  switch (block.type) {
    case 'heading':
      return (
        <input
          type="text"
          className="form-input"
          value={block.text}
          onChange={(e) => onPatch({ text: e.target.value } as Partial<AnnouncementBlock>)}
          placeholder="Heading text"
        />
      );
    case 'text':
      return (
        <textarea
          className="form-textarea"
          style={{ minHeight: 80 }}
          value={block.text}
          onChange={(e) => onPatch({ text: e.target.value } as Partial<AnnouncementBlock>)}
          placeholder="Paragraph text"
        />
      );
    case 'image':
      return (
        <div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              className="form-input"
              value={block.url}
              onChange={(e) => onPatch({ url: e.target.value } as Partial<AnnouncementBlock>)}
              placeholder="https://… image URL"
            />
            <button type="button" className="btn ghost sm" onClick={onPickImage}>
              Upload
            </button>
          </div>
          <input
            type="text"
            className="form-input"
            style={{ marginTop: 6 }}
            value={block.alt ?? ''}
            onChange={(e) => onPatch({ alt: e.target.value } as Partial<AnnouncementBlock>)}
            placeholder="Alt text"
          />
        </div>
      );
    case 'video':
      return (
        <input
          type="text"
          className="form-input"
          value={block.url}
          onChange={(e) => onPatch({ url: e.target.value } as Partial<AnnouncementBlock>)}
          placeholder="https://… video (mp4/webm) URL"
        />
      );
    case 'step':
      return (
        <div>
          <input
            type="text"
            className="form-input"
            value={block.title}
            onChange={(e) => onPatch({ title: e.target.value } as Partial<AnnouncementBlock>)}
            placeholder="Step title"
          />
          <textarea
            className="form-textarea"
            style={{ marginTop: 6, minHeight: 70 }}
            value={block.body}
            onChange={(e) => onPatch({ body: e.target.value } as Partial<AnnouncementBlock>)}
            placeholder="Step description"
          />
        </div>
      );
    case 'button':
      return (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            className="form-input"
            value={block.label}
            onChange={(e) => onPatch({ label: e.target.value } as Partial<AnnouncementBlock>)}
            placeholder="Button label"
          />
          <input
            type="text"
            className="form-input"
            value={block.href}
            onChange={(e) => onPatch({ href: e.target.value } as Partial<AnnouncementBlock>)}
            placeholder="https://… link"
          />
        </div>
      );
    case 'poll':
      return (
        <div>
          <input
            type="text"
            className="form-input"
            value={block.question}
            onChange={(e) => onPatch({ question: e.target.value } as Partial<AnnouncementBlock>)}
            placeholder="Poll question"
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            {block.options.map((opt, i) => (
              <div key={i} style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  className="form-input"
                  value={opt}
                  onChange={(e) => {
                    const next = [...block.options];
                    next[i] = e.target.value;
                    onPatch({ options: next } as Partial<AnnouncementBlock>);
                  }}
                  placeholder={`Option ${i + 1}`}
                />
                <button
                  type="button"
                  className="btn danger sm"
                  onClick={() => onPatch({ options: block.options.filter((_, j) => j !== i) } as Partial<AnnouncementBlock>)}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn ghost sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => onPatch({ options: [...block.options, `Option ${block.options.length + 1}`] } as Partial<AnnouncementBlock>)}
            >
              ＋ option
            </button>
          </div>
        </div>
      );
    case 'feedback':
      return (
        <input
          type="text"
          className="form-input"
          value={block.prompt}
          onChange={(e) => onPatch({ prompt: e.target.value } as Partial<AnnouncementBlock>)}
          placeholder="Free-text prompt (e.g. Anything else?)"
        />
      );
  }
}
