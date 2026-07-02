'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '../store-provider';
import { SECTIONS, type Section } from '../types';
import { Icon, type IconName } from './icons';

const SECTION_ICONS: Record<Section, IconName> = {
  app: 'cube',
  webapp: 'globe',
  native: 'monitor',
  ai: 'sparkle',
  plugin: 'puzzle',
};

export function SectionTabs() {
  const { selectedSection, setSelectedSection, setSelectedCategory, apps, loading, token, instanceName } = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const isStoreList = pathname === '/store';

  // Count rows per section so each tab reports actual catalog depth.
  // Falls back to "Soon" badge for any section with zero rows.
  const counts = SECTIONS.reduce<Record<Section, number>>(
    (acc, s) => {
      acc[s.key] = apps.filter((a) => a.section === s.key).length;
      return acc;
    },
    { app: 0, webapp: 0, native: 0, ai: 0, plugin: 0 },
  );

  function handleClick(section: Section) {
    if (isStoreList) {
      // On /store list page — update state in place, no navigation.
      setSelectedSection(section);
      setSelectedCategory(null);
      return;
    }
    // On a detail page (or any /store/* sub-route) — navigate back to
    // /store with a section hint. The list page consumes ?section=...
    // on mount (see store-provider) and applies it as initial state.
    // Security (feedback 42ed3227): no token in the URL — cookie carries it
    // (also keeps the api-key out of browser history).
    const params = new URLSearchParams();
    if (instanceName) params.set('instance', instanceName);
    params.set('section', section);
    router.push(`/store?${params.toString()}`);
  }

  return (
    <nav className="sn" role="tablist" aria-label="Store sections">
      {SECTIONS.map((s) => {
        const active = s.key === selectedSection;
        const count = counts[s.key];
        return (
          <button
            key={s.key}
            role="tab"
            aria-selected={active}
            className={`sn-tab${active ? ' is-active' : ''}`}
            type="button"
            onClick={() => handleClick(s.key)}
          >
            <Icon name={SECTION_ICONS[s.key]} size={14} />
            <span>{s.label}</span>
            {/* The Native section is the self-contained generic store (a live,
                paginated catalog of thousands of apps) — the curated-row count is
                meaningless and misleading there, so show NO badge for it. */}
            {s.key === 'native' ? null : count > 0 ? (
              <span className="count">{count}</span>
            ) : !loading && count === 0 ? (
              /* Phase 289 WS-B — "Soon" is NOT a loading state; only once the
                 catalog has loaded and the section is genuinely empty. */
              <span className="soon">Soon</span>
            ) : (
              <span className="count" aria-hidden="true" style={{ opacity: 0.4 }}>
                ·
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
