'use client';

import { useMemo } from 'react';
import { useStore } from './store-provider';
import { FeaturedHero } from './components/featured-hero';
import { CategorySection } from './components/category-section';
import { AppCard } from './components/app-card';
import { SectionPlaceholder } from './components/section-placeholder';
import { CustomUrlForm } from './components/custom-url-form';
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
    sortBy,
  } = useStore();

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
          a.category.toLowerCase().includes(q),
      );
    }
    // CARRY-P214-STORE-SEARCH — sort dropdown.
    if (sortBy === 'newly_added') {
      result = [...result].sort((a, b) => {
        const at = a.created_at ? Date.parse(a.created_at) : 0;
        const bt = b.created_at ? Date.parse(b.created_at) : 0;
        return bt - at;
      });
    } else if (sortBy === 'name') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }
    // 'curated' = preserve API order (server already orderBy sort_order, name)
    return result;
  }, [sectionApps, searchQuery, selectedCategory, sortBy]);

  const featuredApps = useMemo(
    () => sectionApps.filter((a) => a.featured),
    [sectionApps],
  );

  const appsByCategory = useMemo(() => {
    const grouped: Record<string, typeof sectionApps> = {};
    for (const app of sectionApps) {
      if (!grouped[app.category]) grouped[app.category] = [];
      grouped[app.category].push(app);
    }
    return grouped;
  }, [sectionApps]);

  // Loading
  if (loading) {
    return (
      <div className="main">
        <p style={{ color: 'var(--fg-mute)', fontSize: 14 }}>Loading apps…</p>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="main">
        <div className="ph">
          <div>
            <div className="ph-eyebrow">Error</div>
            <h1 className="ph-title">
              Couldn't reach <em>the catalog.</em>
            </h1>
            <p className="ph-sub">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Empty section placeholder for non-app empty sections.
  // Phase 289 WS-B — belt-and-suspenders `!loading` guard: the `if (loading)`
  // return above already short-circuits during the load, but keep this explicit
  // so the "Coming in Phase X" placeholder can ONLY appear once loading is false
  // and the section is genuinely empty (never during the catalog-fetch flash).
  if (!loading && selectedSection !== 'app' && sectionApps.length === 0) {
    return (
      <div className="main" style={{ maxWidth: 840, margin: '0 auto' }}>
        <SectionPlaceholder section={selectedSection} />
      </div>
    );
  }

  // Search mode
  if (searchQuery.trim()) {
    return (
      <div className="main">
        <div className="ph">
          <div>
            <div className="ph-eyebrow">
              {filteredApps.length} result{filteredApps.length === 1 ? '' : 's'} ·
              &quot;{searchQuery}&quot;
            </div>
            <h1 className="ph-title">
              Apps matching <em>{searchQuery}</em>
            </h1>
            <p className="ph-sub">
              Searching across this section. Switch to another section above to
              broaden.
            </p>
          </div>
          <div className="ph-meta">
            <span>{filteredApps.length} / {sectionApps.length}</span>
          </div>
        </div>
        {filteredApps.length === 0 ? (
          <p style={{ color: 'var(--fg-mute)', fontSize: 14 }}>
            No apps found matching your search.
          </p>
        ) : (
          <div className="grid">
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
      <div className="main">
        <div className="ph">
          <div>
            <div className="ph-eyebrow">Apps · {cat?.label ?? selectedCategory}</div>
            <h1 className="ph-title">
              <em>{cat?.label ?? selectedCategory}</em> in this section
            </h1>
            <p className="ph-sub">
              {filteredApps.length} app{filteredApps.length === 1 ? '' : 's'} in
              this category.
            </p>
          </div>
          <div className="ph-meta">
            <span>{filteredApps.length} apps</span>
          </div>
        </div>
        {filteredApps.length === 0 ? (
          <p style={{ color: 'var(--fg-mute)', fontSize: 14 }}>
            No apps in this category.
          </p>
        ) : (
          <div className="grid">
            {filteredApps.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Discover mode (default)
  return (
    <div className="main">
      <div className="ph">
        <div>
          <div className="ph-eyebrow">{sectionApps.length} apps · curated &amp; signed</div>
          <h1 className="ph-title">
            A directory, not a <em>marketplace.</em>
          </h1>
          <p className="ph-sub">
            Self-hosted apps that run on the LivOS you already own. Browse by
            category, install in seconds, keep the data on your hardware.
          </p>
        </div>
        <div className="ph-meta">
          <span>v37.1</span>
        </div>
      </div>

      {selectedSection === 'webapp' && <CustomUrlForm />}

      {featuredApps.length > 0 && <FeaturedHero apps={featuredApps} />}

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
