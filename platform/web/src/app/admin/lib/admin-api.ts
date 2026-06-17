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
  // Existing 7 — unchanged (contract A keeps these).
  users_total: number;
  users_active_24h: number;
  tunnels_online: number;
  installs_total: number;
  installs_failed_24h: number;
  bandwidth_total_bytes: number;
  apps_total: number;
  // Phase AV2 superset additions (contract A).
  signups_today: number;
  signups_7d: number;
  signups_30d: number;
  subs_trialing: number;
  subs_active: number;
  subs_past_due: number;
  subs_canceled: number;
  subs_cancelling: number;
  legacy_free_count: number;
  revoked_count: number;
  trials_ending_3d: number;
  mrr_usd: number;
  arr_usd: number;
  provisioned_total: number;
  bandwidth_this_month_bytes: number;
  installs_24h: number;
  installs_7d: number;
};

// ---- Contract B: GET /api/admin/metrics/timeseries -------------------------
export type TimeseriesResult = {
  signups_daily: { date: string; count: number }[];
  cumulative_users: { date: string; total: number }[];
  installs_daily: { date: string; count: number }[];
  bandwidth_monthly: { period: string; bytes: number }[];
};

// ---- Contract C: GET /api/admin/billing/summary ----------------------------
export type BillingSummary = {
  counts: {
    trialing: number;
    active: number;
    past_due: number;
    canceled: number;
    inactive: number;
    legacy_free: number;
    revoked: number;
    cancelling: number;
  };
  mrr_usd: number;
  arr_usd: number;
  paying: number;
  trialing: number;
  conversion_rate: number | null;
  trials_ending: {
    user_id: string;
    username: string;
    email: string | null;
    current_period_end: string;
    days_left: number;
  }[];
  recently_canceled: {
    user_id: string;
    username: string;
    email: string | null;
    current_period_end: string | null;
    access_revoked_at: string | null;
  }[];
};

// ---- Contract D: GET /api/admin/billing/subscribers ------------------------
export type Subscriber = {
  user_id: string;
  username: string;
  email: string | null;
  subscription_status: string | null;
  plan_label: string;
  legacy_free: boolean;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  past_due_since: string | null;
  access_revoked_at: string | null;
  mrr_usd: number;
  created_at: string;
  has_tunnel: boolean;
};

export type SubscribersResult = {
  subscribers: Subscriber[];
  limit: number;
};

// ---- Contract E: GET /api/admin/activity/recent ----------------------------
export type ActivityEvent = {
  type: 'signup' | 'install' | 'uninstall' | 'tunnel';
  title: string;
  sublabel: string;
  at: string;
};

export type ActivityResult = {
  events: ActivityEvent[];
  limit: number;
};

export type AdminUserRow = {
  id: string;
  username: string;
  email: string | null;
  is_admin: boolean;
  email_verified: boolean;
  created_at: string;
  last_seen_at: string | null;
  // AUM additions (list view surfaces billing state inline)
  subscription_status: string | null;
  legacy_free: boolean;
  suspended: boolean;
  plan_label: string;
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

// ---- Phase AV2 client fns (contracts B-E) ----------------------------------

export function getMetricsTimeseries(): Promise<TimeseriesResult> {
  return adminGet<TimeseriesResult>('/api/admin/metrics/timeseries');
}

export function getBillingSummary(): Promise<BillingSummary> {
  return adminGet<BillingSummary>('/api/admin/billing/summary');
}

export function listSubscribers(opts: { limit?: number } = {}): Promise<SubscribersResult> {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return adminGet<SubscribersResult>(`/api/admin/billing/subscribers${qs ? `?${qs}` : ''}`);
}

export function getRecentActivity(opts: { limit?: number } = {}): Promise<ActivityResult> {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return adminGet<ActivityResult>(`/api/admin/activity/recent${qs ? `?${qs}` : ''}`);
}

export function listAdminUsers(
  opts: { limit?: number; offset?: number; q?: string } = {},
): Promise<UsersListResult> {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));
  if (opts.q != null && opts.q !== '') params.set('q', opts.q);
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

// ---------------------------------------------------------------------------
// Phase 280/283: per-tenant abuse/risk signals (the "Abuse" panel). Backed by
// the daily abuse-scan cron (egress + reputation) + live signals. DEFENSIVE:
// when abuse_signals isn't migrated yet, signalsAvailable=false and the
// cron-computed fields come back null.
// ---------------------------------------------------------------------------
export type AbuseSignalRow = {
  user_id: string;
  username: string;
  suspended: boolean;
  revoked: boolean;
  subdomain_count: number;
  egress_24h_bytes: number | null;
  egress_flagged: boolean;
  reputation: 'clean' | 'flagged' | 'unknown';
  reputation_detail: string | null;
  scanned_at: string | null;
  level: 'ok' | 'watch' | 'high';
};

