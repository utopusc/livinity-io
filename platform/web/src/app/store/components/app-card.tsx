'use client';

import Link from 'next/link';
import type { MouseEvent } from 'react';
import { useStore } from '../store-provider';
import { CATEGORIES } from '../types';
import type { AppSummary, Section } from '../types';
import { AppIcon } from './app-icon';
import { Icon } from './icons';

interface AppCardProps {
  app: AppSummary;
  featured?: boolean;
}

// Phase 157 — single-click install button copy per section. Matches the
// expectation users land on when looking at each section ("Install" reads
// wrong on a webapp; "Add to dock" reads odd on a Docker app).
function installLabel(section: Section): string {
  switch (section) {
    case 'webapp':
      return 'Add to dock';
    case 'ai':
      return 'Add';
    case 'plugin':
      return 'Add plugin';
    case 'native':
    case 'app':
    default:
      return 'Install';
  }
}

export function AppCard({ app, featured = false }: AppCardProps) {
  const {
    token,
    instanceName,
    isEmbedded,
    getAppStatus,
    getInstallProgress,
    sendInstall,
    sendOpen,
    sendUninstall,
  } = useStore();

  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (instanceName) params.set('instance', instanceName);
  const qs = params.toString();
  const href = `/store/${app.id}${qs ? `?${qs}` : ''}`;
  const cat = CATEGORIES[app.category];

  const status = isEmbedded ? getAppStatus(app.id) : 'not_installed';
  const progress = getInstallProgress(app.id);
  const isInstalled = status === 'running' || status === 'stopped';

  // Action buttons live above the stretched link via z-index; this stops
  // bubble so they don't also fire the card navigation.
  const stop = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className={`card${featured ? ' featured-card' : ''}`}>
      {/* Stretched link covers the card body; action buttons sit above */}
      <Link
        href={href}
        className="card-link-overlay"
        aria-label={`View ${app.name}`}
      />

      <AppIcon
        id={app.id}
        name={app.name}
        iconUrl={app.icon_url}
        size={featured ? 64 : 48}
      />

      <div className="card-body">
        <div className="card-name">
          <span className="card-name-text">{app.name}</span>
          {app.verified && <span className="tag verified">Verified</span>}
          {isInstalled && <span className="tag installed dot">Installed</span>}
        </div>
        <div className="card-tag">{app.tagline}</div>
        <div className="card-meta">
          <span>{cat?.label ?? app.category}</span>
          {status === 'uninstalling' && (
            <>
              <span>·</span>
              <span style={{ color: 'var(--red)' }}>Removing</span>
            </>
          )}
        </div>
      </div>

      {/* Inline action only when embedded. Browser-preview cards stay link-only. */}
      {isEmbedded && (
        <div className="card-action">
          {status === 'not_installed' && (
            <button
              type="button"
              className="install primary card-install"
              onClick={(e) => {
                stop(e);
                sendInstall(app.id, app.section);
              }}
            >
              {installLabel(app.section)}
            </button>
          )}

          {status === 'installing' && (
            <div className="install installing card-install" aria-disabled="true">
              <span className="install-progress">
                <i style={{ width: `${Math.min(progress, 100)}%` }} />
              </span>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  color: 'var(--fg-mute)',
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 28,
                  textAlign: 'right',
                }}
              >
                {progress}%
              </span>
            </div>
          )}

          {isInstalled && (
            <div className="install-group">
              <button
                type="button"
                className="install primary card-install"
                onClick={(e) => {
                  stop(e);
                  sendOpen(app.id);
                }}
                title="Open"
              >
                <Icon name="open" size={12} /> Open
              </button>
              <button
                type="button"
                className="install ghost card-install"
                onClick={(e) => {
                  stop(e);
                  sendUninstall(app.id);
                }}
                aria-label="Uninstall"
                title="Uninstall"
              >
                <Icon name="trash" size={12} />
              </button>
            </div>
          )}

          {status === 'uninstalling' && (
            <button
              type="button"
              className="install ghost card-install"
              disabled
              style={{ color: 'var(--red)', borderColor: 'rgba(220,38,38,0.3)' }}
            >
              Removing…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
