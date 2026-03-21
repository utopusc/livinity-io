'use client';

import { CATEGORIES } from '../types';
import { AppCard } from './app-card';
import type { AppSummary } from '../types';

interface CategorySectionProps {
  category: string;
  apps: AppSummary[];
  onSeeAll: () => void;
}

export function CategorySection({
  category,
  apps,
  onSeeAll,
}: CategorySectionProps) {
  const cat = CATEGORIES[category];
  if (!cat || apps.length === 0) return null;

  const displayApps = apps.slice(0, 4);

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#1d1d1f]">
          <span className="mr-2">{cat.icon}</span>
          {cat.label}
        </h2>
        {apps.length > 4 && (
          <button
            onClick={onSeeAll}
            className="text-sm font-medium text-teal-500 transition-colors hover:text-teal-600"
          >
            See All
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {displayApps.map((app) => (
          <AppCard key={app.id} app={app} />
        ))}
      </div>
    </section>
  );
}
