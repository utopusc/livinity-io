'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface DomainRecord {
  id: string;
  domain: string;
  status: 'pending_dns' | 'dns_verified' | 'dns_failed' | 'active' | 'dns_changed' | 'error';
  verification_token: string;
  dns_a_verified: boolean;
  dns_txt_verified: boolean;
  error_message: string | null;
  last_dns_check: string | null;
  verified_at: string | null;
  created_at: string;
}

interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  platform: string;
  createdAt: string;
  lastSeen: string | null;
}

interface DashboardData {
  user: { id: string; username: string; email: string; emailVerified: boolean };
  apiKey: { hasKey: boolean; prefix: string | null };
  server: { online: boolean; url: string };
  bandwidth: { usedBytes: number; limitBytes: number; usedPercent: number };
  devices?: DeviceInfo[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function getDomainBadge(status: string) {
  switch (status) {
    case 'active':
      return { label: 'Active', color: 'bg-emerald-100 text-emerald-700' };
    case 'dns_verified':
      return { label: 'DNS Verified', color: 'bg-emerald-100 text-emerald-700' };
    case 'pending_dns':
      return { label: 'Pending DNS', color: 'bg-yellow-100 text-yellow-700' };
    case 'dns_failed':
      return { label: 'DNS Failed', color: 'bg-red-100 text-red-700' };
    case 'dns_changed':
      return { label: 'DNS Changed', color: 'bg-orange-100 text-orange-700' };
    case 'error':
      return { label: 'Error', color: 'bg-red-100 text-red-700' };
    default:
      return { label: status, color: 'bg-zinc-100 text-zinc-700' };
  }
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="ml-2 rounded border border-zinc-200 px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [installCmd, setInstallCmd] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Domain state
  const [domains, setDomains] = useState<DomainRecord[]>([]);
  const [domainInput, setDomainInput] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [expandedDomainId, setExpandedDomainId] = useState<string | null>(null);

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch('/api/domains');
      if (res.ok) {
        const d = await res.json();
        setDomains(d.domains || []);
      }
    } catch {}
  }, []);

  async function handleAddDomain(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = domainInput.trim().toLowerCase();
    if (!trimmed) return;
    setAddingDomain(true);
    setDomainError(null);
    try {
      const res = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: trimmed }),
      });
      const d = await res.json();
      if (res.ok) {
        setDomainInput('');
        await fetchDomains();
        setExpandedDomainId(d.domain?.id || null);
      } else {
        setDomainError(d.error || 'Failed to add domain');
      }
    } catch {
      setDomainError('Network error. Please try again.');
    } finally {
      setAddingDomain(false);
    }
  }

  async function handleVerifyDomain(id: string) {
    setVerifyingId(id);
    try {
      await fetch(`/api/domains/${id}/verify`, { method: 'POST' });
      await fetchDomains();
    } catch {}
    finally { setVerifyingId(null); }
  }

  async function handleDeleteDomain(id: string) {
    if (!confirm('Remove this domain? This action cannot be undone.')) return;
    try {
      const res = await fetch(`/api/domains/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchDomains();
      }
    } catch {}
  }

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (res.status === 401) { router.push('/login'); return; }
      const d = await res.json();
      setData(d);
    } catch { router.push('/login'); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { fetchData(); fetchDomains(); }, [fetchData, fetchDomains]);

  // Poll connection status + domains every 10s
  useEffect(() => {
    const interval = setInterval(() => { fetchData(); fetchDomains(); }, 10000);
    return () => clearInterval(interval);
  }, [fetchData, fetchDomains]);

  async function generateKey(action: string) {
    setGenerating(true);
    try {
      const res = await fetch('/api/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const d = await res.json();
      if (d.apiKey) {
        setNewKey(d.apiKey);
        setInstallCmd(d.installCommand);
        await fetchData();
      }
    } finally { setGenerating(false); }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-zinc-500">Loading...</p></div>;
  }

  if (!data) return null;

  const bwPercent = data.bandwidth.usedPercent;
  const bwColor = bwPercent >= 95 ? 'bg-red-500' : bwPercent >= 80 ? 'bg-yellow-500' : 'bg-emerald-500';

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Livinity</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-500">{data.user.username}</span>
            <button onClick={handleLogout} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        {/* Email verification warning */}
        {!data.user.emailVerified && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900 dark:bg-yellow-950">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Please verify your email address to generate API keys.
            </p>
          </div>
        )}

        {/* New key display modal */}
        {newKey && (
          <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-6 dark:border-emerald-700 dark:bg-emerald-950">
            <h3 className="mb-2 text-base font-semibold text-emerald-900 dark:text-emerald-100">Your API Key (save it now!)</h3>
            <p className="mb-3 text-xs text-emerald-700 dark:text-emerald-300">This key will only be shown once. Copy it now.</p>
            <div className="flex items-center rounded-lg bg-white p-3 font-mono text-sm dark:bg-zinc-900">
              <code className="flex-1 break-all text-zinc-900 dark:text-zinc-50">{newKey}</code>
              <CopyButton text={newKey} />
            </div>
            {installCmd && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-medium text-emerald-800 dark:text-emerald-200">Install command:</p>
                <div className="flex items-center rounded-lg bg-white p-3 font-mono text-xs dark:bg-zinc-900">
                  <code className="flex-1 break-all text-zinc-700 dark:text-zinc-300">{installCmd}</code>
                  <CopyButton text={installCmd} />
                </div>
              </div>
            )}
            <button onClick={() => { setNewKey(null); setInstallCmd(null); }} className="mt-4 text-sm text-emerald-700 hover:underline dark:text-emerald-300">
              I&apos;ve saved my key
            </button>
          </div>
        )}

        {/* Server Status */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Server Status</h2>
            <div className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full ${data.server.online ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
              <span className="text-sm text-zinc-500">{data.server.online ? 'Online' : 'Offline'}</span>
            </div>
          </div>

          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Your URL</span>
              <div className="flex items-center">
                <a href={data.server.url} target="_blank" rel="noopener noreferrer" className="font-medium text-zinc-900 hover:underline dark:text-zinc-50">
                  {data.server.url.replace('https://', '')}
                </a>
                <CopyButton text={data.server.url} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">API Key</span>
              <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                {data.apiKey.hasKey ? `${data.apiKey.prefix}...` : 'Not generated'}
              </span>
            </div>
          </div>
        </div>

        {/* API Key Section */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">API Key</h2>

          {!data.apiKey.hasKey ? (
            <div>
              <p className="mb-4 text-sm text-zinc-500">Generate an API key to connect your LivOS server.</p>
              <button
                onClick={() => generateKey('generate-key')}
                disabled={generating || !data.user.emailVerified}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {generating ? 'Generating...' : 'Generate API Key'}
              </button>
            </div>
          ) : (
            <div>
              <p className="mb-4 text-sm text-zinc-500">
                Key prefix: <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">{data.apiKey.prefix}...</code>
              </p>
              <button
                onClick={() => { if (confirm('This will invalidate your current key and disconnect your server. Continue?')) generateKey('regenerate-key'); }}
                disabled={generating}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
              >
                {generating ? 'Regenerating...' : 'Regenerate Key'}
              </button>
            </div>
          )}
        </div>

        {/* Bandwidth */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Bandwidth</h2>
            <span className="text-sm text-zinc-500">
              {formatBytes(data.bandwidth.usedBytes)} / {formatBytes(data.bandwidth.limitBytes)}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div className={`h-full rounded-full transition-all ${bwColor}`} style={{ width: `${Math.min(bwPercent, 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-zinc-400">{bwPercent}% of monthly free tier used</p>
        </div>

        {/* Custom Domains */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Custom Domains</h2>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {domains.length}/3
              </span>
            </div>
          </div>

          {/* Add Domain Form */}
          <form onSubmit={handleAddDomain} className="mb-4 flex gap-2">
            <input
              type="text"
              value={domainInput}
              onChange={(e) => { setDomainInput(e.target.value); setDomainError(null); }}
              placeholder="yourdomain.com"
              className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder:text-zinc-500"
              disabled={addingDomain}
            />
            <button
              type="submit"
              disabled={addingDomain || !domainInput.trim()}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {addingDomain ? 'Adding...' : 'Add Domain'}
            </button>
          </form>
          {domainError && (
            <p className="mb-4 text-sm text-red-600 dark:text-red-400">{domainError}</p>
          )}

          {/* Domain List */}
          {domains.length > 0 ? (
            <div className="space-y-3">
              {domains.map((domain) => {
                const badge = getDomainBadge(domain.status);
                const isExpanded = expandedDomainId === domain.id;
                return (
                  <div key={domain.id} className="rounded-lg border border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setExpandedDomainId(isExpanded ? null : domain.id)}
                          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                          aria-label={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          <svg className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        <div>
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{domain.domain}</p>
                          {domain.last_dns_check && (
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">Last checked: {timeAgo(domain.last_dns_check)}</p>
                          )}
                          {/* SSL Status - shown for verified/active domains */}
                          {(domain.status === 'active' || domain.status === 'dns_verified') && (
                            <div className="flex items-center gap-1.5 mt-1">
                              {domain.status === 'active' ? (
                                <>
                                  <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                  </svg>
                                  <span className="text-xs text-emerald-600 dark:text-emerald-400">SSL Active</span>
                                </>
                              ) : (
                                <>
                                  <svg className="h-3.5 w-3.5 text-yellow-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                  </svg>
                                  <span className="text-xs text-yellow-600 dark:text-yellow-400">SSL Pending</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.color}`}>
                          {badge.label}
                        </span>
                        <button
                          onClick={() => handleVerifyDomain(domain.id)}
                          disabled={verifyingId === domain.id}
                          className="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                          {verifyingId === domain.id ? 'Checking...' : domain.last_dns_check ? 'Re-verify' : 'Verify'}
                        </button>
                        <button
                          onClick={() => handleDeleteDomain(domain.id)}
                          className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {/* Inline Error Banner for failed/error/dns_changed domains */}
                    {(domain.status === 'dns_failed' || domain.status === 'error' || domain.status === 'dns_changed') && (
                      <div className="mx-3 mb-3 flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 dark:bg-red-950/30">
                        <div className="flex items-center gap-2">
                          <svg className="h-4 w-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                          <p className="text-xs text-red-700 dark:text-red-300">
                            {domain.status === 'dns_changed'
                              ? 'DNS records have changed. Please verify your A record still points to 45.137.194.102.'
                              : domain.error_message || 'DNS verification failed. Check your DNS configuration.'}
                          </p>
                        </div>
                        <button
                          onClick={() => handleVerifyDomain(domain.id)}
                          disabled={verifyingId === domain.id}
                          className="shrink-0 rounded-md bg-red-100 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800"
                        >
                          {verifyingId === domain.id ? 'Retrying...' : 'Retry'}
                        </button>
                      </div>
                    )}

                    {/* DNS Instructions (expanded) */}
                    {isExpanded && (
                      <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
                        <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800">
                          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">DNS Instructions</h4>

                          {/* A Record */}
                          <div className="mb-3 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">A Record</p>
                                <p className="mt-1 font-mono text-sm text-zinc-900 dark:text-zinc-50">{domain.domain}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {domain.dns_a_verified && (
                                  <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                                <span className="font-mono text-sm text-zinc-600 dark:text-zinc-300">45.137.194.102</span>
                                <CopyButton text="45.137.194.102" />
                              </div>
                            </div>
                          </div>

                          {/* TXT Record */}
                          <div className="mb-3 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">TXT Record</p>
                                <p className="mt-1 font-mono text-sm text-zinc-900 dark:text-zinc-50">_livinity-verification.{domain.domain}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {domain.dns_txt_verified && (
                                  <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 flex items-center">
                              <code className="flex-1 break-all rounded bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                liv_verify={domain.verification_token}
                              </code>
                              <CopyButton text={`liv_verify=${domain.verification_token}`} />
                            </div>
                          </div>

                          <p className="text-xs text-zinc-400 dark:text-zinc-500">
                            DNS changes can take up to 48 hours to propagate. We check automatically.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-zinc-500 mb-1">No custom domains yet.</p>
              <p className="text-xs text-zinc-400">Add a domain above to get started with custom domain routing.</p>
            </div>
          )}
        </div>

        {/* Devices */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">My Devices</h2>
            <a href="/device" className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
              + Add Device
            </a>
          </div>
          {data.devices && data.devices.length > 0 ? (
            <div className="space-y-3">
              {data.devices.map((device) => (
                <div key={device.deviceId} className="flex items-center justify-between rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">
                      {device.platform === 'win32' ? '🖥️' : device.platform === 'darwin' ? '💻' : '🐧'}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{device.deviceName}</p>
                      <p className="text-xs text-zinc-400">
                        {device.platform === 'win32' ? 'Windows' : device.platform === 'darwin' ? 'macOS' : 'Linux'}
                        {device.lastSeen ? ` · Last seen ${new Date(device.lastSeen).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                    <span className="text-xs text-zinc-400">Registered</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-zinc-500 mb-2">No devices connected yet.</p>
              <p className="text-xs text-zinc-400">
                Download the <a href="/download" className="text-blue-600 hover:underline">Livinity Agent</a> and install it on your PC to get started.
              </p>
            </div>
          )}
        </div>

        {/* Apps */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">Installed Apps</h2>
          {data.server.online ? (
            <p className="text-sm text-zinc-500">App list will be available in a future update.</p>
          ) : (
            <p className="text-sm text-zinc-400">Connect your server to see installed apps.</p>
          )}
        </div>
      </main>
    </div>
  );
}
