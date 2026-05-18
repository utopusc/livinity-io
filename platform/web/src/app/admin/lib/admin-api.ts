// Thin client-side fetch helpers. Reads the api-key from sessionStorage
// (set by AdminGate) and forwards as X-Api-Key — same auth path the rest
// of the platform uses.

const TOKEN_KEY = 'livinity_admin_token';

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { 'X-Api-Key': getToken(), ...extra };
}

export type AdminApp = {
  id: string; // uuid
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  section: 'app' | 'webapp' | 'native' | 'ai' | 'plugin';
  version: string;
  docker_compose: string;
  manifest: unknown;
  icon_url: string;
  featured: boolean;
  verified: boolean;
  created_at: string;
  updated_at: string;
};

export async function listApps(): Promise<AdminApp[]> {
  const res = await fetch('/api/admin/apps', { headers: authHeaders() });
  if (!res.ok) throw new Error(`listApps ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getApp(slug: string): Promise<AdminApp> {
  const res = await fetch(`/api/admin/apps/${encodeURIComponent(slug)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`getApp ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function createApp(body: Partial<AdminApp>): Promise<AdminApp> {
  const res = await fetch('/api/admin/apps', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `createApp ${res.status}`);
  }
  return res.json();
}

export async function updateApp(
  slug: string,
  body: Partial<AdminApp>,
): Promise<AdminApp> {
  const res = await fetch(`/api/admin/apps/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `updateApp ${res.status}`);
  }
  return res.json();
}

export async function deleteApp(slug: string): Promise<void> {
  const res = await fetch(`/api/admin/apps/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `deleteApp ${res.status}`);
  }
}

export async function uploadIcon(slug: string, file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('slug', slug);
  const res = await fetch('/api/admin/icon-upload', {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `uploadIcon ${res.status}`);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

// Per-section manifest templates — give the operator a starting point
// matching SPEC.md §2 rather than an empty {}.
export const MANIFEST_TEMPLATES: Record<AdminApp['section'], string> = {
  app: JSON.stringify(
    {
      port: 0,
      subdomain: '',
      env: [
        {
          name: 'EXAMPLE_USER',
          label: 'Admin Username',
          type: 'string',
          default: 'admin',
          required: true,
        },
      ],
    },
    null,
    2,
  ),
  webapp: JSON.stringify({ url: 'https://example.com', defaultTitle: '' }, null, 2),
  native: JSON.stringify(
    {
      install: { primary: 'apt', aptPackages: ['<pkg>'] },
      launch: {
        binaryPath: '/usr/bin/<binary>',
        args: [],
        wmClassHint: '<WMClass>',
      },
      desktopEntry: {
        name: '<App Name>',
        comment: '',
        icon: '',
        categories: ['Development'],
      },
      windowing: { vncMode: 'x11vnc', geometry: { w: 1280, h: 800 } },
    },
    null,
    2,
  ),
  ai: JSON.stringify(
    {
      kind: 'mcp',
      mcp: {
        name: '<name>',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-<name>'],
        envSchema: [],
      },
    },
    null,
    2,
  ),
  plugin: JSON.stringify(
    {
      kind: 'plugin',
      bundleUrl:
        'https://github.com/utopusc/livinity-apps/releases/download/<slug>-1.0.0/<slug>.livpkg.tgz',
      bundleSha256: '0'.repeat(64),
      signingTier: 'operator',
      minLivosVersion: '37.0.0',
      summary: {
        exposesRoutes: [],
        exposesWidgets: [],
        declaresCommands: [],
        declaresMcps: [],
      },
    },
    null,
    2,
  ),
};

export const CATEGORY_OPTIONS = [
  'automation',
  'ai',
  'media',
  'cloud-storage',
  'management',
  'monitoring',
  'development',
  'developer-tools',
  'photography',
  'security',
  'dashboards',
  'privacy',
  'communication',
  'productivity',
  'networking',
  'notes',
];
