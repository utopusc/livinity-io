'use client';

import { useMemo } from 'react';
import { useStore } from './store-provider';
import { FeaturedHero } from './components/featured-hero';
import { CategorySection } from './components/category-section';
import { AppCard } from './components/app-card';
import { EmptySection } from './components/empty-section';
import { CATEGORIES } from './types';

export default function StorePage() {
  const {
    apps,
    loading,
    error,
    searchQuery,
    selectedCategory,
    setSelectedCategory,
    selectedSection,
  } = useStore();

  // Phase 148 — narrow to the active section first; current data has all
  // rows section='app' so other tabs render empty-state placeholders until
  // phases 150-153 ship seed entries.
  const sectionApps = useMemo(
    () => apps.filter((a) => a.section === selectedSection),
    [apps, selectedSection],
  );

  const filteredApps = useMemo(() => {
    let result = sectionApps;
    if (selectedCategory) {
      result = result.filter((a) => a.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.tagline.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q)
      );
    }
    return result;
  }, [sectionApps, searchQuery, selectedCategory]);

  const featuredApps = useMemo(
    () => sectionApps.filter((a) => a.featured),
    [sectionApps]
  );

  const appsByCategory = useMemo(() => {
    const grouped: Record<string, typeof sectionApps> = {};
    for (const app of sectionApps) {
      if (!grouped[app.category]) grouped[app.category] = [];
      grouped[app.category].push(app);
    }
    return grouped;
  }, [sectionApps]);

  // Loading state
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-pulse text-sm text-[#86868b]">
          Loading apps...
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="rounded-xl bg-[#f5f5f7] px-8 py-6 text-center">
          <p className="text-sm text-[#86868b]">{error}</p>
        </div>
      </div>
    );
  }

  // Search results mode
  if (searchQuery.trim()) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="mb-6 text-xl font-bold text-[#1d1d1f]">
          Results for &ldquo;{searchQuery}&rdquo;
          <span className="ml-2 text-sm font-normal text-[#86868b]">
            {filteredApps.length} app{filteredApps.length !== 1 ? 's' : ''}
          </span>
        </h1>
        {filteredApps.length === 0 ? (
          <p className="text-sm text-[#86868b]">
            No apps found matching your search.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredApps.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Category filter mode
  if (selectedCategory) {
    const cat = CATEGORIES[selectedCategory];
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="mb-6 text-xl font-bold text-[#1d1d1f]">
          {cat?.icon} {cat?.label || selectedCategory}
          <span className="ml-2 text-sm font-normal text-[#86868b]">
            {filteredApps.length} app{filteredApps.length !== 1 ? 's' : ''}
          </span>
        </h1>
        {filteredApps.length === 0 ? (
          <p className="text-sm text-[#86868b]">No apps in this category.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredApps.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Empty section placeholder (everything other than 'app' has no rows in v37 P149)
  if (selectedSection !== 'app' && sectionApps.length === 0) {
    return <EmptySection section={selectedSection} />;
  }

  // Discover mode (default)
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <FeaturedHero apps={featuredApps} />
      {Object.keys(CATEGORIES).map((catKey) => {
        const catApps = appsByCategory[catKey];
        if (!catApps || catApps.length === 0) return null;
        return (
          <CategorySection
            key={catKey}
            category={catKey}
            apps={catApps}
            onSeeAll={() => setSelectedCategory(catKey)}
          />
        );
      })}
    </div>
  );
}
