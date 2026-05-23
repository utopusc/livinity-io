/**
 * Phase 203-06 Task 2/3 — Shared livinityd plugin-RPC HTTP client.
 *
 * Both `luse-proxy.ts` and `builtin-proxy.ts` (and any future tool-bridge
 * module) call livinityd's internal `POST /openclawos/plugin-rpc` route via
 * this client. Mirrors the auth + retry pattern from `app-store.ts` (Plan
 * 203-04) so behavior is consistent across plugin-side HTTP surfaces.
 *
 * Auth: `X-Internal-Plugin-Token` header sourced from `LIV_PLUGIN_TOKEN`
 *       or `LIV_API_KEY` env (Plan 203-04 D-203-06 fallback).
 *
 * Retry: one retry on transient 5xx or network failure, 250 ms backoff
 *        (T-203-01 mitigation for livinityd restart during update.sh).
 *
 * Returns the raw JSON body so callers can branch on `{ok: true, result}` vs
 * `{ok: false, error, detail?}` exactly as the livinityd dispatcher emits.
 */

const DEFAULT_BASE_URL = "http://127.0.0.1:8080";
const RETRY_BACKOFF_MS = 250;

export type RpcResponse<T = unknown> =
  | { ok: true; result: T }
  | { ok: false; error: string; detail?: string };

function getBaseUrl(): string {
  return (
    process.env["LIVINITY_BASE_URL"] ??
    process.env["LIVOS_BASE_URL"] ??
    DEFAULT_BASE_URL
  );
}

function getToken(): string | null {
  return process.env["LIV_PLUGIN_TOKEN"] ?? process.env["LIV_API_KEY"] ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface CallRpcOptions {
  /** Override fetch implementation (tests / non-Node runtimes). */
  fetchImpl?: typeof globalThis.fetch;
  /** Per-call timeout in ms (default: 90s for destructive tool waits). */
  timeoutMs?: number;
}

/**
 * Invoke `method` on livinityd's plugin-rpc dispatcher with `args`.
 * Returns the parsed body (still typed as RpcResponse — caller branches).
 * Throws Error on HARD failure (network down + retry exhausted, malformed body).
 */
export async function callPluginRpc<T = unknown>(
  method: string,
  args: Record<string, unknown>,
  opts: CallRpcOptions = {},
): Promise<RpcResponse<T>> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const baseUrl = getBaseUrl();
  const token = getToken();
  const url = `${baseUrl}/openclawos/plugin-rpc`;
  const body = JSON.stringify({ method, args });
  const timeoutMs = opts.timeoutMs ?? 90_000;

  const doFetch = async (): Promise<Response> => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      return await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "X-Internal-Plugin-Token": token } : {}),
        },
        body,
        signal: ctl.signal,
      });
    } finally {
      clearTimeout(t);
    }
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await doFetch();
      if (res.status >= 500) {
        lastErr = new Error(`livinityd plugin-rpc ${method} → HTTP ${res.status}`);
        if (attempt === 0) {
          await sleep(RETRY_BACKOFF_MS);
          continue;
        }
        throw lastErr;
      }
      const parsed = (await res.json()) as RpcResponse<T> | { error?: string; detail?: string };
      // Normalise non-2xx (400/403/404) into the {ok:false,error} shape so
      // callers don't have to special-case status codes.
      if (!res.ok) {
        const errBody = parsed as { error?: string; detail?: string };
        return {
          ok: false,
          error: errBody.error ?? `HTTP_${res.status}`,
          detail: errBody.detail,
        };
      }
      return parsed as RpcResponse<T>;
    } catch (err) {
      lastErr = err;
      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" || err.message.includes("aborted"));
      if (isAbort) {
        throw err;
      }
      // Retry once on transient network failure.
      if (attempt === 0) {
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
