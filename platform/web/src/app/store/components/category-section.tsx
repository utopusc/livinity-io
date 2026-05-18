'use client';

import { CATEGORIES } from '../types';
import { AppCard } from './app-card';
import { Icon } from './icon';
import type { AppSummary } from '../types';

interface CategorySectionProps {
  category: string;
  apps: AppSummary[];
  onSeeAll: () => void;
}

export function CategorySection({ category, apps, onSeeAll }: CategorySectionProps) {
  const cat = CATEGORIES[category];
  if (!cat || apps.length === 0) return null;

  const displayApps = apps.slice(0, 4);

  return (
    <>
      <div className="cat-head">
        <h3 className="cat-title">{cat.label}</h3>
        {apps.length > 4 && (
          <button
            onClick={onSeeAll}
            type="button"
            className="cat-link"
            style={{ background: 'transparent', border: 0, cursor: 'pointer' }}
          >
            See all {apps.length} <Icon name="arrow-right" size={12} />
          </button>
        )}
      </div>
      <div className="grid">
        {displayApps.map((app) => (
          <AppCard key={app.id} app={app} />
        ))}
      </div>
    </>
  );
}
