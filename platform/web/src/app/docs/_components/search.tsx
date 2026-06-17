'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { SearchDoc } from '../_lib/docs-data';

// Strip markdown syntax so snippets read as prose and body matching ignores
// fence/markup noise. Cheap regex pass — good enough for a docs-sized index.
function plainify(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → text
    .replace(/^\s{0,3}[#>]+\s*/gm, '') // heading / blockquote markers
    .replace(/^\s{0,3}[-*+]\s+/gm, '') // bullet markers
    .replace(/[*_~`#>]/g, '') // residual emphasis / marks
    .replace(/\s+/g, ' ')
    .trim();
}

type Indexed = {
  doc: SearchDoc;
  lowerTitle: string;
  lowerDesc: string;
  plain: string;
  lowerPlain: string;
};

type Snippet = { before: string; match: string; after: string };

function makeSnippet(source: string, needleLower: string): Snippet | null {
  const idx = source.toLowerCase().indexOf(needleLower);
  if (idx === -1) return null;
  const start = Math.max(0, idx - 42);
  const end = Math.min(source.length, idx + needleLower.length + 96);
  return {
    before: (start > 0 ? '…' : '') + source.slice(start, idx),
    match: source.slice(idx, idx + needleLower.length),
    after: source.slice(idx + needleLower.length, end) + (end < source.length ? '…' : ''),
  };
}

type Result = {
  doc: SearchDoc;
  score: number;
  headingId?: string;
  snippet: Snippet | null;
};

export function DocsSearch({ index }: { index: SearchDoc[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const docs = useMemo<Indexed[]>(
    () =>
      index.map((doc) => {
        const plain = plainify(doc.content);
        return {
          doc,
          lowerTitle: doc.title.toLowerCase(),
          lowerDesc: doc.description.toLowerCase(),
          plain,
          lowerPlain: plain.toLowerCase(),
        };
      }),
    [index],
  );

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored: Result[] = [];
    for (const d of docs) {
      let score = 0;
      let headingId: string | undefined;
      let snippet: Snippet | null = null;

      if (d.lowerTitle.includes(q)) score += 100;

      const heading = d.doc.headings.find((h) => h.text.toLowerCase().includes(q));
      if (heading) {
        score += 50;
        headingId = heading.id;
      }

      if (d.lowerDesc.includes(q)) {
        score += 25;
        snippet = makeSnippet(d.doc.description, q);
      }

      if (d.lowerPlain.includes(q)) {
        score += 10;
        if (!snippet) snippet = makeSnippet(d.plain, q);
      }

      if (score === 0) continue;
      if (!snippet) snippet = makeSnippet(d.doc.description || d.plain, q);
      scored.push({ doc: d.doc, score, headingId, snippet });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 8);
  }, [docs, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
  }, []);

  const go = useCallback(
    (r: Result) => {
      const hash = r.headingId ? `#${r.headingId}` : '';
      close();
      router.push(`/docs/${r.doc.category_slug}/${r.doc.slug}${hash}`);
    },
    [close, router],
  );

  // Global ⌘K / Ctrl+K toggle (and Esc to close). State only changes inside the
  // listener (an event handler) — never synchronously in the effect body.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) close();
        else setOpen(true);
      } else if (e.key === 'Escape') {
        close();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // While open: focus the input and lock body scroll (external-system sync only).
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Scroll the highlighted row into view (DOM side effect, no state writes).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[active];
      if (r) go(r);
    }
  }

  return (
    <>
      <button
        type="button"
        className="docs-search-trigger"
        onClick={() => setOpen(true)}
        aria-label="Search documentation"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span>Search</span>
        <kbd>⌘K</kbd>
      </button>

      {/* Portal to <body>: the nav's `backdrop-filter` would otherwise become
          the containing block for this fixed overlay, sizing it to the nav. */}
      {open &&
        createPortal(
          <div
            className="docs-search-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Search documentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
          <div className="docs-search-panel">
            <div className="docs-search-input">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onInputKey}
                placeholder="Search documentation…"
                aria-label="Search query"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd>Esc</kbd>
            </div>

            <div className="docs-search-results">
              {query.trim() === '' ? (
                <p className="docs-search-hint">Search titles, headings, and article text.</p>
              ) : results.length === 0 ? (
                <p className="docs-search-empty">No results for “{query.trim()}”.</p>
              ) : (
                results.map((r, i) => (
                  <button
                    key={r.doc.slug}
                    ref={i === active ? activeRef : undefined}
                    type="button"
                    className={`docs-search-result${i === active ? ' is-active' : ''}`}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(r)}
                  >
                    <div className="docs-search-result-cat">{r.doc.category_name}</div>
                    <div className="docs-search-result-title">{r.doc.title}</div>
                    {r.snippet && (
                      <div className="docs-search-result-snip">
                        {r.snippet.before}
                        <mark>{r.snippet.match}</mark>
                        {r.snippet.after}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
