'use client';

import Link from 'next/link';
import { useStore } from '../store-provider';
import { CATEGORIES } from '../types';
import type { AppSummary } from '../types';
import { AppIcon } from './app-icon';

interface AppCardProps {
  app: AppSummary;
  featured?: boolean;
}

export function AppCard({ app, featured = false }: AppCardProps) {
  const { token, instanceName, getAppStatus, getInstallProgress, isEmbedded } = useStore();

  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (instanceName) params.set('instance', instanceName);
  const qs = params.toString();
  const href = `/store/${app.id}${qs ? `?${qs}` : ''}`;
  const cat = CATEGORIES[app.category];

  const status = isEmbedded ? getAppStatus(app.id) : 'not_installed';
  const progress = getInstallProgress(app.id);

  return (
    <Link href={href} className={`card${featured ? ' featured-card' : ''}`}>
      <AppIcon id={app.id} name={app.name} size={featured ? 64 : 48} />
      <div className="card-body">
        <div className="card-name">
          <span>{app.name}</span>
          {/* Featured position IS the badge — show Verified instead on featured cards */}
          {app.featured && !featured && <span className="tag featured">Featured</span>}
          {(status === 'running' || status === 'stopped') && (
            <span className="tag installed dot">Installed</span>
          )}
        </div>
        <div className="card-tag">{app.tagline}</div>
        <div className="card-meta">
          <span>{cat?.label ?? app.category}</span>
          {status === 'installing' && (
            <>
              <span>·</span>
              <span style={{ color: 'var(--fg)' }}>
                {progress > 0 ? `Installing ${progress}%` : 'Installing'}
              </span>
            </>
          )}
          {status === 'uninstalling' && (
            <>
              <span>·</span>
              <span style={{ color: 'var(--red)' }}>Removing</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