export type AbuseSignalsResult = {
  signals: AbuseSignalRow[];
  signalsAvailable: boolean;
};

export function getAbuseSignals(): Promise<AbuseSignalsResult> {
  return adminGet<AbuseSignalsResult>('/api/admin/abuse-signals');
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

// ---------------------------------------------------------------------------
// AUM: admin-action audit log row + result shapes
// ---------------------------------------------------------------------------
export type AdminActionRow = {
  id: string;
  admin_user_id: string | null;
  admin_username: string | null;
  target_user_id: string | null;
  target_username: string | null;
  action: string;
  detail: unknown;
  created_at: string;
};

export type AuditResult = {
  actions: AdminActionRow[];
  limit: number;
};

// Union of every action the POST /api/admin/users/[id]/actions endpoint accepts.
export type AdminActionName =
  | 'grant_comp'
  | 'remove_comp'
  // CMP: time-boxed comp grant (users.comp_until) — grant_access extends an
  // existing window by { months?, days? }; clear_grant zeroes comp_until.
  | 'grant_access'
  | 'clear_grant'
  | 'revoke'
  | 'restore'
  | 'cancel_subscription'
  | 'resume_subscription'
  | 'make_admin'
  | 'remove_admin'
  | 'verify_email'
  | 'suspend'
  | 'unsuspend'
  | 'set_note'
  | 'delete_user';

// CARRY-P213-USERS-DRILLDOWN — full per-user detail.
export type AdminUserDetail = {
  user: AdminUserRow & {
    cf_tunnel_id: string | null;
    cf_provisioned_at: string | null;
    // AUM: billing + moderation columns surfaced for the actions panel.
    subscription_status: string | null;
    legacy_free: boolean;
    has_used_trial: boolean;
    cancel_at_period_end: boolean;
    current_period_end: string | null;
    past_due_since: string | null;
    access_revoked_at: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    suspended_at: string | null;
    admin_note: string | null;
    // CMP: time-boxed admin grant end. DEFENSIVE-SCHEMA — the column may not
    // yet exist server-side (the detail route catches 42703 and returns null),
    // so consumers MUST treat null as "no active grant".
    comp_until: string | null;
  };
  admin_actions: AdminActionRow[];
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

// ---------------------------------------------------------------------------
// AUM: per-user moderation/billing actions + global audit log
// ---------------------------------------------------------------------------

export type UserActionResult = { ok?: boolean; error?: string; [k: string]: unknown };

// POST /api/admin/users/{id}/actions  body { action, ...params }.
// Throws on non-2xx with the server-provided error text.
export async function userAction(
  userId: string,
  action: AdminActionName,
  params: Record<string, unknown> = {},
): Promise<UserActionResult> {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/actions`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'same-origin',
    body: JSON.stringify({ action, ...params }),
  });
  let data: UserActionResult;
  try {
    data = (await res.json()) as UserActionResult;
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(data.error || `userAction ${action} ${res.status}`);
  }
  return data;
}

// GET /api/admin/audit?limit=&userId=
export function getAuditLog(opts: { limit?: number; userId?: string } = {}): Promise<AuditResult> {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.userId != null && opts.userId !== '') params.set('userId', opts.userId);
  const qs = params.toString();
  return adminGet<AuditResult>(`/api/admin/audit${qs ? `?${qs}` : ''}`);
}

export function listInstallFailures(opts: { limit?: number } = {}): Promise<InstallFailuresResult> {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return adminGet<InstallFailuresResult>(`/api/admin/install-failures${qs ? `?${qs}` : ''}`);
}

// ---------------------------------------------------------------------------
// FB-Central: user-reported feedback (bugs / requests / questions).
// Backed by the Supabase `feedback` table — both routes are DEFENSIVE: if the
// table is missing the list returns { items: [], counts: {} } (never a 500).
// ---------------------------------------------------------------------------
export type FeedbackItem = {
  id: string;
  user_id: string | null;
  username: string | null;
  type: string;
  severity: string | null;
  area: string | null;
  title: string | null;
  message: string;
  steps: string | null;
  contact: string | null;
  app_version: string | null;
  user_agent: string | null;
  page_url: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

export type FeedbackListResult = {
  items: FeedbackItem[];
  limit: number;
  counts?: Record<string, number>;
};

export function getFeedback(
  opts: { status?: string; limit?: number } = {},
): Promise<FeedbackListResult> {
  const params = new URLSearchParams();
  if (opts.status != null && opts.status !== '') params.set('status', opts.status);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return adminGet<FeedbackListResult>(`/api/admin/feedback${qs ? `?${qs}` : ''}`);
}

export async function updateFeedback(
  id: string,
  body: { status?: string; admin_note?: string },
): Promise<FeedbackItem> {
  const res = await fetch(`/api/admin/feedback/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `updateFeedback ${res.status}`);
  }
  return res.json() as Promise<FeedbackItem>;
}
