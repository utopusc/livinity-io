'use client';

import { useStore } from '../store-provider';
import { SECTIONS, type Section } from '../types';
import { Icon, type IconName } from './icon';

const SECTION_ICONS: Record<Section, IconName> = {
  app: 'cube',
  webapp: 'globe',
  native: 'monitor',
  ai: 'sparkle',
  plugin: 'puzzle',
};

export function SectionTabs() {
  const { selectedSection, setSelectedSection, setSelectedCategory, apps } = useStore();

  // Count rows per section so each tab reports actual catalog depth.
  // Falls back to "Soon" badge for any section with zero rows.
  const counts = SECTIONS.reduce<Record<Section, number>>(
    (acc, s) => {
      acc[s.key] = apps.filter((a) => a.section === s.key).length;
      return acc;
    },
    { app: 0, webapp: 0, native: 0, ai: 0, plugin: 0 },
  );

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
            onClick={() => {
              setSelectedSection(s.key);
              setSelectedCategory(null);
            }}
          >
            <Icon name={SECTION_ICONS[s.key]} size={14} />
            <span>{s.label}</span>
            {count > 0 ? (
              <span className="count">{count}</span>
            ) : (
              <span className="soon">Soon</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
