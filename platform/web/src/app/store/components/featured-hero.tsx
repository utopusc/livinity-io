'use client';

import Link from 'next/link';
import { useStore } from '../store-provider';
import type { AppSummary } from '../types';

const GRADIENTS: Record<string, string> = {
  automation: 'from-teal-400 to-cyan-500',
  media: 'from-violet-400 to-purple-500',
  photography: 'from-amber-400 to-orange-500',
  'cloud-storage': 'from-blue-400 to-indigo-500',
  management: 'from-slate-400 to-zinc-500',
  monitoring: 'from-emerald-400 to-green-500',
  development: 'from-sky-400 to-blue-500',
  dashboards: 'from-rose-400 to-pink-500',
};

const DEFAULT_GRADIENT = 'from-zinc-400 to-zinc-500';

interface FeaturedHeroProps {
  apps: AppSummary[];
}

export function FeaturedHero({ apps }: FeaturedHeroProps) {
  const { token, instanceName } = useStore();
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (instanceName) params.set('instance', instanceName);
  const qs = params.toString();

  if (apps.length === 0) return null;

  return (
    <section className="mb-10">
      <h2 className="mb-4 text-2xl font-bold text-[#1d1d1f]">Featured</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {apps.map((app) => {
          const gradient = GRADIENTS[app.category] || DEFAULT_GRADIENT;
          return (
            <Link
              key={app.id}
              href={`/store/${app.id}${qs ? `?${qs}` : ''}`}
              className={`group relative flex h-48 flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-6 transition-all hover:shadow-lg hover:scale-[1.01]`}
            >
              <div className="flex items-end gap-3">
                <img
                  src={app.icon_url}
                  alt={`${app.name} icon`}
                  className="h-14 w-14 rounded-2xl bg-white/20 object-contain p-1.5 shadow-sm backdrop-blur-sm"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-lg font-bold text-white">
                    {app.name}
                  </h3>
                  <p className="truncate text-sm text-white/80">
                    {app.tagline}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-white/90 px-4 py-1.5 text-xs font-semibold text-teal-600 shadow-sm backdrop-blur-sm">
                  Get
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
