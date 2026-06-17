'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { NavCategory } from '../_lib/docs-data';

export function DocsSidebar({
  nav,
  activeSlug,
}: {
  nav: NavCategory[];
  activeSlug?: string;
}) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return nav;
    return nav
      .map((c) => ({
        ...c,
        articles: c.articles.filter((a) => a.title.toLowerCase().includes(needle)),
      }))
      .filter((c) => c.articles.length > 0);
  }, [nav, q]);

  return (
    <aside className="docs-sidebar">
      <div className="docs-search">
        <svg
          width="15"
          height="15"
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
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search docs…"
          aria-label="Search docs"
        />
      </div>

      {filtered.length === 0 && <p className="docs-side-empty">No matches.</p>}

      {filtered.map((c) => (
        <div key={c.id}>
          <div className="docs-cat-label">{c.name}</div>
          {c.articles.map((a) => (
            <Link
              key={a.slug}
              href={`/docs/${c.slug}/${a.slug}`}
              className={`docs-side-link${a.slug === activeSlug ? ' is-active' : ''}`}
            >
              {a.title}
            </Link>
          ))}
        </div>
      ))}
    </aside>
  );
}
