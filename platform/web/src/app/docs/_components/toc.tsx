'use client';

import { useEffect, useState } from 'react';
import type { TocItem } from '../_lib/toc';

export function DocsToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string>('');

  useEffect(() => {
    if (items.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
    );
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  // Keep the column reserved (grid stability) even when empty.
  if (items.length === 0) return <aside className="docs-toc" aria-hidden="true" />;

  return (
    <aside className="docs-toc">
      <div className="docs-toc-label">On this page</div>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={`${item.level === 3 ? 'lvl-3' : ''}${active === item.id ? ' is-active' : ''}`}
        >
          {item.text}
        </a>
      ))}
    </aside>
  );
}
