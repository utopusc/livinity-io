'use client';

import { useStore } from '../store-provider';
import { SECTIONS } from '../types';

export function SectionTabs() {
  const { selectedSection, setSelectedSection, setSelectedCategory } = useStore();

  return (
    <nav
      role="tablist"
      aria-label="Store sections"
      className="sticky top-[57px] z-20 flex gap-1 overflow-x-auto border-b border-[#e5e5e7] bg-white/95 px-6 py-2 backdrop-blur-xl"
    >
      {SECTIONS.map((s) => {
        const active = s.key === selectedSection;
        return (
          <button
            key={s.key}
            role="tab"
            aria-selected={active}
            onClick={() => {
              setSelectedSection(s.key);
              setSelectedCategory(null);
            }}
            className={
              'whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ' +
              (active
                ? 'bg-[#1d1d1f] text-white'
                : 'text-[#1d1d1f] hover:bg-[#f5f5f7]')
            }
          >
            {s.label}
          </button>
        );
      })}
    </nav>
  );
}
