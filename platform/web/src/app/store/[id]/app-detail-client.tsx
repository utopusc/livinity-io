'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useStore } from '../store-provider';
import { CATEGORIES } from '../types';
import type { App } from '../types';

interface AppDetailClientProps {
  appId: string;
}

export function AppDetailClient({ appId }: AppDetailClientProps) {
  const { token, instanceName, isEmbedded, getAppStatus, getInstallProgress, appCredentials, clearCredentials, sendInstall, sendUninstall, sendOpen, getAppSubdomain, sendUpdateSubdomain } = useStore();
  const status = isEmbedded ? getAppStatus(appId) : 'not_installed';
  const isInstalled = status === 'running' || status === 'stopped';
  const currentSubdomain = getAppSubdomain(appId);
  const [editingSubdomain, setEditingSubdomain] = useState(false);
  const [subdomainValue, setSubdomainValue] = useState('');
  const [app, setApp] = useState<App | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCredentials, setShowCredentials] = useState(false);

  // Auto-show credentials dialog when credentials arrive for this app
  useEffect(() => {
    if (appCredentials && appCredentials.appId === appId) {
      setShowCredentials(true);
    }
  }, [appCredentials, appId]);

  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (instanceName) params.set('instance', instanceName);
  const qs = params.toString();

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

  // Loading skeleton
  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8 animate-pulse">
        <div className="mb-8 h-4 w-16 rounded bg-[#f5f5f7]" />
        <div className="mb-8 flex items-start gap-6">
          <div className="h-32 w-32 shrink-0 rounded-3xl bg-[#f5f5f7]" />
          <div className="flex-1 space-y-3 pt-2">
            <div className="h-8 w-48 rounded bg-[#f5f5f7]" />
            <div className="h-5 w-64 rounded bg-[#f5f5f7]" />
            <div className="h-4 w-32 rounded bg-[#f5f5f7]" />
          </div>
        </div>
        <div className="h-12 w-32 rounded-xl bg-[#f5f5f7]" />
      </div>
    );
  }

  // Error state
  if (error || !app) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Link
          href={`/store${qs ? `?${qs}` : ''}`}
          className="mb-8 inline-flex items-center gap-1 text-sm text-teal-500 transition-colors hover:text-teal-600"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 12L6 8l4-4" />
          </svg>
          Store
        </Link>
        <div className="rounded-xl bg-[#f5f5f7] px-8 py-6 text-center">
          <p className="text-sm text-[#86868b]">{error || 'App not found'}</p>
        </div>
      </div>
    );
  }

  const cat = CATEGORIES[app.category];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Back link */}
      <Link
        href={`/store${qs ? `?${qs}` : ''}`}
        className="mb-8 inline-flex items-center gap-1 text-sm text-teal-500 transition-colors hover:text-teal-600"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 12L6 8l4-4" />
        </svg>
        Store
      </Link>

      {/* App header */}
      <div className="mb-8 flex flex-col items-start gap-6 sm:flex-row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={app.icon_url}
          alt={`${app.name} icon`}
          className="h-32 w-32 shrink-0 rounded-3xl bg-white object-contain p-3 shadow-lg"
        />
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-[#1d1d1f]">{app.name}</h1>
          <p className="mt-1 text-lg text-[#86868b]">{app.tagline}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {cat && (
              <span className="rounded-full bg-[#f5f5f7] px-3 py-1 text-xs font-medium text-[#1d1d1f]">
                {cat.icon} {cat.label}
              </span>
            )}
            <span className="rounded-full bg-[#f5f5f7] px-3 py-1 text-xs font-medium text-[#86868b]">
              v{app.version}
            </span>
            {app.verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="currentColor"
                >
                  <path d="M6 0a6 6 0 1 1 0 12A6 6 0 0 1 6 0Zm2.65 4.15a.5.5 0 0 0-.8-.6L5.4 7.2 4.15 5.95a.5.5 0 1 0-.7.7l1.6 1.6a.5.5 0 0 0 .75-.05l2.85-4.05Z" />
                </svg>
                Verified
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      {(() => {
        const status = getAppStatus(app.id);

        if (!isEmbedded) {
          return (
            <p className="mb-10 text-sm text-[#86868b]">
              Open this store from your LivOS instance to install apps
            </p>
          );
        }

        if (status === 'installing') {
          const progress = getInstallProgress(app.id);
          return (
            <div className="mb-10">
              <button
                disabled
                className="rounded-xl bg-[#f5f5f7] px-8 py-3 text-sm font-semibold text-[#86868b] cursor-not-allowed"
              >
                Installing{progress > 0 ? ` ${progress}%` : '...'}
              </button>
              {progress > 0 && (
                <div className="mt-3 h-1.5 w-48 rounded-full bg-[#f5f5f7] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-teal-500 transition-all duration-500"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
              )}
            </div>
          );
        }

        if (status === 'running') {
          return (
            <div className="mb-10 flex gap-3">
              <button
                onClick={() => sendOpen(app.id)}
                className="rounded-xl bg-teal-500 px-8 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-teal-600 hover:shadow-md active:scale-[0.98]"
              >
                Open
              </button>
              <button
                onClick={() => sendUninstall(app.id)}
                className="rounded-xl bg-[#f5f5f7] px-6 py-3 text-sm font-semibold text-red-500 transition-all hover:bg-red-50 active:scale-[0.98]"
              >
                Uninstall
              </button>
            </div>
          );
        }

        if (status === 'stopped') {
          return (
            <div className="mb-10 flex gap-3">
              <button
                onClick={() => sendOpen(app.id)}
                className="rounded-xl bg-teal-500 px-8 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-teal-600 hover:shadow-md active:scale-[0.98]"
              >
                Start
              </button>
              <button
                onClick={() => sendUninstall(app.id)}
                className="rounded-xl bg-[#f5f5f7] px-6 py-3 text-sm font-semibold text-red-500 transition-all hover:bg-red-50 active:scale-[0.98]"
              >
                Uninstall
              </button>
            </div>
          );
        }

        // not_installed
        return (
          <button
            onClick={() => sendInstall(app.id)}
            className="mb-10 rounded-xl bg-teal-500 px-8 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-teal-600 hover:shadow-md active:scale-[0.98]"
          >
            Install
          </button>
        );
      })()}

      {/* Description */}
      <section className="mb-10">
        <h2 className="mb-3 text-xl font-semibold text-[#1d1d1f]">
          About this app
        </h2>
        <p className="whitespace-pre-line text-sm leading-relaxed text-[#424245]">
          {app.description}
        </p>
      </section>

      {/* Info grid */}
      <section>
        <h2 className="mb-3 text-xl font-semibold text-[#1d1d1f]">
          Information
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[#f5f5f7] p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[#86868b]">
              Version
            </p>
            <p className="mt-1 text-sm font-semibold text-[#1d1d1f]">
              {app.version}
            </p>
          </div>
          <div className="rounded-xl bg-[#f5f5f7] p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[#86868b]">
              Category
            </p>
            <p className="mt-1 text-sm font-semibold text-[#1d1d1f]">
              {cat?.label || app.category}
            </p>
          </div>
          {isInstalled && instanceName && (
            <div className="col-span-2 rounded-xl bg-[#f5f5f7] p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-[#86868b]">
                  Access URL
                </p>
                {isEmbedded && (
                  <button
                    onClick={() => {
                      setSubdomainValue(currentSubdomain || app.id);
                      setEditingSubdomain(true);
                    }}
                    className="rounded-md bg-teal-500/10 px-2.5 py-1 text-xs font-semibold text-teal-600 transition-colors hover:bg-teal-500/20"
                  >
                    Change
                  </button>
                )}
              </div>
              {editingSubdomain ? (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex items-center rounded-lg border border-[#d2d2d7] bg-white">
                    <input
                      type="text"
                      value={subdomainValue}
                      onChange={(e) => setSubdomainValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      className="w-24 rounded-l-lg px-2 py-1.5 text-sm text-[#1d1d1f] outline-none"
                      autoFocus
                    />
                    <span className="border-l border-[#d2d2d7] px-2 py-1.5 text-xs text-[#86868b]">
                      .{instanceName}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (subdomainValue && subdomainValue !== currentSubdomain) {
                        sendUpdateSubdomain(app.id, subdomainValue);
                      }
                      setEditingSubdomain(false);
                    }}
                    className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-600"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingSubdomain(false)}
                    className="rounded-lg px-2 py-1.5 text-xs text-[#86868b] hover:text-[#1d1d1f]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-sm font-semibold text-teal-600 break-all">
                  https://{currentSubdomain || app.id}.{instanceName}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Credentials dialog */}
      {showCredentials && appCredentials && appCredentials.appId === app.id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-[#1d1d1f]">App Credentials</h3>
            <p className="mt-1 text-sm text-[#86868b]">
              Save these credentials to log into {app.name}
            </p>
            <div className="mt-4 space-y-3">
              {appCredentials.username && (
                <div className="flex items-center gap-2 rounded-xl bg-[#f5f5f7] p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-[#86868b]">Username</p>
                    <p className="mt-1 truncate font-mono text-sm text-[#1d1d1f]">{appCredentials.username}</p>
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(appCredentials.username)}
                    className="shrink-0 rounded-lg bg-white p-2 text-[#86868b] shadow-sm transition-colors hover:text-[#1d1d1f]"
                    title="Copy"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M5 11H3.5A1.5 1.5 0 0 1 2 9.5v-7A1.5 1.5 0 0 1 3.5 1h7A1.5 1.5 0 0 1 12 2.5V5"/></svg>
                  </button>
                </div>
              )}
              {appCredentials.password && (
                <div className="flex items-center gap-2 rounded-xl bg-[#f5f5f7] p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-[#86868b]">Password</p>
                    <p className="mt-1 truncate font-mono text-sm text-[#1d1d1f]">{appCredentials.password}</p>
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(appCredentials.password)}
                    className="shrink-0 rounded-lg bg-white p-2 text-[#86868b] shadow-sm transition-colors hover:text-[#1d1d1f]"
                    title="Copy"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M5 11H3.5A1.5 1.5 0 0 1 2 9.5v-7A1.5 1.5 0 0 1 3.5 1h7A1.5 1.5 0 0 1 12 2.5V5"/></svg>
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => {
                setShowCredentials(false);
                clearCredentials();
              }}
              className="mt-5 w-full rounded-xl bg-teal-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-600"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
