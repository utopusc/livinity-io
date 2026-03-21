'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useStore } from '../store-provider';
import { CATEGORIES } from '../types';

// --- Types ---

interface ProfileData {
  email: string;
  instance_count: number;
  app_count: number;
}

interface InstalledApp {
  app_id: string;
  name: string;
  tagline: string;
  icon_url: string;
  version: string;
  category: string;
  installed_at: string;
}

interface HistoryEvent {
  id: string;
  app_id: string;
  app_name: string;
  icon_url: string;
  action: 'install' | 'uninstall';
  instance_name: string;
  created_at: string;
}

// --- Helpers ---

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

// --- Component ---

export default function ProfilePage() {
  const { token, instanceName } = useStore();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [instances, setInstances] = useState<Record<string, InstalledApp[]> | null>(null);
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (instanceName) params.set('instance', instanceName);
  const qs = params.toString();

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('Connect your LivOS instance to view your profile');
      return;
    }

    const headers = { 'X-Api-Key': token };

    Promise.all([
      fetch('/api/user/profile', { headers }).then((r) => {
        if (!r.ok) throw new Error('Failed to load profile');
        return r.json();
      }),
      fetch('/api/user/apps', { headers }).then((r) => {
        if (!r.ok) throw new Error('Failed to load apps');
        return r.json();
      }),
      fetch('/api/user/history', { headers }).then((r) => {
        if (!r.ok) throw new Error('Failed to load history');
        return r.json();
      }),
    ])
      .then(([profileData, appsData, historyData]) => {
        setProfile(profileData as ProfileData);
        setInstances((appsData as { instances: Record<string, InstalledApp[]> }).instances);
        setEvents((historyData as { events: HistoryEvent[] }).events);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  // No token state
  if (!loading && error && !token) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="rounded-xl bg-[#f5f5f7] px-8 py-12 text-center">
          <p className="text-sm text-[#86868b]">{error}</p>
        </div>
      </div>
    );
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8 animate-pulse">
        {/* Profile header skeleton */}
        <div className="mb-10 rounded-2xl bg-gradient-to-r from-teal-50 to-cyan-50 p-8">
          <div className="h-5 w-48 rounded bg-teal-100/60" />
          <div className="mt-3 flex gap-4">
            <div className="h-8 w-24 rounded-lg bg-teal-100/60" />
            <div className="h-8 w-24 rounded-lg bg-teal-100/60" />
          </div>
        </div>
        {/* Installed apps skeleton */}
        <div className="mb-10">
          <div className="mb-4 h-6 w-36 rounded bg-[#f5f5f7]" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl bg-[#f5f5f7] p-4">
                <div className="h-16 w-16 rounded-2xl bg-[#e8e8ed]" />
                <div className="mt-3 h-4 w-24 rounded bg-[#e8e8ed]" />
              </div>
            ))}
          </div>
        </div>
        {/* Timeline skeleton */}
        <div>
          <div className="mb-4 h-6 w-24 rounded bg-[#f5f5f7]" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="mb-3 flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-[#e8e8ed]" />
              <div className="h-4 w-64 rounded bg-[#f5f5f7]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state (after loading)
  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <Link
          href={`/store${qs ? `?${qs}` : ''}`}
          className="mb-8 inline-flex items-center gap-1 text-sm text-teal-500 transition-colors hover:text-teal-600"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 12L6 8l4-4" />
          </svg>
          Store
        </Link>
        <div className="rounded-xl bg-[#f5f5f7] px-8 py-6 text-center">
          <p className="text-sm text-[#86868b]">{error}</p>
        </div>
      </div>
    );
  }

  const totalApps = instances
    ? Object.values(instances).reduce((sum, apps) => sum + apps.length, 0)
    : 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Back to store */}
      <Link
        href={`/store${qs ? `?${qs}` : ''}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-teal-500 transition-colors hover:text-teal-600"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 12L6 8l4-4" />
        </svg>
        Store
      </Link>

      {/* Section A: Profile Header */}
      {profile && (
        <div className="mb-10 rounded-2xl bg-gradient-to-r from-teal-50 to-cyan-50 p-8">
          <h1 className="text-2xl font-bold text-[#1d1d1f]">{profile.email}</h1>
          <div className="mt-3 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-3 py-1.5 text-sm font-medium text-[#1d1d1f] shadow-sm">
              <span className="text-teal-500">{profile.instance_count}</span>
              {profile.instance_count === 1 ? 'instance' : 'instances'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-3 py-1.5 text-sm font-medium text-[#1d1d1f] shadow-sm">
              <span className="text-teal-500">{profile.app_count}</span>
              {profile.app_count === 1 ? 'app' : 'apps'} installed
            </span>
          </div>
        </div>
      )}

      {/* Section B: Installed Apps */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold text-[#1d1d1f]">Installed Apps</h2>

        {totalApps === 0 ? (
          <div className="rounded-xl bg-[#f5f5f7] px-8 py-10 text-center">
            <p className="text-sm text-[#86868b]">
              No apps installed yet.{' '}
              <Link
                href={`/store${qs ? `?${qs}` : ''}`}
                className="text-teal-500 hover:text-teal-600"
              >
                Browse the store
              </Link>{' '}
              to get started.
            </p>
          </div>
        ) : (
          instances &&
          Object.entries(instances).map(([name, apps]) => (
            <div key={name} className="mb-6">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#86868b]">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="2" width="12" height="10" rx="2" />
                  <path d="M4 2V1M10 2V1" />
                </svg>
                {name}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {apps.map((app) => {
                  const cat = CATEGORIES[app.category];
                  return (
                    <Link
                      key={app.app_id}
                      href={`/store/${app.app_id}${qs ? `?${qs}` : ''}`}
                      className="flex items-center gap-4 rounded-xl bg-[#f5f5f7] p-4 transition-colors hover:bg-[#ededf0]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={app.icon_url}
                        alt={`${app.name} icon`}
                        className="h-16 w-16 shrink-0 rounded-2xl bg-white object-contain p-2 shadow-sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#1d1d1f]">{app.name}</p>
                        <p className="mt-0.5 text-xs text-[#86868b]">v{app.version}</p>
                        {cat && (
                          <span className="mt-1.5 inline-block rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[#86868b]">
                            {cat.icon} {cat.label}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>

      {/* Section C: History Timeline */}
      <section>
        <h2 className="mb-4 text-xl font-semibold text-[#1d1d1f]">History</h2>

        {!events || events.length === 0 ? (
          <div className="rounded-xl bg-[#f5f5f7] px-8 py-10 text-center">
            <p className="text-sm text-[#86868b]">No history yet</p>
          </div>
        ) : (
          <div className="relative pl-6">
            {/* Timeline line */}
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-[#e5e5e7]" />

            {events.map((event) => (
              <div key={event.id} className="relative mb-4 flex items-start gap-4">
                {/* Dot */}
                <div
                  className={`relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                    event.action === 'install'
                      ? 'bg-green-500'
                      : 'bg-red-500'
                  }`}
                  style={{ marginLeft: '-6px' }}
                />

                {/* Content */}
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={event.icon_url}
                    alt={`${event.app_name} icon`}
                    className="h-6 w-6 shrink-0 rounded-md bg-white object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[#1d1d1f]">
                      <span className="font-medium">{event.app_name}</span>
                      <span
                        className={
                          event.action === 'install'
                            ? 'ml-1.5 text-green-600'
                            : 'ml-1.5 text-red-500'
                        }
                      >
                        {event.action === 'install' ? 'Installed' : 'Uninstalled'}
                      </span>
                    </p>
                    <p className="text-xs text-[#86868b]">
                      {event.instance_name} &middot; {timeAgo(event.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
