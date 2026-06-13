'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminShell } from '../admin-shell';
import { formatDate, timeAgo } from '../components/format';
import {
  getFeedback,
  updateFeedback,
  type FeedbackItem,
  type FeedbackListResult,
} from '../lib/admin-api';

// Status filter chips. 'all' is a UI-only sentinel (sent as no filter).
const STATUS_FILTERS = ['all', 'new', 'seen', 'in_progress', 'resolved'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

// Status options offered in the per-row triage dropdown (matches the route's
// allow-list).
const STATUS_OPTIONS = ['new', 'seen', 'in_progress', 'resolved', 'wont_fix'] as const;

const STATUS_LABEL: Record<string, string> = {
  all: 'All',
  new: 'New',
  seen: 'Seen',
  in_progress: 'In progress',
  resolved: 'Resolved',
  wont_fix: "Won't fix",
};

// Type → badge tone (per spec: bug=red, feedback=blue, request=amber,
// question=mute; other → default).
function typeBadgeClass(type: string): string {
  switch (type) {
    case 'bug':
      return 'badge badge-red';
    case 'feedback':
      return 'badge badge-blue';
    case 'request':
      return 'badge badge-amber';
    case 'question':
      return 'badge badge-mute';
    default:
      return 'badge';
  }
}

function severityBadgeClass(sev: string | null): string {
  switch (sev) {
    case 'critical':
    case 'high':
      return 'badge badge-red';
    case 'medium':
      return 'badge badge-amber';
    case 'low':
      return 'badge badge-mute';
    default:
      return 'badge';
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'new':
      return 'badge badge-blue';
    case 'in_progress':
      return 'badge badge-amber';
    case 'resolved':
      return 'badge badge-green';
    case 'wont_fix':
      return 'badge badge-mute';
    default:
      return 'badge';
  }
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--r-sm)',
  padding: '8px 12px',
  fontSize: 13,
  color: 'var(--fg)',
  fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--fg-mute)',
};

/** Single read-only field in the detail panel. */
function DetailField({
  label,
  value,
  mono,
  rtl,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  rtl?: boolean;
}) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={labelStyle}>{label}</span>
      {mono ? (
        <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{value}</code>
      ) : (
        <span
          dir={rtl ? 'auto' : undefined}
          style={{ fontSize: 13, color: 'var(--fg)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {value}
        </span>
      )}
    </div>
  );
}

