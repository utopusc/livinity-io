/**
 * Cloudflare SaaS Multi-Tenant Provisioning Client
 *
 * Phase 140 — single chokepoint for all CF API calls in the auto-provisioning
 * flow. Pure library: no HTTP routes, no DB. Other plans (140-04, 140-05,
 * 140-09) import from here.
 *
 * Architecture:
 *   - One CF Tunnel per LivOS user (named `livos-{username}`)
 *   - Ingress array on the tunnel routes `{username}.livinity.io` + every
 *     `{app}-{username}.livinity.io` subdomain to the user's Mini PC
 *   - DNS CNAMEs in the livinity.io zone point each subdomain at the tunnel
 *
 * All calls flow through a shared Bottleneck rate limiter (5 req/sec sustained,
 * burst 10) — well below CF's 1200 req/5min/token cap.
 *
 * Retry policy: 3 retries on 5xx + 429 + ECONNRESET + ETIMEDOUT with
 * exponential backoff (200ms / 800ms / 3200ms ±25% jitter). 5s per-call
 * timeout. NO retry on other 4xx (401/403/404 surface immediately as
 * config/programming errors).
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */

import Bottleneck from 'bottleneck';

// ---------------------------------------------------------------------------
// Types (public)
// ---------------------------------------------------------------------------

export interface Ingress {
  hostname?: string;
  service: string;
  originRequest?: Record<string, unknown>;
  path?: string;
}

export interface Tunnel {
  id: string;
  name: string;
  created_at?: string;
  deleted_at?: string | null;
  status?: string;
}

export interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied?: boolean;
  zone_id?: string;
  /** ISO-8601 creation time (CF returns this on list). Used by the DNS
   *  reconciler's grace window so an in-flight provision is never deleted. */
  created_on?: string;
}

export interface CfClient {
  // Tunnel lifecycle
  createTunnel(name: string): Promise<{ tunnel_id: string; secret: string }>;
  getTunnelToken(tunnel_id: string): Promise<string>;
  pushTunnelIngress(tunnel_id: string, ingress: Ingress[]): Promise<void>;
  getTunnelIngress(tunnel_id: string): Promise<Ingress[]>;
  deleteTunnel(tunnel_id: string): Promise<void>;
  listTunnels(): Promise<Tunnel[]>;
  /**
   * Phase 141-07: return the count of currently-active CF edge connections
   * for a tunnel. Used by the dashboard online-status check to replace the
   * relay-WebSocket signal (which Phase 134+ livinityd no longer opens).
   * Returns 0 on CF API error so a transient failure shows the device as
   * offline rather than crashing the dashboard.
   */
  getTunnelConnections(tunnel_id: string): Promise<{ count: number }>;

  // DNS lifecycle
  createDnsRecord(opts: {
    type: 'CNAME';
    name: string;
    content: string;
    proxied: boolean;
  }): Promise<{ dns_record_id: string }>;
  deleteDnsRecord(dns_record_id: string): Promise<void>;
  listDnsRecordsByName(name: string): Promise<DnsRecord[]>;
  /**
   * Enumerate EVERY DNS record in the livinity.io zone, paginating internally.
   * Used by the QUOTA-03/04 reconciler (api/cron/reconcile-dns) to find orphaned
   * per-user CNAMEs and to gauge how close the shared zone is to its record cap.
   * Pages at 100/req through the shared rate limiter; stops at MAX_DNS_PAGES as a
   * runaway guard. `truncated` is true when that cap was hit — the caller MUST
   * treat a truncated enumeration as "near full" (the count is a floor, not the
   * true total), otherwise the capacity alarm could read healthy off a clamp.
   */
  listAllDnsRecords(): Promise<{ records: DnsRecord[]; truncated: boolean }>;
}

// ---------------------------------------------------------------------------
// Structured error
// ---------------------------------------------------------------------------

export class CfApiError extends Error {
  public readonly code: number;
  public readonly cfErrorCode: number;
  public readonly cfMessage: string;
  public readonly endpoint: string;

  constructor(opts: {
    message: string;
    code: number;
    cfErrorCode: number;
    cfMessage: string;
    endpoint: string;
  }) {
    super(opts.message);
    this.name = 'CfApiError';
    this.code = opts.code;
    this.cfErrorCode = opts.cfErrorCode;
    this.cfMessage = opts.cfMessage;
    this.endpoint = opts.endpoint;
  }
}

