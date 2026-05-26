'use client';

import { useStore } from '../store-provider';
import { Icon } from './icons';
import type { StoreSort } from '../types';

interface TopbarProps {
  onMenuToggle: () => void;
}

const SORT_OPTIONS: { value: StoreSort; label: string }[] = [
  { value: 'curated', label: 'Curated order' },
  { value: 'newly_added', label: 'Newly added' },
  { value: 'name', label: 'Name (A→Z)' },
];

export function Topbar({ onMenuToggle }: TopbarProps) {
  const { searchQuery, setSearchQuery, instanceName, sortBy, setSortBy } = useStore();

  return (
    <div className="tb">
      {/* Mobile hamburger — folded into the brand cluster on small screens */}
      <button
        onClick={onMenuToggle}
        className="md:hidden"
        aria-label="Toggle menu"
        style={{
          background: 'transparent',
          border: 0,
          padding: 4,
          color: 'var(--fg)',
          cursor: 'pointer',
        }}
      >
        <Icon name="filter" size={18} />
      </button>

      <a href="#" className="tb-brand">
        <span className="tb-brand-mark" aria-hidden="true" />
        <span>Livinity</span>
        <span className="crumb">Store</span>
      </a>

      <div className="tb-search">
        <Icon name="search" size={15} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search apps, plugins, MCP servers…"
        />
        <span className="kbd">⌘K</span>
      </div>

      <div className="tb-right">
        <label className="tb-sort" aria-label="Sort apps">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as StoreSort)}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {instanceName && (
          <a href="#" className="tb-user">
            <span className="tb-avatar">{instanceName.charAt(0).toUpperCase()}</span>
            <span className="tb-user-name">{instanceName}</span>
          </a>
        )}
      </div>
    </div>
  );
}
