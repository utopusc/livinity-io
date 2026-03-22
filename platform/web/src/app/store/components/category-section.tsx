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
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <span className="text-lg">{cat.icon}</span>
          {cat.label}
        </h2>
        {apps.length > 4 && (
          <button
            onClick={onSeeAll}
            className="rounded-full px-3 py-1 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50"
          >
            See All &rsaquo;
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {displayApps.map((app) => (
          <AppCard key={app.id} app={app} />
        ))}
      </div>
    </section>
  );
}
