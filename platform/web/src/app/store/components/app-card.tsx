'use client';

import Link from 'next/link';
import { useStore } from '../store-provider';
import { CATEGORIES } from '../types';
import type { AppSummary } from '../types';

interface AppCardProps {
  app: AppSummary;
}

export function AppCard({ app }: AppCardProps) {
  const { token, instanceName, getAppStatus, getInstallProgress, isEmbedded } = useStore();
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (instanceName) params.set('instance', instanceName);
  const qs = params.toString();
  const href = `/store/${app.id}${qs ? `?${qs}` : ''}`;
  const cat = CATEGORIES[app.category];

  return (
    <Link
      href={href}
      className="group flex flex-col rounded-xl bg-[#f5f5f7] p-4 transition-all hover:shadow-md hover:scale-[1.01]"
    >
      <div className="flex items-start gap-3">
        <img
          src={app.icon_url}
          alt={`${app.name} icon`}
          className="h-12 w-12 rounded-xl bg-white object-contain p-1 shadow-sm"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[#1d1d1f]">
            {app.name}
          </h3>
          <p className="mt-0.5 line-clamp-2 text-xs text-[#86868b]">
            {app.tagline}
          </p>
        </div>
        {(() => {
          if (!isEmbedded) return (
            <span className="shrink-0 rounded-full bg-[#f5f5f7] px-3 py-1 text-xs font-semibold text-[#86868b]">
              Get
            </span>
          );
          const status = getAppStatus(app.id);
          if (status === 'running') return (
            <span className="shrink-0 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600">
              Open
            </span>
          );
          if (status === 'installing') {
            const progress = getInstallProgress(app.id);
            return (
              <span className="shrink-0 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-600">
                {progress > 0 ? `${progress}%` : 'Installing'}
              </span>
            );
          }
          if (status === 'stopped') return (
            <span className="shrink-0 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600">
              Stopped
            </span>
          );
          return (
            <span className="shrink-0 rounded-full bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-600">
              Get
            </span>
          );
        })()}
      </div>
      {cat && (
        <span className="mt-3 self-start text-[10px] font-medium uppercase tracking-wider text-[#86868b]">
          {cat.label}
        </span>
      )}
    </Link>
  );
}
