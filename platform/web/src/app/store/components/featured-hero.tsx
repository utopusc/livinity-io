'use client';

import Link from 'next/link';
import { useStore } from '../store-provider';
import type { AppSummary } from '../types';

const GRADIENTS: Record<string, string> = {
  networking: 'from-blue-500 via-blue-600 to-indigo-700',
  automation: 'from-teal-400 via-teal-500 to-cyan-600',
  media: 'from-violet-500 via-purple-500 to-purple-700',
  photography: 'from-amber-400 via-orange-500 to-red-500',
  'cloud-storage': 'from-blue-400 via-indigo-500 to-indigo-600',
  management: 'from-slate-500 via-slate-600 to-zinc-700',
  monitoring: 'from-emerald-400 via-green-500 to-green-600',
  development: 'from-sky-400 via-blue-500 to-blue-600',
  dashboards: 'from-rose-400 via-pink-500 to-pink-600',
  ai: 'from-violet-500 via-purple-600 to-indigo-700',
  security: 'from-slate-600 via-gray-700 to-gray-800',
  privacy: 'from-green-500 via-emerald-600 to-teal-700',
  productivity: 'from-orange-400 via-amber-500 to-yellow-600',
};

const DEFAULT_GRADIENT = 'from-zinc-500 via-zinc-600 to-zinc-700';

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

  const hero = apps[0];
  const rest = apps.slice(1, 4);
  const heroGradient = GRADIENTS[hero.category] || DEFAULT_GRADIENT;

  return (
    <section className="mb-12">
      {/* Hero card — large spotlight */}
      <Link
        href={`/store/${hero.id}${qs ? `?${qs}` : ''}`}
        className={`group relative mb-4 flex h-64 flex-col justify-end overflow-hidden rounded-3xl bg-gradient-to-br ${heroGradient} p-8 transition-all duration-300 hover:shadow-2xl hover:scale-[1.005]`}
      >
        {/* Decorative circles */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-8 -left-8 h-48 w-48 rounded-full bg-white/5" />

        <div className="relative flex items-end gap-4">
          <img
            src={hero.icon_url}
            alt={`${hero.name} icon`}
            className="h-20 w-20 rounded-[22px] bg-white/20 object-contain p-2 shadow-lg backdrop-blur-md ring-1 ring-white/20"
          />
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/60">
              Featured
            </p>
            <h3 className="text-2xl font-bold text-white">
              {hero.name}
            </h3>
            <p className="mt-0.5 text-sm text-white/75">
              {hero.tagline}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-white px-5 py-2 text-sm font-bold text-gray-900 shadow-md transition-transform group-hover:scale-105">
            Get
          </span>
        </div>
      </Link>

      {/* Secondary featured cards */}
      {rest.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((app) => {
            const gradient = GRADIENTS[app.category] || DEFAULT_GRADIENT;
            return (
              <Link
                key={app.id}
                href={`/store/${app.id}${qs ? `?${qs}` : ''}`}
                className={`group relative flex h-40 flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-5 transition-all duration-300 hover:shadow-lg hover:scale-[1.01]`}
              >
                <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/5" />
                <div className="flex items-end gap-3">
                  <img
                    src={app.icon_url}
                    alt={`${app.name} icon`}
                    className="h-14 w-14 rounded-2xl bg-white/20 object-contain p-1.5 shadow-sm backdrop-blur-sm ring-1 ring-white/10"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-bold text-white">
                      {app.name}
                    </h3>
                    <p className="truncate text-xs text-white/70">
                      {app.tagline}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/90 px-4 py-1.5 text-xs font-bold text-gray-900 shadow-sm backdrop-blur-sm">
                    Get
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
