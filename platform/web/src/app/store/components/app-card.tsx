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

  const badge = (() => {
    if (!isEmbedded) return (
      <span className="shrink-0 rounded-full bg-gray-100 px-3.5 py-1 text-xs font-bold text-blue-600">
        Get
      </span>
    );
    const status = getAppStatus(app.id);
    if (status === 'running') return (
      <span className="shrink-0 rounded-full bg-emerald-50 px-3.5 py-1 text-xs font-bold text-emerald-600">
        Open
      </span>
    );
    if (status === 'installing') {
      const progress = getInstallProgress(app.id);
      return (
        <span className="shrink-0 rounded-full bg-blue-50 px-3.5 py-1 text-xs font-bold text-blue-600">
          {progress > 0 ? `${progress}%` : 'Installing'}
        </span>
      );
    }
    if (status === 'uninstalling') return (
      <span className="shrink-0 rounded-full bg-red-50 px-3.5 py-1 text-xs font-bold text-red-500">
        Removing
      </span>
    );
    if (status === 'stopped') return (
      <span className="shrink-0 rounded-full bg-amber-50 px-3.5 py-1 text-xs font-bold text-amber-600">
        Stopped
      </span>
    );
    return (
      <span className="shrink-0 rounded-full bg-gray-100 px-3.5 py-1 text-xs font-bold text-blue-600">
        Get
      </span>
    );
  })();

  return (
    <Link
      href={href}
      className="group flex items-center gap-3.5 rounded-2xl bg-white p-3.5 ring-1 ring-black/[0.04] transition-all duration-200 hover:shadow-md hover:ring-black/[0.08]"
    >
      <img
        src={app.icon_url}
        alt={`${app.name} icon`}
        className="h-14 w-14 shrink-0 rounded-[14px] bg-gray-50 object-contain p-1 shadow-sm ring-1 ring-black/[0.06]"
      />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-semibold text-gray-900">
          {app.name}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-gray-500">
          {app.tagline}
        </p>
        {cat && (
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-gray-400">
            {cat.label}
          </p>
        )}
      </div>
      {badge}
    </Link>
  );
}
