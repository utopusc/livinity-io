'use client';

// Live preview of an announcement as it will appear in the LivOS desktop pop-up.
// Blocks render natively; raw HTML renders inside a sandboxed iframe (NO
// allow-scripts) — the same wall the box uses, so the admin sees a faithful,
// safe preview while editing. (This is a preview of the admin's own content; the
// fleet render additionally DOMPurify-sanitizes at publish + at render.)

import type { AnnouncementBlock } from '../lib/announcements-api';

const ANNOUNCEMENT_SANDBOX = 'allow-popups allow-popups-to-escape-sandbox';

function safeUrl(url: string): string | undefined {
  const lower = (url || '').trim().toLowerCase();
  return lower.startsWith('http://') || lower.startsWith('https://') ? url : undefined;
}

function PreviewBlock({ block }: { block: AnnouncementBlock }) {
  switch (block.type) {
    case 'heading':
      return <h2 style={{ fontSize: 18, fontWeight: 600, margin: '4px 0' }}>{block.text}</h2>;
    case 'text':
      return <p style={{ fontSize: 14, lineHeight: 1.55, opacity: 0.85, margin: '4px 0' }}>{block.text}</p>;
    case 'image': {
      const src = safeUrl(block.url);
      if (!src) return <div style={{ fontSize: 12, opacity: 0.5 }}>[image]</div>;
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={src} alt={block.alt ?? ''} style={{ width: '100%', borderRadius: 8 }} />;
    }
    case 'video': {
      const src = safeUrl(block.url);
      if (!src) return <div style={{ fontSize: 12, opacity: 0.5 }}>[video]</div>;
      return <video src={src} controls style={{ width: '100%', borderRadius: 8 }} />;
    }
    case 'step':
      return (
        <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{block.title}</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>{block.body}</div>
        </div>
      );
    case 'button':
      return (
        <span style={{ display: 'inline-block', padding: '8px 16px', borderRadius: 999, background: 'var(--fg)', color: 'var(--bg)', fontSize: 13, fontWeight: 600 }}>
          {block.label}
        </span>
      );
    case 'poll':
      return (
        <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{block.question}</div>
          {block.options.map((opt, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, opacity: 0.85, marginTop: 4 }}>
              <input type="radio" name={`pv-${block.id}`} disabled /> {opt}
            </label>
          ))}
        </div>
      );
    case 'feedback':
      return (
        <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{block.prompt}</div>
          <textarea disabled placeholder="Your feedback…" rows={2} style={{ width: '100%', marginTop: 4, borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', fontSize: 12, padding: 6 }} />
        </div>
      );
  }
}

export function AnnouncementPreview({
  mode,
  title,
  blocks,
  rawHtml,
}: {
  mode: 'builder' | 'html';
  title: string;
  blocks: AnnouncementBlock[];
  rawHtml: string;
}) {
  const srcDoc = `<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; style-src 'unsafe-inline'; font-src https: data:; script-src 'none'; frame-src 'none'; connect-src 'none';">
<style>body{margin:0;padding:8px 2px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;font-size:14px;line-height:1.55;color:#1f2937}a{color:#2563eb}img,video{max-width:100%;height:auto;border-radius:8px}</style>
</head><body>${rawHtml}</body></html>`;

  return (
    <div>
      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, opacity: 0.55, marginBottom: 8 }}>
        Live preview
      </div>
      {/* pop-up card mimic */}
      <div
        style={{
          borderRadius: 16,
          border: '1px solid var(--line)',
          background: 'var(--card, var(--bg-2, var(--bg)))',
          boxShadow: '0 20px 50px -20px rgba(0,0,0,0.35)',
          padding: 18,
          maxWidth: 380,
        }}
      >
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 10px' }}>{title || 'Untitled announcement'}</h2>
        {mode === 'html' ? (
          rawHtml.trim() ? (
            <iframe
              sandbox={ANNOUNCEMENT_SANDBOX}
              srcDoc={srcDoc}
              title="Announcement preview"
              style={{ width: '100%', minHeight: 200, border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }}
            />
          ) : (
            <p style={{ fontSize: 13, opacity: 0.5 }}>Paste HTML to preview…</p>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {blocks.length === 0 ? (
              <p style={{ fontSize: 13, opacity: 0.5 }}>Add blocks to preview…</p>
            ) : (
              blocks.map((b) => <PreviewBlock key={b.id} block={b} />)
            )}
          </div>
        )}
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ padding: '6px 14px', borderRadius: 999, border: '1px solid var(--line)', fontSize: 12, opacity: 0.7 }}>
            Dismiss
          </span>
        </div>
      </div>
    </div>
  );
}
