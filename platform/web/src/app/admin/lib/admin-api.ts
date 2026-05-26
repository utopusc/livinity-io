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

// ---------------------------------------------------------------------------
// Phase 213: wrappers for the P212 admin metrics/users/tunnels/bandwidth/
// install-failures/apps-summary routes. All gated server-side by
// requireAdmin() which accepts either session cookie or x-api-key
// (via the Phase 213 T1 bridge).
// ---------------------------------------------------------------------------

export type MetricsSummary = {
  users_total: number;
  users_active_24h: number;
  tunnels_online: number;
  installs_total: number;
  installs_failed_24h: number;
  bandwidth_total_bytes: number;
  apps_total: number;
};

export type AdminUserRow = {
  id: string;
  username: string;
  email: string | null;
  is_admin: boolean;
  email_verified: boolean;
  created_at: string;
  last_seen_at: string | null;
};

export type UsersListResult = {
  users: AdminUserRow[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminTunnelRow = {
  id: string;
  user_id: string;
  username: string | null;
  session_id: string;
  status: string;
  connected_at: string;
  disconnected_at: string | null;
  client_version: string | null;
  client_ip: string | null;
};

export type TunnelsListResult = {
  tunnels: AdminTunnelRow[];
  limit: number;
};

export type AppsSummary = {
  apps_total: number;
  installs_per_app: { app_id: string; slug: string; name: string; install_count: number }[];
};

export type BandwidthUserRow = {
  user_id: string;
  username: string | null;
  bytes_in: number;
  bytes_out: number;
};

export type BandwidthResult = {
  period: string;
  users: BandwidthUserRow[];
  total_bytes_in: number;
  total_bytes_out: number;
};

export type InstallFailureRow = {
  id: string;
  user_id: string | null;
  username: string | null;
  app_id: string | null;
  app_slug: string | null;
  action: string;
  instance_name: string | null;
  created_at: string;
};

export type InstallFailuresResult = {
  failures: InstallFailureRow[];
  limit: number;
};

async function adminGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders(), credentials: 'same-origin' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${url} ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export function getMetricsSummary(): Promise<MetricsSummary> {
  return adminGet<MetricsSummary>('/api/admin/metrics/summary');
}

export function listAdminUsers(opts: { limit?: number; offset?: number } = {}): Promise<UsersListResult> {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));
  const qs = params.toString();
  return adminGet<UsersListResult>(`/api/admin/users${qs ? `?${qs}` : ''}`);
}

export function listTunnels(opts: { status?: 'connected' | 'disconnected'; limit?: number } = {}): Promise<TunnelsListResult> {
  const params = new URLSearchParams();
  if (opts.status) params.set('status', opts.status);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return adminGet<TunnelsListResult>(`/api/admin/tunnels${qs ? `?${qs}` : ''}`);
}

export function getAdminAppsSummary(): Promise<AppsSummary> {
  return adminGet<AppsSummary>('/api/admin/apps/summary');
}

export function getBandwidth(opts: { period?: string } = {}): Promise<BandwidthResult> {
  const params = new URLSearchParams();
  if (opts.period) params.set('period', opts.period);
  const qs = params.toString();
  return adminGet<BandwidthResult>(`/api/admin/bandwidth${qs ? `?${qs}` : ''}`);
}

export type SyncCatalogResult = {
  repo: string;
  ref: string;
  total_in_repo: number;
  processed: number;
  offset: number;
  limit: number;
  next_offset: number | null;
  created: number;
  updated: number;
  skipped: number;
  errors: { entry: string; error: string }[];
};

export async function syncCatalog(opts: { limit?: number; offset?: number } = {}): Promise<SyncCatalogResult> {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));
  const qs = params.toString();
  const res = await fetch(`/api/admin/sync-catalog${qs ? `?${qs}` : ''}`, {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`syncCatalog ${res.status}: ${await res.text()}`);
  return res.json() as Promise<SyncCatalogResult>;
}

// CARRY-P213-USERS-DRILLDOWN — full per-user detail.
export type AdminUserDetail = {
  user: AdminUserRow & {
    cf_tunnel_id: string | null;
    cf_provisioned_at: string | null;
  };
  install_history: {
    id: string;
    app_id: string | null;
    app_slug: string | null;
    app_name: string | null;
    action: string;
    instance_name: string | null;
    created_at: string;
  }[];
  install_commands: {
    id: string;
    app_id: string;
    app_slug: string | null;
    app_name: string | null;
    instance_name: string | null;
    status: string;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    result_json: unknown;
  }[];
  bandwidth: {
    period_month: string;
    bytes_in: number;
    bytes_out: number;
    updated_at: string;
  }[];
  tunnel_sessions: {
    id: string;
    session_id: string;
    status: string;
    connected_at: string;
    disconnected_at: string | null;
    client_version: string | null;
    client_ip: string | null;
  }[];
  subdomains: {
    id: string;
    app_slug: string;
    subdomain: string;
    cf_dns_record_id: string | null;
    port: number | null;
    created_at: string;
  }[];
};

export function getAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  return adminGet<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(userId)}`);
}

export function listInstallFailures(opts: { limit?: number } = {}): Promise<InstallFailuresResult> {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return adminGet<InstallFailuresResult>(`/api/admin/install-failures${qs ? `?${qs}` : ''}`);
}
