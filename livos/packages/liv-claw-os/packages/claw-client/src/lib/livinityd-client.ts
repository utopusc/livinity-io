/**
 * Phase 205-02 — Shared tRPC HTTP client for claw-client → livinityd.
 *
 * Wire contract LOCKED in `.planning/phases/205-liv-ai-ui-carryovers/205-01-SPIKE-NOTES.md`
 * AUTH PATH section. Empirically verified against Mini PC livinityd at
 * `127.0.0.1:8080` during Probe B5 + B7 + C4:
 *
 *   - tRPC v11 queries route through **GET** (POST returns 405).
 *   - Mutations route through **POST** with **bare non-batch** envelope
 *     `{json: input}` — NOT the `{0:{json:...}}?batch=1` shape (that shape
 *     is the production-broken McpTab.tsx Phase 204-02 carry-over).
 *   - Auth is the F5 X-Api-Key shortcut via runtime-config bootstrap.
 *     The browser bundle CANNOT read the Node-side LIV_API_KEY env var
 *     directly (Next.js `output:"export"` SPA); it instead fetches the
 *     key once on first call from same-origin `GET /openclawos/runtime-config`
 *     and caches it in module scope.
 *   - Response envelopes:
 *       success: `{result:{data:<unwrapped>}}` (tRPC v11 strips `{json:…}`
 *                wrapper on the wire for primitive outputs — proven by
 *                `{"result":{"data":[]}}` rather than `{"result":{"data":{"json":[]}}}`).
 *                We still accept `{json: payload}` defensively in case a
 *                future procedure returns a wrapped payload.
 *       error:   `{error:{json:{message,code}}}` OR `{error:{message,…}}`.
 *
 * Cookie auth via `credentials: 'include'` is the defense-in-depth fallback
 * (LIVINITY_SESSION cookie auto-flows). The X-Api-Key header takes
 * precedence per Hot-fix F5 contract in `is-authenticated.ts:19-58`.
 *
 * This module is consumed by:
 *   - Wave 2 (Plan 205-03) `McpServersTab.tsx`
 *   - Wave 3 (Plan 205-04) `GatewayTab.tsx`
 * The shells were scaffolded in this wave (205-02); the tab bodies fill
 * in later. The `livinityd-client.ts` helper is locked in this wave so
 * both downstream waves consume an identical wire envelope.
 */

let cachedApiKey: string | undefined;
let bootstrapPromise: Promise<string> | undefined;

function getBaseUrl(): string {
  return typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:8080";
}

/**
 * Fetch the LIV_API_KEY from same-origin `/openclawos/runtime-config` on
 * first use and cache it for the session. The endpoint is served by the
 * openclaw gateway plugin and returns `{livApiKey: <string>}` for
 * requests that already carry an authenticated LIVINITY_SESSION cookie.
 *
 * The fetch is de-duplicated via `bootstrapPromise` so concurrent first
 * callers share a single in-flight request.
 */
async function getApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    const res = await fetch(`${getBaseUrl()}/openclawos/runtime-config`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      bootstrapPromise = undefined;
      throw new Error(`runtime-config HTTP ${res.status}`);
    }
    const body = (await res.json()) as { livApiKey?: string };
    if (!body.livApiKey) {
      bootstrapPromise = undefined;
      throw new Error("runtime-config missing livApiKey");
    }
    cachedApiKey = body.livApiKey;
    return cachedApiKey;
  })();
  try {
    return await bootstrapPromise;
  } finally {
    // Clear the in-flight promise on failure so the next caller retries;
    // on success cachedApiKey covers all subsequent calls.
    if (!cachedApiKey) bootstrapPromise = undefined;
  }
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
 * Issue a tRPC **query** against livinityd.
 *
 * Wire shape: `GET /trpc/<path>` with `?input=<encoded {json: input}>`
 * when input is provided; bare GET when omitted. X-Api-Key header
 * carries the bootstrapped LIV_API_KEY; LIVINITY_SESSION cookie auto-
 * flows via `credentials: 'include'` as defense-in-depth.
 */
export async function callQuery<I, O>(path: string, input?: I): Promise<O> {
  const apiKey = await getApiKey();
  const url =
    input === undefined
      ? `${getBaseUrl()}/trpc/${path}`
      : `${getBaseUrl()}/trpc/${path}?input=${encodeURIComponent(
          JSON.stringify({ json: input }),
        )}`;
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json", "X-Api-Key": apiKey },
    cache: "no-store",
  });
  if (!res.ok) {
    // Try to extract a tRPC error message from the body if present.
    const text = await res.text().catch(() => "");
    try {
      const env = JSON.parse(text) as TrpcEnvelope<O>;
      if (env.error) {
        const message =
          env.error.json?.message ??
          env.error.data?.message ??
          env.error.message ??
          `${path} HTTP ${res.status}`;
        throw new Error(message);
      }
    } catch {
      // fall through
    }
    throw new Error(`${path} HTTP ${res.status}`);
  }
  const env = (await res.json()) as TrpcEnvelope<O>;
  return unwrap<O>(env);
}

/**
 * Issue a tRPC **mutation** against livinityd.
 *
 * Wire shape: `POST /trpc/<path>` with body `{json: input}` (bare
 * non-batch — `{0:{json:...}}?batch=1` is the production-broken shape).
 * X-Api-Key + LIVINITY_SESSION cookie attached as in `callQuery`.
 */
export async function callMutation<I, O>(path: string, input: I): Promise<O> {
  const apiKey = await getApiKey();
  const res = await fetch(`${getBaseUrl()}/trpc/${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({ json: input }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    try {
      const env = JSON.parse(text) as TrpcEnvelope<O>;
      if (env.error) {
        const message =
          env.error.json?.message ??
          env.error.data?.message ??
          env.error.message ??
          `${path} HTTP ${res.status}`;
        throw new Error(message);
      }
    } catch {
      // fall through
    }
    throw new Error(`${path} HTTP ${res.status}`);
  }
  const env = (await res.json()) as TrpcEnvelope<O>;
  return unwrap<O>(env);
}
