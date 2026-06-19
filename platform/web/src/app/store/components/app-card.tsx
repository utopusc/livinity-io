'use client';

import Link from 'next/link';
import type { MouseEvent } from 'react';
import { useStore } from '../store-provider';
import { CATEGORIES } from '../types';
import type { AppSummary, Section } from '../types';
import { AppIcon } from './app-icon';
import { Icon } from './icons';

// Phase 157 follow-up — for non-Docker sections the LivOS bridge cannot
// fetch the catalog row itself (LivOS UI CSP blocks the livinity.io
// apex). Inline-install path pre-fetches /api/apps/:id same-origin from
// inside the iframe, then attaches name/category/manifest to the
// install postMessage. Network failures fall through to a manifest-less
// send — the bridge will surface the install error to the user.
async function fetchAppFull(
  appId: string,
  token: string | null,
): Promise<{ name?: string; category?: string; manifest?: unknown; iconUrl?: string }> {
  try {
    const res = await fetch(`/api/apps/${encodeURIComponent(appId)}`, {
      headers: token ? { 'X-Api-Key': token } : undefined,
    });
    if (!res.ok) return {};
    const full = await res.json();
    return {
      name: typeof full?.name === 'string' ? full.name : undefined,
      category: typeof full?.category === 'string' ? full.category : undefined,
      manifest: full?.manifest,
      // Phase 259 — forward the hosted icon so the native desktop tile shows
      // real artwork (the manifest's freedesktop icon name isn't renderable).
      iconUrl: typeof full?.icon_url === 'string' ? full.icon_url : undefined,
    };
  } catch {
    return {};
  }
}

interface AppCardProps {
  app: AppSummary;
  featured?: boolean;
}

// Phase 157 — single-click install button copy per section. Matches the
// expectation users land on when looking at each section ("Install" reads
// wrong on a webapp; "Install" reads odd on an MCP server).
// Webapps pin to the LivOS DESKTOP (not the dock taskbar) — keep the
// copy honest about where the icon will appear.
function installLabel(section: Section): string {
  switch (section) {
    case 'webapp':
      return 'Add to desktop';
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
    getAppProvisioning,
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
  // Phase 287 — app is up but its per-app subdomain DNS is not yet client-live.
  const provisioning = isEmbedded ? getAppProvisioning(app.id) : false;
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
              onClick={async (e) => {
                stop(e);
                if (app.section === 'app') {
                  // Docker path doesn't need a manifest payload — bridge
                  // calls the legacy compose flow that uses composeUrl.
                  sendInstall(app.id, app.section);
                } else {
                  // Same-origin fetch from inside the iframe — CSP-safe
                  // and gives us the manifest the bridge needs to
                  // dispatch installV37 / webapp.create.
                  const payload = await fetchAppFull(app.id, token);
                  sendInstall(app.id, app.section, payload);
                }
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
              {/* Phase 157 round 3 — webapps + AI installs don't have a
                  meaningful "Open URL from store" action. Webapps live
                  on the desktop (clicking Open would route to a bogus
                  subdomain). AI installs surface inside AI Chat. Show
                  an "Added" badge instead of a URL Open button. */}
              {app.section === 'webapp' || app.section === 'ai' ? (
                <span
                  className="install ghost card-install"
                  style={{
                    cursor: 'default',
                    pointerEvents: 'none',
                    color: 'var(--fg)',
                  }}
                  title={
                    app.section === 'webapp'
                      ? 'Added — click the icon on your desktop'
                      : 'Added — available in AI Chat'
                  }
                >
                  <Icon name="check" size={12} /> Added
                </span>
              ) : provisioning ? (
                // Phase 287 — subdomain DNS not yet client-live. The LivOS
                // bridge already withholds the actual window.open on this same
                // signal (handleOpen gate); show a disabled "Preparing…" state
                // so the user gets honest feedback instead of a no-op click.
                <span
                  className="install ghost card-install"
                  aria-disabled="true"
                  style={{ pointerEvents: 'none', opacity: 0.7 }}
                  title="Preparing…"
                >
                  Preparing…
                </span>
              ) : (
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
              )}
              <button
                type="button"
                className="install ghost card-install"
                onClick={(e) => {
                  stop(e);
                  sendUninstall(app.id, app.section);
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
