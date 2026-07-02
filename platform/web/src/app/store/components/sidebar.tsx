'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '../store-provider';
import { CATEGORIES } from '../types';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const {
    apps,
    selectedCategory,
    setSelectedCategory,
    selectedSection,
    token,
    instanceName,
    getAppStatus,
  } = useStore();
  const pathname = usePathname();
  const router = useRouter();
  const isStorePage = pathname === '/store';

  // Security (feedback 42ed3227): no token in link hrefs — cookie carries it.
  const storeParams = new URLSearchParams();
  if (instanceName) storeParams.set('instance', instanceName);
  const storeHref = `/store${storeParams.toString() ? `?${storeParams.toString()}` : ''}`;

  // Counts are scoped to the active section so the sidebar reflects what's
  // actually browsable in this view (not the global catalog).
  const sectionApps = apps.filter((a) => a.section === selectedSection);
  const categoryCounts = sectionApps.reduce<Record<string, number>>((acc, a) => {
    acc[a.category] = (acc[a.category] || 0) + 1;
    return acc;
  }, {});

  const featuredCount = sectionApps.filter((a) => a.featured).length;
  const installedCount = sectionApps.filter(
    (a) => getAppStatus(a.id) === 'running' || getAppStatus(a.id) === 'stopped',
  ).length;

  const handleCategoryClick = (category: string | null) => {
    setSelectedCategory(category);
    if (!isStorePage) router.push(storeHref);
    onClose();
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`sb fixed left-0 top-0 z-50 h-full w-60 transition-transform md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="sb-group">
          <div className="sb-label">Categories</div>
          <button
            className={`sb-item${selectedCategory === null && isStorePage ? ' is-active' : ''}`}
            type="button"
            onClick={() => handleCategoryClick(null)}
          >
            <span>All</span>
            <span className="count">{sectionApps.length}</span>
          </button>
          {Object.entries(CATEGORIES).map(([key, { label }]) => {
            const count = categoryCounts[key] ?? 0;
            if (count === 0) return null;
            return (
              <button
                key={key}
                className={`sb-item${selectedCategory === key ? ' is-active' : ''}`}
                type="button"
                onClick={() => handleCategoryClick(key)}
              >
                <span>{label}</span>
                <span className="count">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="sb-divider" />

        <div className="sb-group">
          <div className="sb-label">Status</div>
          <button className="sb-item" type="button">
            <span>Installed</span>
            <span className="count">{installedCount}</span>
          </button>
          <button className="sb-item" type="button">
            <span>Featured</span>
            <span className="count">{featuredCount}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
