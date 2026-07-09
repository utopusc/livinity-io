/**
 * src/main/cloudflare/cf-http.ts
 *
 * The bearer-token Cloudflare HTTP transport. A single `callCf<T>()` that every
 * CF call routes through: it attaches the user's CF API token as
 * `Authorization: Bearer <token>`, retries 429 / 5xx / network failures (with an
 * AbortController per-call timeout + jittered backoff), and on a terminal non-2xx
 * (401/403/404) throws a structured `CfApiError` carrying the CF error code +
 * endpoint — NEVER the token.
 *
 * Ported (not invented) from the proven single-tenant box client
 * `livos/.../apps/cf-local.ts:82-159` (its `callCf` + `CfLocalError`), with
 * cf-saas's `retryAfterMs()` (cf-saas.ts:203-218) folded in to honor CF's
 * `Retry-After` / `cf-ratelimit-reset` headers on a 429. No rate limiter
 * (Bottleneck) — cf-local deliberately dropped it for the low-call-volume
 * single-tenant case, which is exactly this app. Zero new runtime deps.
 *
 * TRUST/DISCLOSURE (T-03-01/T-03-13): the base URL is a hardcoded HTTPS literal,
 * never derived from any argument; the token appears ONLY in the request header,
 * never in the endpoint string, the thrown error, or any `logSafe` call
 * (scalars/endpoint only). A dropped connection is a distinct verdict (a
 * status:0 CfApiError) from a resolved HTTP 4xx — the two route to different
 * screens; a blanket try/catch folding them is the documented anti-pattern.
 *
 * Zero imports from ipc/ or tray/ — a pure, unit-testable main-process primitive.
 */

import { logSafe } from '../log';

/** Hardcoded HTTPS base — never derived from user input, never anything else. */
export const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

const MAX_RETRIES = 3;
const PER_CALL_TIMEOUT_MS = 8000;
const BACKOFF_BASE_MS = [250, 500, 1000] as const;
const MAX_RETRY_AFTER_MS = 30_000;

/**
 * A structured, token-free Cloudflare API error. `endpoint` is `${method} ${path}`
 * (path only — the token is never part of it). `status` is the HTTP status, or 0
 * for a network-level failure (dropped connection / timeout). `cfErrorCode` is
 * CF's first error code (-1 when absent); a code like 9109 is surfaced verbatim
 * and is NOT interpreted as a scope verdict here (that is decide-scope-verdict's
 * job at 03-05).
 */
export class CfApiError extends Error {
  readonly status: number;
  readonly cfErrorCode: number;
  readonly cfMessage: string;
  readonly endpoint: string;

  constructor(opts: { message: string; status: number; cfErrorCode: number; cfMessage: string; endpoint: string }) {
    super(opts.message);
    this.name = 'CfApiError';
    this.status = opts.status;
    this.cfErrorCode = opts.cfErrorCode;
    this.cfMessage = opts.cfMessage;
    this.endpoint = opts.endpoint;
  }
}

interface CfEnvelope<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(ms: number): number {
  const delta = ms * 0.25;
  return Math.round(ms + (Math.random() * 2 - 1) * delta);
}

/**
 * The retry taxonomy. A present network `errCode` (ECONNRESET/ETIMEDOUT/EAI_AGAIN)
 * always retries; otherwise only 429 and any 5xx retry. 401/403/404 (auth / scope
 * / not-found) are terminal and NEVER retry.
 */
export function shouldRetry(status: number, errCode?: string): boolean {
  if (errCode) return ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(errCode);
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Honor CF's rate-limit headers on a 429: `Retry-After` (seconds) or
 * `cf-ratelimit-reset` (unix seconds). Returns a capped wait in ms, or null when
 * neither header is present (caller falls back to fixed jittered backoff).
 */
function retryAfterMs(res: Response): number | null {
  const ra = res.headers.get('retry-after');
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, MAX_RETRY_AFTER_MS) + jitter(200);
  }
  const reset = res.headers.get('cf-ratelimit-reset');
  if (reset) {
    const resetUnix = Number(reset);
    if (Number.isFinite(resetUnix)) {
      const deltaMs = resetUnix * 1000 - Date.now();
      if (deltaMs > 0) return Math.min(deltaMs, MAX_RETRY_AFTER_MS) + jitter(200);
    }
  }
  return null;
}

/**
 * Perform one Cloudflare API call with retry + timeout. Returns `json.result` on
 * a 2xx success envelope. Throws a token-free `CfApiError` on a terminal non-2xx
 * (401/403/404) or after exhausting retries on 429/5xx/network.
 *
 * The `token` is attached ONLY to the `Authorization` header — it is never placed
 * in the URL, the endpoint string, the error, or a log.
 */
export async function callCf<T>(
  token: string,
  opts: { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string; body?: unknown }
): Promise<T> {
  const url = `${CF_API_BASE}${opts.path}`;
  const endpoint = `${opts.method} ${opts.path}`; // path only — never the token
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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

      const text = await res.text();
      let json: CfEnvelope<T> | null = null;
      if (text.length > 0) {
        try {
          json = JSON.parse(text) as CfEnvelope<T>;
        } catch {
          json = null;
        }
      }

      logSafe('cf.call', { status: res.status, endpoint });

      if (!res.ok) {
        if (shouldRetry(res.status) && attempt < MAX_RETRIES) {
          await sleep(retryAfterMs(res) ?? jitter(BACKOFF_BASE_MS[attempt]));
          continue;
        }
        const cfError = json?.errors?.[0];
        throw new CfApiError({
          message: `CF ${endpoint} failed: ${res.status} ${cfError?.message ?? text.slice(0, 200)}`,
          status: res.status,
          cfErrorCode: cfError?.code ?? -1,
          cfMessage: cfError?.message ?? '',
          endpoint,
        });
      }

      if (!json) return undefined as T; // 2xx with an empty body — caller expects no data
      if (!json.success) {
        const cfError = json.errors?.[0];
        throw new CfApiError({
          message: `CF ${endpoint} returned success=false: ${cfError?.message ?? 'unknown'}`,
          status: res.status,
          cfErrorCode: cfError?.code ?? -1,
          cfMessage: cfError?.message ?? '',
          endpoint,
        });
      }
      return json.result;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (err instanceof CfApiError) throw err; // already terminal — surface immediately
      const e = err as NodeJS.ErrnoException & { name?: string };
      const errCode = e?.code ?? (e?.name === 'AbortError' ? 'ETIMEDOUT' : undefined);
      if (shouldRetry(0, errCode) && attempt < MAX_RETRIES) {
        await sleep(jitter(BACKOFF_BASE_MS[attempt]));
        continue;
      }
      logSafe('cf.call', { status: 0, endpoint });
      throw new CfApiError({
        message: `CF ${endpoint} failed: ${e?.message ?? String(err)}`,
        status: 0,
        cfErrorCode: -1,
        cfMessage: e?.message ?? '',
        endpoint,
      });
    }
  }

  // Exhausted retries without a terminal throw (defensive — the loop above throws first).
  throw new CfApiError({
    message: `CF ${endpoint} exhausted retries: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    status: 0,
    cfErrorCode: -1,
    cfMessage: '',
    endpoint,
  });
}
