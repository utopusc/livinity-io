'use client';

// Live preview of an announcement as it will appear in the LivOS desktop pop-up.
// Blocks render natively; raw HTML renders inside a sandboxed iframe (NO
// allow-scripts) — the same wall the box uses, so the admin sees a faithful,
// safe preview while editing. (This is a preview of the admin's own content; the
// fleet render additionally DOMPurify-sanitizes at publish + at render.)
//
// Phase 293 (Wave 2): a light/dark preview theme toggle + a device-frame chrome
// so the preview reads clearly as "this is the pop-up". The native blocks are
// re-themed by overriding the --fg/--bg/--line/--card CSS vars on the device
// wrapper (rgb(), NO hex — so it stays token-driven). The raw-HTML iframe gets a
// theme-aware srcDoc; hex there is permitted (it lives ONLY inside the iframe
// <style> document, isolated from the admin DOM).

import { useState } from 'react';
import type { AnnouncementBlock } from '../lib/announcements-api';

const ANNOUNCEMENT_SANDBOX = 'allow-popups allow-popups-to-escape-sandbox';

type PreviewTheme = 'light' | 'dark';

// Native-block palette — rgb()/rgba() only (NO hex) so the hardcoded-hex gate
// stays clean. These override the admin CSS vars within the device wrapper.
const NATIVE_PALETTE: Record<PreviewTheme, Record<string, string>> = {
  light: { fg: 'rgb(17,24,39)', bg: 'rgb(255,255,255)', card: 'rgb(255,255,255)', line: 'rgba(0,0,0,0.10)' },
  dark: { fg: 'rgb(229,231,235)', bg: 'rgb(18,20,26)', card: 'rgb(30,32,40)', line: 'rgba(255,255,255,0.14)' },
};

// Raw-HTML iframe palette — hex is permitted here (iframe <style> document only).
const IFRAME_PALETTE: Record<PreviewTheme, { fg: string; heading: string; link: string; bg: string }> = {
  light: { fg: '#1f2937', heading: '#111827', link: '#2563eb', bg: '#ffffff' },
  dark: { fg: '#e5e7eb', heading: '#f9fafb', link: '#60a5fa', bg: '#1e2028' },
};

function safeUrl(url: string): string | undefined {
  const lower = (url || '').trim().toLowerCase();
  return lower.startsWith('http://') || lower.startsWith('https://') ? url : undefined;
}