// ---------------------------------------------------------------------------
// Env / config
// ---------------------------------------------------------------------------

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

interface CfEnv {
  token: string;
  accountId: string;
  zoneId: string;
}

function readEnv(): CfEnv {
  const token = process.env.CF_API_TOKEN;
  const accountId = process.env.CF_ACCOUNT_ID;
  const zoneId = process.env.CF_ZONE_ID_LIVINITY_IO;

  if (!token || !accountId || !zoneId) {
    const missing = [
      !token && 'CF_API_TOKEN',
      !accountId && 'CF_ACCOUNT_ID',
      !zoneId && 'CF_ZONE_ID_LIVINITY_IO',
    ]
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `cf-saas: missing required environment variable(s): ${missing}. ` +
        `Set these in platform/web ecosystem.config.cjs.`,
    );
  }

  return { token, accountId, zoneId };
}

// ---------------------------------------------------------------------------
// Rate limiter (shared singleton)
// ---------------------------------------------------------------------------

// Sustained 5 req/sec, burst 10. Reservoir refills 5 every 1000ms.
// Well below CF's 1200 req/5min/token cap (= 4 req/sec sustained).
const limiter = new Bottleneck({
  reservoir: 10,
  reservoirRefreshAmount: 5,
  reservoirRefreshInterval: 1000,
  maxConcurrent: 5,
  minTime: 0,
});

// ---------------------------------------------------------------------------
// HTTP helper (retry + timeout + structured errors)
// ---------------------------------------------------------------------------

const PER_CALL_TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = [200, 800, 3200] as const;

// Whole-zone enumeration (listAllDnsRecords). CF caps per_page at 100 for
// dns_records; MAX_DNS_PAGES is a runaway guard (100 pages = 10k records, far
// above the shared zone's record cap).
const DNS_PER_PAGE = 100;
const MAX_DNS_PAGES = 100;

function jitter(ms: number): number {
  // ±25% jitter
  const delta = ms * 0.25;
  return Math.round(ms + (Math.random() * 2 - 1) * delta);
}

function shouldRetry(status: number, errCode?: string): boolean {
  if (errCode === 'ECONNRESET' || errCode === 'ETIMEDOUT' || errCode === 'UND_ERR_CONNECT_TIMEOUT') {
    return true;
  }
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

// QUOTA-02 (v46.0): parse CF's rate-limit headers into a wait (ms), capped, or
// null if absent. `Retry-After` is in seconds; `cf-ratelimit-reset` is a unix
// timestamp. Honoring these rides out the 1200-req/5min cap exactly instead of
// guessing with a fixed backoff.
function retryAfterMs(res: Response): number | null {
  const ra = res.headers.get('retry-after');
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 30_000) + jitter(200);
  }
  const reset = res.headers.get('cf-ratelimit-reset');
  if (reset) {
    const resetUnix = Number(reset);
    if (Number.isFinite(resetUnix)) {
      const deltaMs = resetUnix * 1000 - Date.now();
      if (deltaMs > 0) return Math.min(deltaMs, 30_000) + jitter(200);
    }
  }
  return null;
}

interface CfEnvelope<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: Array<{ code: number; message: string }>;
  result: T;
}

interface CallOpts {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string; // path under CF_API_BASE (must start with `/`)
  body?: unknown;
}

