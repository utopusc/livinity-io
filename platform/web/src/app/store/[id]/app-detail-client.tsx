'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useStore } from '../store-provider';
import { CATEGORIES } from '../types';
import type { App } from '../types';
import { AppIcon } from '../components/app-icon';
import { Icon } from '../components/icons';
import { appVisual } from '../lib/app-visual';

interface AppDetailClientProps {
  appId: string;
}

function copyToClipboard(text: string): void {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch {
    /* ignore */
  }
  document.body.removeChild(ta);
}

// Format byte count → "1.2 GB" / "768 MB" / etc. for the meta panel.
function humanSize(bytes?: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function AppDetailClient({ appId }: AppDetailClientProps) {
  const {
    token,
    instanceName,
    isEmbedded,
    getAppStatus,
    getAppProvisioning,
    getInstallProgress,
    appCredentials,
    clearCredentials,
    sendInstall,
    sendUninstall,
    sendOpen,
    getAppSubdomain,
    getAppDefaultCreds,
    sendUpdateSubdomain,
  } = useStore();

  const [app, setApp] = useState<App | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCredentials, setShowCredentials] = useState(false);
  const [editingSubdomain, setEditingSubdomain] = useState(false);
  const [subdomainValue, setSubdomainValue] = useState('');

  useEffect(() => {
    if (appCredentials && appCredentials.appId === appId) {
      setShowCredentials(true);
    }
  }, [appCredentials, appId]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('Connect your LivOS instance to view app details');
      return;
    }
    fetch(`/api/apps/${appId}`, { headers: { 'X-Api-Key': token } })
      .then((res) => {
        if (res.status === 404) throw new Error('App not found');
        if (!res.ok) throw new Error('Failed to load app');
        return res.json();
      })
      .then((data: App) => {
        setApp(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [appId, token]);

  const status = isEmbedded ? getAppStatus(appId) : 'not_installed';
  // Phase 287 — app is up but its per-app subdomain DNS is not yet client-live.
  const provisioning = isEmbedded ? getAppProvisioning(appId) : false;
  const isInstalled = status === 'running' || status === 'stopped';
  const currentSubdomain = isEmbedded ? getAppSubdomain(appId) : undefined;
  const defaultCreds = isEmbedded ? getAppDefaultCreds(appId) : undefined;

  // qs for back-link to /store with section preserved
  // Security (feedback 42ed3227): no token in link hrefs — cookie carries it.
  const backParams = new URLSearchParams();
  if (instanceName) backParams.set('instance', instanceName);
  if (app?.section) backParams.set('section', app.section);
  const backHref = `/store?${backParams.toString()}`;

  if (loading) {
    return (
      <div className="main">
        <p style={{ color: 'var(--fg-mute)', fontSize: 14 }}>Loading…</p>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="main">
        <Link href="/store" className="detail-back">
          <Icon name="arrow-left" size={12} /> Back to Store
        </Link>
        <div className="state" style={{ padding: '64px 32px' }}>
          <div className="state-glyph">
            <Icon name="alert" size={26} />
          </div>
          <h2 className="state-title">{error || 'App not found'}</h2>
        </div>
      </div>
    );
  }

  const cat = CATEGORIES[app.category];
  const visual = appVisual(app.id, app.name);

  // Optional structured fields read from manifest — we don't enforce
  // these at the API/Drizzle layer, so use cast + safe access.
  type Manifest = {
    port?: number | string;
    install?: { primary?: 'apt' | 'appimage'; aptPackages?: string[] };
    install_size?: number;
    requirements?: { ram?: string; disk?: string };
  };
  const manifest = app.manifest as Manifest | undefined;
  const installSize = humanSize((manifest as { installSize?: number } | undefined)?.installSize);

  return (
    <div className="detail">
      <div className="detail-hero">
        <Link href={backHref} className="detail-back">
          <Icon name="arrow-left" size={12} /> Back to Store
        </Link>

        <div className="detail-header-row">
          {app.icon_url ? (
            <span
              className="detail-icon"
              style={{ background: '#fff', padding: 14, color: 'var(--fg)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={app.icon_url}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            </span>
          ) : (
            <span
              className="detail-icon"
              style={{ background: `linear-gradient(135deg, ${visual.c1}, ${visual.c2})` }}
            >
              {visual.mono}
            </span>
          )}

          <div className="detail-meta">
            <h1 className="detail-name">
              {app.name}
              {app.verified && <span className="tag verified">Verified</span>}
            </h1>
            <div className="detail-tag">{app.tagline}</div>
            <div className="detail-meta-row">
              <span>{cat?.label ?? app.category}</span>
              <span className="sep">·</span>
              <span>v{app.version}</span>
              {installSize && (
                <>
                  <span className="sep">·</span>
                  <span>{installSize}</span>
                </>
              )}
              <span className="sep">·</span>
              <span>{app.section}</span>
            </div>
          </div>

          <InstallStateButton
            isEmbedded={isEmbedded}
            status={status}
            provisioning={provisioning}
            section={app.section}
            progress={getInstallProgress(appId)}
            onInstall={() =>
              sendInstall(appId, app.section, {
                name: app.name,
                category: app.category,
                manifest: app.manifest,
                iconUrl: app.icon_url,
              })
            }
            onUninstall={() => sendUninstall(appId, app.section)}
            onOpen={() => sendOpen(appId)}
          />
        </div>
      </div>

      <div className="detail-body">
        <div className="detail-grid">
          <div>
            <div className="detail-section">
              <h3 className="detail-section-title">About</h3>
              <div className="detail-text">
                <p style={{ whiteSpace: 'pre-line' }}>{app.description}</p>
              </div>
            </div>

            {/* Subdomain editor — only meaningful when embedded + installed */}
            {isEmbedded && isInstalled && instanceName && (
              <div className="detail-section">
                <h3 className="detail-section-title">Access URL</h3>
                {editingSubdomain ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      className="form-input-detail"
                      value={subdomainValue}
                      onChange={(e) =>
                        setSubdomainValue(
                          e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                        )
                      }
                      autoFocus
                      style={{
                        padding: '6px 10px',
                        background: 'var(--bg)',
                        border: '1px solid var(--line-strong)',
                        borderRadius: 'var(--r-sm)',
                        fontSize: 13,
                        outline: 'none',
                        fontFamily: 'var(--mono)',
                      }}
                    />
                    <span style={{ color: 'var(--fg-mute)', fontSize: 12, fontFamily: 'var(--mono)' }}>
                      -{instanceName}.livinity.io
                    </span>
                    <button
                      type="button"
                      className="install primary"
                      style={{ padding: '6px 14px', fontSize: 12 }}
                      onClick={() => {
                        if (subdomainValue && subdomainValue !== currentSubdomain) {
                          sendUpdateSubdomain(appId, subdomainValue);
                        }
                        setEditingSubdomain(false);
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="install ghost"
                      style={{ padding: '6px 14px', fontSize: 12 }}
                      onClick={() => setEditingSubdomain(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <code
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 13,
                        color: 'var(--fg)',
                        background: 'var(--bg-2)',
                        padding: '6px 10px',
                        borderRadius: 'var(--r-sm)',
                        wordBreak: 'break-all',
                      }}
                    >
                      https://{currentSubdomain || app.id}-{instanceName}.livinity.io
                    </code>
                    <button
                      type="button"
                      className="install ghost"
                      style={{ padding: '4px 12px', fontSize: 11 }}
                      onClick={() => {
                        setSubdomainValue(currentSubdomain || app.id);
                        setEditingSubdomain(true);
                      }}
                    >
                      Change
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Default credentials shown on App page after install */}
            {isEmbedded && isInstalled && defaultCreds && (defaultCreds.username || defaultCreds.password) && (
              <div className="detail-section">
                <h3 className="detail-section-title">Default credentials</h3>
                <div
                  style={{
                    display: 'flex',
                    gap: 16,
                    padding: 14,
                    background: 'rgba(217, 119, 6, 0.06)',
                    border: '1px solid rgba(217, 119, 6, 0.2)',
                    borderRadius: 'var(--r)',
                    fontSize: 13,
                  }}
                >
                  {defaultCreds.username && (
                    <CopyChip label="User" value={defaultCreds.username} />
                  )}
                  {defaultCreds.password && (
                    <CopyChip label="Pass" value={defaultCreds.password} />
                  )}
                </div>
              </div>
            )}

            {!isEmbedded && (
              <div className="detail-section">
                <p style={{ color: 'var(--fg-mute)', fontSize: 13, fontStyle: 'italic' }}>
                  Open this store from your LivOS instance to install apps.
                </p>
              </div>
            )}
          </div>

          <div>
            <div className="meta-panel">
              <div className="meta-row">
                <span className="k">Section</span>
                <span className="v">{app.section}</span>
              </div>
              <div className="meta-row">
                <span className="k">Category</span>
                <span className="v">{cat?.label ?? app.category}</span>
              </div>
              <div className="meta-row">
                <span className="k">Version</span>
                <span className="v mono">v{app.version}</span>
              </div>
              <div className="meta-row">
                <span className="k">Slug</span>
                <span className="v mono">{app.id}</span>
              </div>
              {app.verified && (
                <div className="meta-row">
                  <span className="k">Verified</span>
                  <span className="v">Yes</span>
                </div>
              )}
              {app.featured && (
                <div className="meta-row">
                  <span className="k">Featured</span>
                  <span className="v">Yes</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showCredentials && appCredentials && appCredentials.appId === app.id && (
        <CredentialsDialog
          username={appCredentials.username}
          password={appCredentials.password}
          appName={app.name}
          onClose={() => {
            setShowCredentials(false);
            clearCredentials();
          }}
        />
      )}
    </div>
  );
}

// ─── Install state machine button ────────────────────────────────────────

function InstallStateButton({
  isEmbedded,
  status,
  provisioning,
  section,
  progress,
  onInstall,
  onUninstall,
  onOpen,
}: {
  isEmbedded: boolean;
  status: ReturnType<ReturnType<typeof useStore>['getAppStatus']>;
  provisioning: boolean;
  section: App['section'];
  progress: number;
  onInstall: () => void;
  onUninstall: () => void;
  onOpen: () => void;
}) {
  // Phase 157 — section-aware copy on the install button so each tab feels
  // native. Webapps pin to the LivOS desktop (icon grid), NOT the dock
  // taskbar — copy reflects where the icon actually appears.
  function installCopy(): string {
    switch (section) {
      case 'webapp': return 'Add to desktop';
      case 'ai': return 'Add';
      case 'plugin': return 'Add plugin';
      default: return 'Install';
    }
  }
  if (!isEmbedded) {
    return (
      <button
        type="button"
        className="install ghost"
        disabled
        style={{ cursor: 'not-allowed' }}
      >
        <Icon name="lock" size={13} /> Browser preview
      </button>
    );
  }

  if (status === 'installing') {
    return (
      <div className="install installing" aria-disabled="true">
        <span>Installing</span>
        <div className="install-progress">
          <i style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--fg-mute)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {progress}%
        </span>
      </div>
    );
  }

  if (status === 'uninstalling') {
    return (
      <button
        type="button"
        className="install ghost"
        disabled
        style={{ color: 'var(--red)', borderColor: 'rgba(220,38,38,0.3)' }}
      >
        Uninstalling…
      </button>
    );
  }

  if (status === 'running' || status === 'stopped') {
    // Phase 287 — app is up but its per-app subdomain DNS is not yet
    // client-confirmed live. The LivOS bridge already withholds the actual
    // window.open on this same signal (handleOpen gate); show a disabled
    // "Preparing…" affordance so the user never gets a no-op click and sees
    // the honest state. Only the URL-opening sections have an Open button to
    // disable — webapp/ai render an "Added" badge (no per-app host) and never
    // form DNS, so they fall through to their existing branch.
    if (provisioning && section !== 'webapp' && section !== 'ai') {
      return (
        <div
          className="install ghost"
          aria-disabled="true"
          style={{ pointerEvents: 'none', opacity: 0.7 }}
        >
          <span>Preparing…</span>
        </div>
      );
    }
    // Phase 157 round 3 — webapps + MCP/agent/GSD don't have a "URL to
    // open" shape that makes sense from the store. Webapps live as
    // desktop icons (clicking the iframe Open button would route to a
    // bogus `${slug}.${instance}` subdomain). AI installs have no UI of
    // their own — they show up inside AI Chat. Show a confirmation
    // label instead of an Open URL button for those sections.
    if (section === 'webapp' || section === 'ai') {
      const copy =
        section === 'webapp'
          ? 'Added to desktop'
          : 'Added to AI Chat';
      return (
        <div className="install-group">
          <span
            className="install ghost"
            style={{
              gap: 6,
              cursor: 'default',
              pointerEvents: 'none',
              color: 'var(--fg)',
            }}
          >
            <Icon name="check" size={13} /> {copy}
          </span>
          <button
            type="button"
            className="install ghost"
            onClick={onUninstall}
            aria-label="Uninstall"
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      );
    }
    return (
      <div className="install-group">
        <button type="button" className="install primary" onClick={onOpen}>
          <Icon name="open" size={13} />
          {status === 'stopped' ? ' Start' : ' Open'}
        </button>
        <button
          type="button"
          className="install ghost"
          onClick={onUninstall}
          aria-label="Uninstall"
        >
          <Icon name="trash" size={13} />
        </button>
      </div>
    );
  }

  // not_installed
  return (
    <button type="button" className="install primary" onClick={onInstall}>
      <Icon name="download" size={13} /> {installCopy()}
    </button>
  );
}

// ─── Copy chip used in credentials inline display ────────────────────────

function CopyChip({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: 'var(--fg-mute)', fontSize: 11 }}>{label}:</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{value}</span>
      <button
        type="button"
        onClick={() => {
          copyToClipboard(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        title="Copy"
        style={{
          background: 'transparent',
          border: 0,
          padding: 2,
          cursor: 'pointer',
          color: copied ? 'var(--green)' : 'var(--fg-mute)',
        }}
      >
        <Icon name={copied ? 'check' : 'external'} size={13} />
      </button>
    </div>
  );
}

// ─── Credentials dialog (post-install one-shot) ──────────────────────────

function CredentialsDialog({
  username,
  password,
  appName,
  onClose,
}: {
  username: string;
  password: string;
  appName: string;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 100,
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: '100%',
          background: 'var(--bg)',
          borderRadius: 'var(--r-xl)',
          padding: 28,
          boxShadow: 'var(--shadow-window)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
          App credentials
        </h3>
        <p style={{ color: 'var(--fg-mute)', fontSize: 13.5, margin: '6px 0 18px' }}>
          Save these to log into {appName}.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {username && <CopyChip label="Username" value={username} />}
          {password && <CopyChip label="Password" value={password} />}
        </div>
        <button
          type="button"
          className="install primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 22 }}
          onClick={onClose}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
