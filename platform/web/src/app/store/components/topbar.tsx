'use client';

import { useStore } from '../store-provider';

interface TopbarProps {
  onMenuToggle: () => void;
}

export function Topbar({ onMenuToggle }: TopbarProps) {
  const { searchQuery, setSearchQuery, instanceName } = useStore();

  return (
    <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-[#e5e5e7] bg-white/80 px-6 py-3 backdrop-blur-xl">
      {/* Mobile hamburger */}
      <button
        onClick={onMenuToggle}
        className="rounded-lg p-1.5 hover:bg-[#f5f5f7] md:hidden"
        aria-label="Toggle menu"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M3 5h14M3 10h14M3 15h14" />
        </svg>
      </button>

      {/* Search */}
      <div className="relative max-w-md flex-1">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="7" cy="7" r="5" />
          <path d="M11 11l3.5 3.5" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search apps..."
          className="w-full rounded-lg bg-[#f5f5f7] py-2 pl-9 pr-4 text-sm text-[#1d1d1f] placeholder-[#86868b] outline-none transition-shadow focus:ring-2 focus:ring-teal-500/30"
        />
      </div>

      {/* Instance badge */}
      {instanceName && (
        <div className="hidden items-center gap-1.5 text-xs text-[#86868b] sm:flex">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {instanceName}
        </div>
      )}
    </header>
  );
}