async function callCf<T>(env: CfEnv, opts: CallOpts): Promise<T> {
  const url = `${CF_API_BASE}${opts.path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.token}`,
    'Content-Type': 'application/json',
  };

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PER_CALL_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: opts.method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const durationMs = Date.now() - start;
      console.debug(
        `[cf-saas] ${opts.method} ${opts.path} -> ${res.status} (${durationMs}ms, attempt ${attempt + 1})`,
      );

      // Non-JSON bodies (rare — CF always returns JSON, but be defensive)
      let json: CfEnvelope<T> | null = null;
      const text = await res.text();
      if (text.length > 0) {
        try {
          json = JSON.parse(text) as CfEnvelope<T>;
        } catch {
          json = null;
        }
      }

      if (!res.ok) {
        if (shouldRetry(res.status) && attempt < MAX_RETRIES) {
          // QUOTA-02: honor CF's Retry-After / cf-ratelimit-reset header on a
          // 429 so we wait exactly as long as CF asks; else fixed backoff.
          const wait = retryAfterMs(res) ?? jitter(BACKOFF_BASE_MS[attempt]);
          console.warn(
            `[cf-saas] retry ${attempt + 1}/${MAX_RETRIES} after ${wait}ms — ${opts.method} ${opts.path} status=${res.status}`,
          );
          await sleep(wait);
          continue;
        }

        const cfError = json?.errors?.[0];
        throw new CfApiError({
          message: `CF API ${opts.method} ${opts.path} failed: ${res.status} ${cfError?.message ?? text.slice(0, 200)}`,
          code: res.status,
          cfErrorCode: cfError?.code ?? -1,
          cfMessage: cfError?.message ?? '',
          endpoint: `${opts.method} ${opts.path}`,
        });
      }

      if (!json) {
        // 200 with empty body — caller doesn't expect data
        return undefined as T;
      }

      if (!json.success) {
        const cfError = json.errors?.[0];
        throw new CfApiError({
          message: `CF API ${opts.method} ${opts.path} returned success=false: ${cfError?.message ?? 'unknown'}`,
          code: res.status,
          cfErrorCode: cfError?.code ?? -1,
          cfMessage: cfError?.message ?? '',
          endpoint: `${opts.method} ${opts.path}`,
        });
      }

      return json.result;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;

      if (err instanceof CfApiError) {
        // Non-retryable CF error already thrown above — surface immediately
        throw err;
      }

      const e = err as NodeJS.ErrnoException & { name?: string };
      const errCode = e?.code ?? (e?.name === 'AbortError' ? 'ETIMEDOUT' : undefined);

      if (shouldRetry(0, errCode) && attempt < MAX_RETRIES) {
        const wait = jitter(BACKOFF_BASE_MS[attempt]);
          console.warn(
          `[cf-saas] retry ${attempt + 1}/${MAX_RETRIES} after ${wait}ms — ${opts.method} ${opts.path} err=${errCode ?? e?.message ?? 'unknown'}`,
        );
        await sleep(wait);
        continue;
      }

      console.error(
        `[cf-saas] final failure — ${opts.method} ${opts.path} after ${attempt + 1} attempt(s)`,
        err,
      );
      throw new CfApiError({
        message: `CF API ${opts.method} ${opts.path} failed after ${attempt + 1} attempt(s): ${e?.message ?? String(err)}`,
        code: 0,
        cfErrorCode: -1,
        cfMessage: e?.message ?? String(err),
        endpoint: `${opts.method} ${opts.path}`,
      });
    }
  }

  // Should be unreachable — loop either returns or throws
  throw new CfApiError({
    message: `CF API ${opts.method} ${opts.path} exhausted retries`,
    code: 0,
    cfErrorCode: -1,
    cfMessage: lastError instanceof Error ? lastError.message : String(lastError),
    endpoint: `${opts.method} ${opts.path}`,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Rate-limited wrapper — every CF call MUST go through this
function rl<T>(fn: () => Promise<T>): Promise<T> {
  return limiter.schedule(fn);
}

// ---------------------------------------------------------------------------
// Catch-all helper
// ---------------------------------------------------------------------------

const CATCH_ALL: Ingress = { service: 'http_status:404' };

function ensureCatchAll(ingress: Ingress[]): Ingress[] {
  // CF rejects tunnel config without a catch-all entry at the tail.
  const filtered = ingress.filter((i) => i.service !== 'http_status:404' || i.hostname);
  return [...filtered, CATCH_ALL];
}

// ---------------------------------------------------------------------------
// Lazy client factory
// ---------------------------------------------------------------------------

function makeClient(env: CfEnv): CfClient {
  return {
    async createTunnel(name: string) {
      // CF requires a tunnel_secret (base64-encoded 32+ bytes). Generate one.
      const { randomBytes } = await import('node:crypto');
      const secret = randomBytes(32).toString('base64');
      const result = await rl(() =>
        callCf<{ id: string; name: string }>(env, {
          method: 'POST',
          path: `/accounts/${env.accountId}/cfd_tunnel`,
          body: { name, tunnel_secret: secret, config_src: 'cloudflare' },
        }),
      );
      return { tunnel_id: result.id, secret };
    },

    async getTunnelToken(tunnel_id: string) {
      // CF returns the token as a plain JSON string in `result`
      const token = await rl(() =>
        callCf<string>(env, {
          method: 'GET',
          path: `/accounts/${env.accountId}/cfd_tunnel/${tunnel_id}/token`,
        }),
      );
      return token;
    },

    async pushTunnelIngress(tunnel_id: string, ingress: Ingress[]) {
      const finalIngress = ensureCatchAll(ingress);
      await rl(() =>
        callCf<unknown>(env, {
          method: 'PUT',
          path: `/accounts/${env.accountId}/cfd_tunnel/${tunnel_id}/configurations`,
          body: { config: { ingress: finalIngress } },
        }),
      );
    },

    async getTunnelIngress(tunnel_id: string) {
      const result = await rl(() =>
        callCf<{ config?: { ingress?: Ingress[] } }>(env, {
          method: 'GET',
          path: `/accounts/${env.accountId}/cfd_tunnel/${tunnel_id}/configurations`,
        }),
      );
      return result.config?.ingress ?? [];
    },

    async deleteTunnel(tunnel_id: string) {
      await rl(() =>
        callCf<unknown>(env, {
          method: 'DELETE',
          path: `/accounts/${env.accountId}/cfd_tunnel/${tunnel_id}`,
        }),
      );
    },

    async listTunnels() {
      const result = await rl(() =>
        callCf<Tunnel[]>(env, {
          method: 'GET',
          path: `/accounts/${env.accountId}/cfd_tunnel?is_deleted=false`,
        }),
      );
      return result ?? [];
    },

    async getTunnelConnections(tunnel_id: string) {
      try {
        // CF returns an array of connection objects when the tunnel has live
        // connectors. Endpoint: /accounts/{acct}/cfd_tunnel/{id}/connections
        // The array length is the active-connection count (typically 4 for a
        // healthy cloudflared with both IPv4+v6 fan-out across 2 colos).
        const result = await rl(() =>
          callCf<Array<{ id: string }> | null>(env, {
            method: 'GET',
            path: `/accounts/${env.accountId}/cfd_tunnel/${tunnel_id}/connections`,
          }),
        );
        return { count: Array.isArray(result) ? result.length : 0 };
      } catch {
        // Best-effort: a CF API hiccup must not crash the dashboard call site.
        return { count: 0 };
      }
    },

    async createDnsRecord(opts) {
      const result = await rl(() =>
        callCf<{ id: string }>(env, {
          method: 'POST',
          path: `/zones/${env.zoneId}/dns_records`,
          body: {
            type: opts.type,
            name: opts.name,
            content: opts.content,
            proxied: opts.proxied,
            ttl: 1, // 1 = automatic; required when proxied=true
          },
        }),
      );
      return { dns_record_id: result.id };
    },

    async deleteDnsRecord(dns_record_id: string) {
      await rl(() =>
        callCf<unknown>(env, {
          method: 'DELETE',
          path: `/zones/${env.zoneId}/dns_records/${dns_record_id}`,
        }),
      );
    },

    async listDnsRecordsByName(name: string) {
      const result = await rl(() =>
        callCf<DnsRecord[]>(env, {
          method: 'GET',
          path: `/zones/${env.zoneId}/dns_records?name=${encodeURIComponent(name)}`,
        }),
      );
      return result ?? [];
    },

    async listAllDnsRecords() {
      const all: DnsRecord[] = [];
      let truncated = false;
      // Paginate until a page comes back shorter than a full page (the last
      // page), or we hit the runaway cap. The short-page heuristic is robust to
      // concurrent record churn — it always terminates.
      for (let page = 1; page <= MAX_DNS_PAGES; page++) {
        const batch = await rl(() =>
          callCf<DnsRecord[]>(env, {
            method: 'GET',
            path: `/zones/${env.zoneId}/dns_records?page=${page}&per_page=${DNS_PER_PAGE}`,
          }),
        );
        if (!batch || batch.length === 0) break;
        all.push(...batch);
        if (batch.length < DNS_PER_PAGE) break;
        if (page === MAX_DNS_PAGES) {
          // A full final page means there may be more — the count is now a
          // FLOOR, not the true total. Signal it so the capacity alarm fires.
          truncated = true;
          console.warn(
            `[cf-saas] listAllDnsRecords hit MAX_DNS_PAGES=${MAX_DNS_PAGES} (${all.length}+ records) — enumeration TRUNCATED; capacity count is a floor`,
          );
        }
      }
      return { records: all, truncated };
    },
  };
}

// Lazy singleton — env is only read on first access so import-time evaluation
// in tooling / type-checking doesn't crash for callers that don't actually
// touch CF (e.g. unit-test files importing types).
let _client: CfClient | null = null;
export const cfClient: CfClient = new Proxy({} as CfClient, {
  get(_target, prop) {
    if (!_client) _client = makeClient(readEnv());
    return (_client as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// ---------------------------------------------------------------------------
// High-level orchestrators
// ---------------------------------------------------------------------------

/**
 * Provision a fresh user: tunnel + apex DNS record.
 *
 * Returns the tunnel_id, the connector token (caller must encrypt at rest),
 * and the apex DNS record ID (caller must store for deprovision).
 *
 * Idempotency / collision-safety (Phase 274): this function now TOLERATES a
 * pre-existing tunnel or apex DNS record for the username. A CF tunnel is named
 * `livos-{username}` and the apex CNAME is `{username}.livinity.io`; if a stale
 * one survives (e.g. a best-effort deprovision that failed on a prior delete),
 * a naive create would 409/duplicate and roll the whole provision back (the
 * livinitydemo `had_tunnel:false` → install 410 NO_TUNNEL class). We instead
 * REUSE an existing same-named tunnel and REPLACE any stale apex DNS records so
 * provisioning succeeds. (Going forward reserved_usernames also makes username
 * reuse impossible, but this hardens the path for any already-orphaned CF state.)
 *
 * NOTE: legacy orphan tunnels for already-DELETED usernames (livinitydemo,
 * livinityio, haribo*, jack, …) are NOT cleaned up here — that is an operator
 * one-off: list `livos-*` tunnels with no matching live user and delete them.
 *
 * Failure mode: if any step fails after a partial create, caller MUST call
 * deprovisionUser with whatever IDs got created. This function does NOT
 * auto-rollback on its own failure — callers wrap in DB transactions and
 * decide rollback policy themselves.
 */
export async function provisionUserHostnames(username: string): Promise<{
  tunnel_id: string;
  tunnel_token: string;
  apex_dns_record_id: string;
}> {
  const env = readEnv();
  const tunnelName = `livos-${username}`;
  const apexName = `${username}.livinity.io`;

  // Step 1: reuse an existing same-named tunnel if one survives, else create.
  let tunnel_id: string;
  const existingTunnels = await cfClient.listTunnels().catch(() => [] as Awaited<ReturnType<typeof cfClient.listTunnels>>);
  const match = existingTunnels.find((t) => t.name === tunnelName);
  if (match) {
    tunnel_id = match.id;
    console.warn(`[cf-saas] reusing pre-existing tunnel ${tunnelName}=${tunnel_id} (collision-safe provision)`);
  } else {
    ({ tunnel_id } = await cfClient.createTunnel(tunnelName));
  }

  // Step 2: fetch connector token (deterministic for a reused tunnel)
  const tunnel_token = await cfClient.getTunnelToken(tunnel_id);

  // Step 3: set initial ingress (apex only + catch-all)
  await cfClient.pushTunnelIngress(tunnel_id, [
    { hostname: apexName, service: 'http://localhost:80' },
  ]);

  // Step 4: replace any stale apex DNS records, then create a fresh CNAME that
  // points at the (possibly reused) tunnel.
  const staleApex = await cfClient.listDnsRecordsByName(apexName).catch(() => [] as Awaited<ReturnType<typeof cfClient.listDnsRecordsByName>>);
  for (const rec of staleApex) {
    await cfClient
      .deleteDnsRecord(rec.id)
      .catch((e) => console.warn(`[cf-saas] stale apex DNS cleanup failed for ${apexName}: ${e}`));
  }
  const { dns_record_id: apex_dns_record_id } = await cfClient.createDnsRecord({
    type: 'CNAME',
    name: username,
    content: `${tunnel_id}.cfargotunnel.com`,
    proxied: true,
  });

  console.info(
    `[cf-saas] provisioned user ${username}: tunnel=${tunnel_id} dns=${apex_dns_record_id} zone=${env.zoneId}`,
  );

  return { tunnel_id, tunnel_token, apex_dns_record_id };
}

/**
 * Provision a per-app subdomain on an existing user tunnel.
 *
 * Fetches current ingress, appends the new entry, replaces the full array.
 * Then creates a DNS CNAME for the new hostname.
 *
 * `port` is accepted for documentation but ingress always points at
 * `http://localhost:80` — the Mini PC's Caddy emitter handles per-app port
 * routing by Host-header match (see livinityd Caddyfile generator).
 *
 * URL pattern (locked Phase 140): `{app_slug}-{username}.livinity.io`
 */
// CARRY-P210-BUG-D — defense-in-depth slug + username validation.
// Callers above (api/me/app-subdomain/route.ts) also validate, but new
// callers can land later and skip the wrapper — guarding here means single-
// char slugs / malformed inputs cannot reach the CF API.
const CF_SUBDOMAIN_PART_RE = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;
// L-066 (Phase 263-04): the username half must NOT contain a hyphen, otherwise
// `${app_slug}-${username}` is ambiguous (user `jean-luc`+app `radarr` vs user
// `luc`+app slug `radarr-jean` both → `radarr-jean-luc`). App slugs MAY keep a
// hyphen, so this tighter regex is applied to the username ONLY; the app_slug
// check below stays on CF_SUBDOMAIN_PART_RE.
const CF_USERNAME_RE = /^[a-z0-9]{2,32}$/;

// Reliability B1 — the tunnel-ingress update is a read-modify-FULL-REPLACE:
// two concurrent installs for the same tunnel each read the current array,
// each append only their own hostname, and the second push silently erases
// the first app's ingress ("installed but 404s, fixed only by reinstalling").
// Serialize the RMW per tunnel within this instance; a verify-and-repair pass
// after the push covers writers on OTHER serverless instances the in-process
// lock cannot see.
const ingressLocks = new Map<string, Promise<unknown>>();

async function withTunnelIngressLock<T>(tunnelId: string, fn: () => Promise<T>): Promise<T> {
  const prev = ingressLocks.get(tunnelId) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const settled = run.catch(() => {});
  ingressLocks.set(tunnelId, settled);
  void settled.then(() => {
    if (ingressLocks.get(tunnelId) === settled) ingressLocks.delete(tunnelId);
  });
  return run;
}

export async function provisionAppSubdomain(opts: {
  tunnel_id: string;
  username: string;
  app_slug: string;
  port: number;
}): Promise<{ subdomain: string; url: string; dns_record_id: string }> {
  if (!CF_SUBDOMAIN_PART_RE.test(opts.app_slug)) {
    throw new CfApiError({
      message: `Invalid app_slug "${opts.app_slug}": must be 2-32 chars, lowercase alphanumeric or hyphen, no leading/trailing hyphen`,
      code: 400,
      cfErrorCode: 0,
      cfMessage: 'validation rejected app_slug',
      endpoint: 'provisionAppSubdomain',
    });
  }
  if (!CF_USERNAME_RE.test(opts.username)) {
    throw new CfApiError({
      message: `Invalid username "${opts.username}": must be 2-32 lowercase alphanumeric chars, no hyphen (L-066)`,
      code: 400,
      cfErrorCode: 0,
      cfMessage: 'validation rejected username',
      endpoint: 'provisionAppSubdomain',
    });
  }

  const subdomain = `${opts.app_slug}-${opts.username}`;
  const hostname = `${subdomain}.livinity.io`;

  // Step 1: fetch current ingress, append, push — serialized per tunnel with a
  // post-push verify-and-repair (see withTunnelIngressLock above).
  await withTunnelIngressLock(opts.tunnel_id, async () => {
    const pushOnce = async () => {
      const current = await cfClient.getTunnelIngress(opts.tunnel_id);
      const withoutCatchAll = current.filter((i) => !(i.service === 'http_status:404' && !i.hostname));
      // De-dup defensively — if hostname already present, replace its entry
      const dedup = withoutCatchAll.filter((i) => i.hostname !== hostname);
      const next: Ingress[] = [
        ...dedup,
        { hostname, service: 'http://localhost:80' },
      ];
      await cfClient.pushTunnelIngress(opts.tunnel_id, next);
    };
    await pushOnce();
    for (let attempt = 0; attempt < 2; attempt++) {
      const after = await cfClient.getTunnelIngress(opts.tunnel_id);
      if (after.some((i) => i.hostname === hostname)) return;
      console.warn(
        `[cf-saas] ingress lost-update detected for ${hostname} (concurrent full-replace) — repairing (attempt ${attempt + 1})`,
      );
      await pushOnce();
    }
  });

  // Step 2: create DNS record
  const { dns_record_id } = await cfClient.createDnsRecord({
    type: 'CNAME',
    name: subdomain,
    content: `${opts.tunnel_id}.cfargotunnel.com`,
    proxied: true,
  });

  console.info(
    `[cf-saas] provisioned app subdomain ${hostname} (port=${opts.port}): dns=${dns_record_id}`,
  );

  return {
    subdomain,
    url: `https://${hostname}`,
    dns_record_id,
  };
}

/**
 * Remove a per-app subdomain. Mirror of provisionAppSubdomain.
 *
 * Best-effort: each step is attempted even if a prior step failed, so partial
 * state can be cleaned up. Errors are collected and the first one re-thrown
 * at the end.
 */
export async function deprovisionAppSubdomain(opts: {
  tunnel_id: string;
  username: string;
  app_slug: string;
  dns_record_id: string;
}): Promise<void> {
  const subdomain = `${opts.app_slug}-${opts.username}`;
  const hostname = `${subdomain}.livinity.io`;
  const errors: Error[] = [];

  // Step 1: remove from ingress — same per-tunnel serialization as provision
  // (removal is an RMW full-replace too).
  try {
    await withTunnelIngressLock(opts.tunnel_id, async () => {
      const current = await cfClient.getTunnelIngress(opts.tunnel_id);
      const filtered = current.filter((i) => i.hostname !== hostname);
      await cfClient.pushTunnelIngress(opts.tunnel_id, filtered);
    });
  } catch (err) {
    errors.push(err instanceof Error ? err : new Error(String(err)));
  }

  // Step 2: delete DNS record (idempotent — 404 is OK, means already gone)
  try {
    await cfClient.deleteDnsRecord(opts.dns_record_id);
  } catch (err) {
    if (err instanceof CfApiError && err.code === 404) {
      // Already gone — ignore
    } else {
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }
  }

  if (errors.length > 0) {
    console.error(`[cf-saas] deprovisionAppSubdomain ${hostname} had ${errors.length} error(s)`, errors);
    throw errors[0];
  }

  console.info(`[cf-saas] deprovisioned app subdomain ${hostname}`);
}

/**
 * Fully remove a user: all app DNS records, apex DNS record, then the tunnel.
 *
 * Best-effort: every resource is attempted even if a prior delete failed, so a
 * partially-orphaned user can be fully cleaned up. Errors are aggregated.
 */
export async function deprovisionUser(opts: {
  tunnel_id: string;
  username: string;
  apex_dns_record_id: string;
  app_dns_record_ids: string[];
}): Promise<void> {
  const errors: Error[] = [];

  // Step 1: delete all per-app DNS records
  for (const id of opts.app_dns_record_ids) {
    try {
      await cfClient.deleteDnsRecord(id);
    } catch (err) {
      if (err instanceof CfApiError && err.code === 404) continue;
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }
  }

  // Step 2: delete apex DNS record
  try {
    await cfClient.deleteDnsRecord(opts.apex_dns_record_id);
  } catch (err) {
    if (!(err instanceof CfApiError && err.code === 404)) {
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }
  }

  // Step 3: delete the tunnel (CF requires ingress be empty / connector
  // disconnected; we don't drain connections here — caller should have
  // already torn down the Mini PC cloudflared service)
  try {
    await cfClient.deleteTunnel(opts.tunnel_id);
  } catch (err) {
    if (!(err instanceof CfApiError && err.code === 404)) {
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }
  }

  if (errors.length > 0) {
    console.error(
      `[cf-saas] deprovisionUser ${opts.username} had ${errors.length} error(s)`,
      errors,
    );
    throw errors[0];
  }

  console.info(`[cf-saas] deprovisioned user ${opts.username} fully`);
}

// ---------------------------------------------------------------------------
// Test hooks (exported for cf-saas.test.ts; not part of the public API)
// ---------------------------------------------------------------------------

/** Test-only: reset the lazy client so a fresh env read happens. */
export function __resetClientForTests(): void {
  _client = null;
}

/** Test-only: expose the rate limiter for inspection. */
export function __getLimiterForTests(): Bottleneck {
  return limiter;
}
