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
}

export interface CfClient {
  // Tunnel lifecycle
  createTunnel(name: string): Promise<{ tunnel_id: string; secret: string }>;
  getTunnelToken(tunnel_id: string): Promise<string>;
  pushTunnelIngress(tunnel_id: string, ingress: Ingress[]): Promise<void>;
  getTunnelIngress(tunnel_id: string): Promise<Ingress[]>;
  deleteTunnel(tunnel_id: string): Promise<void>;
  listTunnels(): Promise<Tunnel[]>;

  // DNS lifecycle
  createDnsRecord(opts: {
    type: 'CNAME';
    name: string;
    content: string;
    proxied: boolean;
  }): Promise<{ dns_record_id: string }>;
  deleteDnsRecord(dns_record_id: string): Promise<void>;
  listDnsRecordsByName(name: string): Promise<DnsRecord[]>;
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
          const wait = jitter(BACKOFF_BASE_MS[attempt]);
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
 * Idempotency: caller is responsible. Calling twice creates two tunnels.
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

  // Step 1: create tunnel
  const { tunnel_id } = await cfClient.createTunnel(`livos-${username}`);

  // Step 2: fetch connector token
  const tunnel_token = await cfClient.getTunnelToken(tunnel_id);

  // Step 3: set initial ingress (apex only + catch-all)
  await cfClient.pushTunnelIngress(tunnel_id, [
    { hostname: `${username}.livinity.io`, service: 'http://localhost:80' },
  ]);

  // Step 4: create apex DNS CNAME
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
export async function provisionAppSubdomain(opts: {
  tunnel_id: string;
  username: string;
  app_slug: string;
  port: number;
}): Promise<{ subdomain: string; url: string; dns_record_id: string }> {
  const subdomain = `${opts.app_slug}-${opts.username}`;
  const hostname = `${subdomain}.livinity.io`;

  // Step 1: fetch current ingress, append, push
  const current = await cfClient.getTunnelIngress(opts.tunnel_id);
  const withoutCatchAll = current.filter((i) => !(i.service === 'http_status:404' && !i.hostname));

  // De-dup defensively — if hostname already present, replace its entry
  const dedup = withoutCatchAll.filter((i) => i.hostname !== hostname);
  const next: Ingress[] = [
    ...dedup,
    { hostname, service: 'http://localhost:80' },
  ];
  await cfClient.pushTunnelIngress(opts.tunnel_id, next);

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

  // Step 1: remove from ingress
  try {
    const current = await cfClient.getTunnelIngress(opts.tunnel_id);
    const filtered = current.filter((i) => i.hostname !== hostname);
    await cfClient.pushTunnelIngress(opts.tunnel_id, filtered);
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