function PreviewBlock({ block }: { block: AnnouncementBlock }) {
  switch (block.type) {
    case 'heading':
      return <h2 style={{ fontSize: 18, fontWeight: 600, margin: '4px 0', color: 'var(--fg)' }}>{block.text}</h2>;
    case 'text':
      return <p style={{ fontSize: 14, lineHeight: 1.55, opacity: 0.85, margin: '4px 0', color: 'var(--fg)' }}>{block.text}</p>;
    case 'image': {
      const src = safeUrl(block.url);
      if (!src) return <div style={{ fontSize: 12, opacity: 0.5 }}>[image]</div>;
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={src} alt={block.alt ?? ''} style={{ width: '100%', borderRadius: 8 }} />;
    }
    case 'video': {
      const src = safeUrl(block.url);
      if (!src) return <div style={{ fontSize: 12, opacity: 0.5 }}>[video]</div>;
      const poster = block.poster ? safeUrl(block.poster) : undefined;
      return <video src={src} poster={poster} controls style={{ width: '100%', borderRadius: 8 }} />;
    }
    case 'step':
      return (
        <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{block.title}</div>
          <div style={{ fontSize: 13, opacity: 0.8, color: 'var(--fg)' }}>{block.body}</div>
        </div>
      );
    case 'button': {
      const secondary = block.variant === 'secondary';
      return (
        <span
          style={
            secondary
              ? { display: 'inline-block', padding: '8px 16px', borderRadius: 999, border: '1px solid var(--line)', color: 'var(--fg)', fontSize: 13, fontWeight: 600 }
              : { display: 'inline-block', padding: '8px 16px', borderRadius: 999, background: 'var(--fg)', color: 'var(--bg)', fontSize: 13, fontWeight: 600 }
          }
        >
          {block.label}
        </span>
      );
    }
    case 'poll':
      return (
        <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{block.question}</div>
          {block.options.map((opt, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, opacity: 0.85, marginTop: 4, color: 'var(--fg)' }}>
              <input type="radio" name={`pv-${block.id}`} disabled /> {opt}
            </label>
          ))}
        </div>
      );
    case 'feedback':
      return (
        <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{block.prompt}</div>
          <textarea disabled placeholder="Your feedback…" rows={2} style={{ width: '100%', marginTop: 4, borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', color: 'var(--fg)', fontSize: 12, padding: 6 }} />
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
  const [theme, setTheme] = useState<PreviewTheme>('light');
  const p = NATIVE_PALETTE[theme];
  const ip = IFRAME_PALETTE[theme];

  const srcDoc = `<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; style-src 'unsafe-inline'; font-src https: data:; script-src 'none'; frame-src 'none'; connect-src 'none';">
<style>:root{color-scheme:${theme}}body{margin:0;padding:8px 2px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;font-size:14px;line-height:1.55;background:${ip.bg};color:${ip.fg}}h1,h2,h3,h4,h5,h6{color:${ip.heading}}a{color:${ip.link}}img,video{max-width:100%;height:auto;border-radius:8px}</style>
</head><body>${rawHtml}</body></html>`;

  // Override admin theme vars locally so the native blocks render in the chosen
  // preview theme without touching the surrounding admin chrome.
  const deviceVars = {
    ['--fg' as string]: p.fg,
    ['--bg' as string]: p.bg,
    ['--line' as string]: p.line,
    ['--card' as string]: p.card,
  } as React.CSSProperties;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, opacity: 0.55 }}>
          Live preview
        </div>
        {/* Light/dark preview theme toggle */}
        <div style={{ display: 'inline-flex', gap: 4 }}>
          <button
            type="button"
            className={`btn ${theme === 'light' ? 'primary' : 'ghost'} sm`}
            onClick={() => setTheme('light')}
            title="Preview in light theme"
          >
            ☀︎ Light
          </button>
          <button
            type="button"
            className={`btn ${theme === 'dark' ? 'primary' : 'ghost'} sm`}
            onClick={() => setTheme('dark')}
            title="Preview in dark theme"
          >
            ☾ Dark
          </button>
        </div>
      </div>

      {/* Device frame — window chrome around the pop-up card */}
      <div
        style={{
          ...deviceVars,
          borderRadius: 18,
          border: '1px solid var(--line)',
          background: 'var(--bg)',
          overflow: 'hidden',
          maxWidth: 400,
          boxShadow: '0 24px 60px -24px rgba(0,0,0,0.45)',
        }}
      >
        {/* title bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <span style={{ width: 9, height: 9, borderRadius: 999, background: 'var(--line)' }} />
          <span style={{ width: 9, height: 9, borderRadius: 999, background: 'var(--line)' }} />
          <span style={{ width: 9, height: 9, borderRadius: 999, background: 'var(--line)' }} />
          <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.55, color: 'var(--fg)' }}>LivOS · announcement</span>
        </div>

        {/* pop-up card */}
        <div style={{ padding: 18, color: 'var(--fg)' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 10px', color: 'var(--fg)' }}>
            {title || 'Untitled announcement'}
          </h2>
          {mode === 'html' ? (
            rawHtml.trim() ? (
              <iframe
                sandbox={ANNOUNCEMENT_SANDBOX}
                srcDoc={srcDoc}
                title="Announcement preview"
                style={{ width: '100%', minHeight: 200, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)' }}
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
    </div>
  );
}
