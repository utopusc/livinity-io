/**
 * Phase 205-02 — Shared tRPC HTTP client for claw-client → livinityd.
 *
 * Phase 205 Hot-fix L 2026-05-24 — REWRITTEN.
 *
 * The original Phase 205-02 implementation relied on a `/openclawos/runtime-config`
 * endpoint that the Wave 0 spike (`205-01-SPIKE-NOTES.md` AUTH PATH section)
 * claimed existed. Operator UAT proved otherwise: livinityd has no such route;
 * GET requests hit livinityd's SPA fallback handler and return `<!doctype html>`,
 * which fails JSON.parse with `Unexpected token '<'`. The spike was wrong and
 * the executor copy-pasted without verifying the route.
 *
 * Hot-fix L removes the bootstrap entirely and uses the LIVINITY_SESSION JWT
 * cookie path the operator already carries from login. `is-authenticated.ts:20-23`
 * reads the cookie via `req.cookies.LIVINITY_SESSION`, so `credentials: 'include'`
 * on every fetch is sufficient. The Hot-fix F5 `X-Api-Key` shortcut still exists
 * in livinityd for server-to-server callers (openclaw plugin → livinityd over
 * loopback) but is NOT used from the browser — browsers cannot read the
 * server-side env var, and the cookie is strictly more secure (HttpOnly,
 * Same-Site, no env exposure to the page).
 *
 * Wire envelopes confirmed live on Mini PC during Hot-fix L diagnosis:
 *   - Queries: `GET /trpc/<path>?input=%7B%22json%22%3A<...>%7D`
 *   - Mutations: `POST /trpc/<path>` body `{"json": <input>}` (bare non-batch)
 *   - Success: `{result:{data:<unwrapped>}}` (defensively also accepts `{json: payload}`)
 *   - Error: `{error:{json:{message,code}}}` OR `{error:{message,…}}`
 *
 * Consumed by:
 *   - Wave 2 (Plan 205-03) `McpServersTab.tsx`
 *   - Wave 3 (Plan 205-04) `GatewayTab.tsx`
 */

function getBaseUrl(): string {
  return typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:8080";
}

interface TrpcEnvelopeSuccess<O> {
  result?: { data?: O | { json: O } };
}

interface TrpcEnvelopeError {
  error?: {
    message?: string;
    code?: number | string;
    data?: { code?: string; message?: string; httpStatus?: number };
    json?: { message?: string; code?: string };
  };
}

type TrpcEnvelope<O> = TrpcEnvelopeSuccess<O> & TrpcEnvelopeError;

function unwrap<O>(env: TrpcEnvelope<O>): O {
  if (env.error) {
    const message =
      env.error.json?.message ??
      env.error.data?.message ??
      env.error.message ??
      env.error.data?.code ??
      "tRPC error";
    throw new Error(message);
  }
  const raw = env.result?.data;
  if (
    raw !== null &&
    typeof raw === "object" &&
    "json" in (raw as Record<string, unknown>)
  ) {
    return (raw as { json: O }).json;
  }
  return raw as O;
}

/**
 * Parse a tRPC response that returned a non-2xx status. Tries to surface the
 * server's structured error message; falls back to a generic HTTP message.
 *
 * Hot-fix L — when the response body is HTML (Caddy / livinityd SPA fallback),
 * surface a clearer error than `Unexpected token '<'`. This is the exact
 * failure mode operator UAT hit before the cookie path was wired.
 */
async function explainNotOk<O>(res: Response, path: string): Promise<Error> {
  const text = await res.text().catch(() => "");
  if (text.startsWith("<")) {
    return new Error(
      `${path} HTTP ${res.status} — server returned HTML instead of JSON ` +
        `(route may be missing or proxy misconfigured; check Caddy /trpc/* proxy + livinityd boot log)`,
    );
  }
  try {
    const env = JSON.parse(text) as TrpcEnvelope<O>;
    if (env.error) {
      const message =
        env.error.json?.message ??
        env.error.data?.message ??
        env.error.message ??
        `${path} HTTP ${res.status}`;
      return new Error(message);
    }
  } catch {
    // fall through to generic
  }
  return new Error(`${path} HTTP ${res.status}`);
}

/**
 * Issue a tRPC **query** against livinityd.
 *
 * Wire shape: `GET /trpc/<path>` with `?input=<encoded {json: input}>` when
 * input is provided; bare GET when omitted. Auth via LIVINITY_SESSION
 * cookie auto-flowed by `credentials: 'include'`.
 */
export async function callQuery<I, O>(path: string, input?: I): Promise<O> {
  const url =
    input === undefined
      ? `${getBaseUrl()}/trpc/${path}`
      : `${getBaseUrl()}/trpc/${path}?input=${encodeURIComponent(
          JSON.stringify({ json: input }),
        )}`;
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw await explainNotOk<O>(res, path);
  }
  const env = (await res.json()) as TrpcEnvelope<O>;
  return unwrap<O>(env);
}

/**
 * Issue a tRPC **mutation** against livinityd.
 *
 * Wire shape: `POST /trpc/<path>` with body `{json: input}` (bare non-batch;
 * `{0:{json:...}}?batch=1` is the production-broken shape from McpTab.tsx
 * Phase 204-02 carry-over). Auth via LIVINITY_SESSION cookie.
 */
export async function callMutation<I, O>(path: string, input: I): Promise<O> {
  const res = await fetch(`${getBaseUrl()}/trpc/${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ json: input }),
  });
  if (!res.ok) {
    throw await explainNotOk<O>(res, path);
  }
  const env = (await res.json()) as TrpcEnvelope<O>;
  return unwrap<O>(env);
}
