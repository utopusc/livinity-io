'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

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

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (res.status === 401) { router.push('/login'); return; }
      const d = await res.json();
      setData(d);
    } catch { router.push('/login'); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Poll connection status every 10s
  useEffect(() => {
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

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
