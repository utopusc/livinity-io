'use client';

import { useState, useEffect } from 'react';
import { useStore } from '../store-provider';
import { Icon } from './icon';

type Preview = {
  url: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
  siteName: string | null;
};

// Custom URL form for the WebApp section. Operator pastes a URL, sees a
// live preview (OG title + favicon + description), clicks Add to Dock —
// LivOS host receives postMessage and pins the webapp. When viewed
// standalone (not embedded), the Add button is disabled with a hint.

export function CustomUrlForm() {
  const { token, isEmbedded, sendInstallCustomWebapp } = useStore();
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Debounced preview fetch — fires 600 ms after the last keystroke if
  // the URL parses cleanly. Cancel on every change to avoid races.
  useEffect(() => {
    setError(null);
    setSubmitted(false);
    const trimmed = url.trim();
    if (!trimmed) {
      setPreview(null);
      return;
    }
    // Auto-prefix scheme if missing.
    let parsed: URL;
    try {
      parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    } catch {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/webapp/preview?url=${encodeURIComponent(parsed.toString())}`,
          {
            headers: token ? { 'X-Api-Key': token } : undefined,
            signal: controller.signal,
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `preview ${res.status}`);
        }
        const data = (await res.json()) as Preview;
        setPreview(data);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
        setPreview(null);
      } finally {
        setLoading(false);
      }
    }, 600);
    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [url, token]);

  function handleAdd() {
    if (!preview) return;
    sendInstallCustomWebapp(preview.url, preview.title, preview.iconUrl);
    setSubmitted(true);
    // Optimistic clear after 2s so operator can add another.
    setTimeout(() => {
      setUrl('');
      setPreview(null);
      setSubmitted(false);
    }, 2200);
  }

  return (
    <div className="custom-url">
      <div className="custom-url-head">
        <div className="custom-url-eyebrow">Custom URL</div>
        <h3 className="custom-url-title">
          Any URL, <em>your dock.</em>
        </h3>
        <p className="custom-url-desc">
          Paste any web app URL. LivOS pins it as a desktop window — same
          mechanic as the curated rows below.
        </p>
      </div>
      <div className="custom-url-row">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://app.example.com"
          className="custom-url-input"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="install primary"
          disabled={!preview || !isEmbedded || submitted}
          onClick={handleAdd}
          title={!isEmbedded ? 'Open this store from your LivOS instance to add to dock' : ''}
        >
          {submitted ? (
            <>
              <Icon name="check" size={13} /> Added
            </>
          ) : (
            <>
              <Icon name="download" size={13} /> Add to dock
            </>
          )}
        </button>
      </div>
      {error && <div className="custom-url-error">{error}</div>}
      {loading && !preview && (
        <div className="custom-url-preview is-loading">
          <div className="custom-url-preview-skeleton" />
          <div style={{ flex: 1 }}>
            <div className="custom-url-preview-skeleton-line" />
            <div className="custom-url-preview-skeleton-line short" />
          </div>
        </div>
      )}
      {preview && (
        <div className="custom-url-preview">
          <span className="custom-url-preview-icon">
            {preview.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.iconUrl} alt="" />
            ) : (
              <Icon name="globe" size={22} />
            )}
          </span>
          <div className="custom-url-preview-body">
            <div className="custom-url-preview-title">{preview.title}</div>
            {preview.description && (
              <div className="custom-url-preview-desc">
                {preview.description}
              </div>
            )}
            <div className="custom-url-preview-meta">
              {preview.siteName && (
                <>
                  <span>{preview.siteName}</span>
                  <span className="sep">·</span>
                </>
              )}
              <span>{new URL(preview.url).hostname}</span>
            </div>
          </div>
        </div>
      )}
      {!isEmbedded && (
        <p className="custom-url-hint">
          Browser preview only — open this store inside LivOS to actually pin
          the URL to your dock.
        </p>
      )}
    </div>
  );
}
