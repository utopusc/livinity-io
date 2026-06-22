'use client';

// Phase 293 (Wave 1) — visual template gallery. Replaces the plain <select>
// "start from a template" with a browsable card grid grouped by kind. Clicking a
// card calls onPick(key); the form then loads the preset blocks into the builder.
// Pure inline styles over admin CSS vars (var(--line)/--bg/--fg/--fg-mute) — NO
// hardcoded hex, so it inherits the admin light/dark theme automatically.

import {
  ANNOUNCEMENT_TEMPLATES,
  KIND_ICON,
  KIND_LABEL,
  templateIcon,
  type AnnouncementTemplate,
} from '../lib/announcement-templates';
import type { Announcement } from '../lib/announcements-api';

const KIND_ORDER: Announcement['kind'][] = [
  'announcement',
  'feature',
  'campaign',
  'promo',
  'feedback',
];

function groupByKind(): [Announcement['kind'], AnnouncementTemplate[]][] {
  const groups = new Map<Announcement['kind'], AnnouncementTemplate[]>();
  for (const t of ANNOUNCEMENT_TEMPLATES) {
    const arr = groups.get(t.kind) ?? [];
    arr.push(t);
    groups.set(t.kind, arr);
  }
  // Stable, intentional kind ordering; any unknown kind falls to the end.
  const ordered = KIND_ORDER.filter((k) => groups.has(k));
  for (const k of groups.keys()) if (!ordered.includes(k)) ordered.push(k);
  return ordered.map((k) => [k, groups.get(k) ?? []]);
}

export function TemplateGallery({
  onPick,
  onClose,
}: {
  onPick: (key: string) => void;
  onClose?: () => void;
}) {
  const grouped = groupByKind();

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 'var(--r)',
        background: 'var(--bg)',
        padding: 14,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          Choose a template
          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--fg-mute)', fontWeight: 400 }}>
            {ANNOUNCEMENT_TEMPLATES.length} presets · loads editable blocks
          </span>
        </div>
        {onClose && (
          <button type="button" className="btn ghost sm" onClick={onClose}>
            ✕ Close
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {grouped.map(([kind, templates]) => (
          <div key={kind}>
            <div
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                color: 'var(--fg-mute)',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span aria-hidden="true">{KIND_ICON[kind]}</span>
              {KIND_LABEL[kind] ?? kind}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                gap: 10,
              }}
            >
              {templates.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onPick(t.key)}
                  title={`Load the "${t.label}" template`}
                  style={{
                    textAlign: 'left',
                    border: '1px solid var(--line)',
                    borderRadius: 10,
                    background: 'var(--card, var(--bg-2, var(--bg)))',
                    padding: 12,
                    cursor: 'pointer',
                    color: 'var(--fg)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden="true">
                      {templateIcon(t)}
                    </span>
                    <span
                      className="section-chip"
                      style={{ fontSize: 10 }}
                      title={`${t.blocks.length} blocks`}
                    >
                      {t.blocks.length} blocks
                    </span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{t.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--fg-mute)', lineHeight: 1.45 }}>
                    {t.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