function DetailPanel({
  item,
  onSaved,
}: {
  item: FeedbackItem;
  onSaved: (updated: FeedbackItem) => void;
}) {
  const [status, setStatus] = useState(item.status || 'new');
  const [note, setNote] = useState(item.admin_note ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Re-sync local edit state when a different row's panel mounts/changes.
  useEffect(() => {
    setStatus(item.status || 'new');
    setNote(item.admin_note ?? '');
    setSaveError(null);
  }, [item.id, item.status, item.admin_note]);

  const dirty = status !== (item.status || 'new') || note !== (item.admin_note ?? '');

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateFeedback(item.id, { status, admin_note: note });
      onSaved(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gap: 16,
        padding: '16px 18px',
        background: 'var(--bg-2)',
        borderTop: '1px solid var(--line)',
      }}
    >
      <DetailField label="Message" value={item.message} rtl />
      <DetailField label="Steps to reproduce" value={item.steps} rtl />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        <DetailField label="Area" value={item.area} />
        <DetailField label="Contact" value={item.contact} mono />
        <DetailField label="App version" value={item.app_version} mono />
        <DetailField label="User ID" value={item.user_id} mono />
        <DetailField label="Page URL" value={item.page_url} mono />
        <DetailField label="User agent" value={item.user_agent} mono />
        <DetailField label="Created" value={formatDate(item.created_at)} />
        <DetailField label="Updated" value={formatDate(item.updated_at)} />
      </div>

      {/* Triage controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end',
          paddingTop: 4,
          borderTop: '1px solid var(--line)',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelStyle}>Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ ...inputStyle, minWidth: 150 }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s] ?? s}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 220 }}>
          <span style={labelStyle}>Admin note</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Internal triage note…"
            rows={3}
            dir="auto"
            style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
          />
        </label>

        <button
          type="button"
          className="admin-btn"
          disabled={saving || !dirty}
          onClick={() => void handleSave()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {saveError ? <p style={{ color: 'var(--red)', margin: 0, fontSize: 13 }}>Error: {saveError}</p> : null}
    </div>
  );
}

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Guard against stale responses clobbering newer ones on rapid filter clicks.
  const reqSeq = useRef(0);

  const load = useCallback(async (status: StatusFilter) => {
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      const res: FeedbackListResult = await getFeedback({
        status: status === 'all' ? undefined : status,
        limit: 200,
      });
      if (seq !== reqSeq.current) return; // superseded
      setItems(res.items);
      setCounts(res.counts ?? {});
    } catch (err) {
      if (seq !== reqSeq.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [load, filter]);

  // Merge a saved row back into the list in place (and into the active filter).
  const handleSaved = useCallback(
    (updated: FeedbackItem) => {
      setItems((prev) => {
        // If the row no longer matches the active filter, drop it from view.
        if (filter !== 'all' && updated.status !== filter) {
          return prev.filter((it) => it.id !== updated.id);
        }
        return prev.map((it) => (it.id === updated.id ? updated : it));
      });
      // Counts may have shifted — refetch them lazily in the background.
      void load(filter);
    },
    [filter, load],
  );

  return (
    <AdminShell>
      <div className="admin-page">
        <header className="admin-page-head">
          <h1>Feedback</h1>
          <p className="admin-page-sub">User-reported bugs &amp; requests</p>
        </header>

        {/* Status filter chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {STATUS_FILTERS.map((s) => {
            const active = filter === s;
            const count = s === 'all' ? undefined : counts[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setFilter(s);
                  setExpandedId(null);
                }}
                className="admin-btn"
                style={{
                  borderColor: active ? 'var(--fg)' : 'var(--line)',
                  background: active ? 'var(--bg-2)' : 'transparent',
                  fontWeight: active ? 600 : 400,
                }}
              >
                {STATUS_LABEL[s] ?? s}
                {count != null ? <span style={{ color: 'var(--fg-mute)' }}> · {count}</span> : null}
              </button>
            );
          })}
        </div>

        {error ? <p style={{ color: 'var(--red)', margin: 0 }}>Error: {error}</p> : null}
        {loading ? <p style={{ color: 'var(--fg-mute)', margin: 0 }}>Loading…</p> : null}

        {!loading && items.length === 0 ? (
          <div className="admin-empty">
            <strong>No feedback yet.</strong>
            <p>
              User-submitted bugs and requests will appear here once the in-app
              feedback button is used. (If you just shipped this, the{' '}
              <code>feedback</code> table may not be provisioned yet — the list
              degrades to empty rather than erroring.)
            </p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Title / Message</th>
                  <th>Area</th>
                  <th>Severity</th>
                  <th>User</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const expanded = expandedId === it.id;
                  return (
                    <FeedbackRows
                      key={it.id}
                      item={it}
                      expanded={expanded}
                      onToggle={() => setExpandedId(expanded ? null : it.id)}
                      onSaved={handleSaved}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}

// Two <tr>s per item: the summary row + (when expanded) the detail row.
function FeedbackRows({
  item,
  expanded,
  onToggle,
  onSaved,
}: {
  item: FeedbackItem;
  expanded: boolean;
  onToggle: () => void;
  onSaved: (updated: FeedbackItem) => void;
}) {
  const preview = (item.title || item.message || '').slice(0, 140);
  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: 'pointer', background: expanded ? 'var(--bg-2)' : undefined }}
      >
        <td>
          <span className={typeBadgeClass(item.type)}>{item.type}</span>
        </td>
        <td style={{ maxWidth: 420 }}>
          {item.title ? (
            <div dir="auto" style={{ fontWeight: 600 }}>
              {item.title}
            </div>
          ) : null}
          <div
            dir="auto"
            style={{
              color: 'var(--fg-mute)',
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 400,
            }}
          >
            {item.title ? item.message.slice(0, 140) : preview}
          </div>
        </td>
        <td style={{ color: 'var(--fg-dim)', whiteSpace: 'nowrap' }}>{item.area ?? '—'}</td>
        <td>
          {item.severity ? (
            <span className={severityBadgeClass(item.severity)}>{item.severity}</span>
          ) : (
            <span style={{ color: 'var(--fg-mute)' }}>—</span>
          )}
        </td>
        <td style={{ whiteSpace: 'nowrap' }}>
          {item.username ?? (item.user_id ? <code>{item.user_id.slice(0, 8)}</code> : '—')}
        </td>
        <td>
          <span className={statusBadgeClass(item.status)}>{item.status}</span>
        </td>
        <td style={{ color: 'var(--fg-mute)', whiteSpace: 'nowrap' }} title={item.created_at}>
          {timeAgo(item.created_at)}
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={7} style={{ padding: 0 }}>
            <DetailPanel item={item} onSaved={onSaved} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
