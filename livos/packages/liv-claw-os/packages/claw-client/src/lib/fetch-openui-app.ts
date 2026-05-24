/**
 * Phase 203-11 — Client-side fetch helper for `openclawos.apps.get`.
 *
 * Adapted from Plan 203-11 task 1 because the claw-client uses
 * `output: "export"` (see next.config.ts) — there is NO Next.js server
 * runtime. `cookies()` from `next/headers` and async server components are
 * not available at runtime; dynamic routes are pre-rendered. The helper
 * therefore runs in the browser and reaches livinityd via the same-origin
 * Caddy reverse_proxy that serves both the iframe (`/liv-ai-app/...`) and
 * the parent's `/trpc/*` route (`window.location.origin`).
 *
 * The LIVINITY_SESSION cookie auto-flows with `credentials: 'include'`
 * because the bundle is mounted under the parent vhost (T-203-06 trust
 * chain preserved).
 *
 * Wire format — bare non-batch envelope.
 *
 * Phase 206 commit 3f6b0c25 retired the `{0:{json:input}}` batch wrap for
 * livinityd's tRPC because livinityd has NO superjson transformer and
 * every input-bearing procedure silently zod-failed against the wrapped
 * shape. This helper was missed in that commit — operator UAT 2026-05-24
 * surfaced it as `openclawos.apps.get HTTP 400 (BAD_REQUEST)` when
 * clicking the freshly-created OpenUI desktop app.
 *
 *   GET /trpc/openclawos.apps.get?input=<encoded {"slug":"..."}>
 *   → 200 {result:{data: LivosOpenuiApp}}
 *   → 404 {error:{data:{code:"NOT_FOUND", httpStatus:404}}}
 *
 * The defensive `{json:…}` read in the parser is kept so a future
 * superjson re-introduction wouldn't immediately break the page.
 */

export interface OpenUiApp {
  slug: string;
  name: string;
  content: string;
  version: number;
}

export interface FetchOpenUiAppOptions {
  /** AbortSignal so a navigating user cancels the in-flight request. */
  signal?: AbortSignal;
  /**
   * Override the origin (defaults to `window.location.origin`). Lets tests
   * point at a fixture server without monkey-patching `window`.
   */
  baseUrl?: string;
}

/**
 * Discriminated outcome — `null` on a clean 404 (caller renders "not
 * found"), thrown Error on transport / parse / non-200 failure. Mirrors the
 * upstream `apps.getApp` contract in `lib/engines/types.ts`.
 */
export async function fetchOpenUiApp(
  slug: string,
  options: FetchOpenUiAppOptions = {},
): Promise<OpenUiApp | null> {
  const baseUrl =
    options.baseUrl ??
    (typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:8080");

  const input = encodeURIComponent(JSON.stringify({ slug }));
  const url = `${baseUrl}/trpc/openclawos.apps.get?input=${input}`;

  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    signal: options.signal,
    cache: "no-store",
  });

  type ErrEnvelope = {
    error?: { data?: { code?: string; httpStatus?: number }; message?: string };
  };

  if (!res.ok) {
    // Server emits a tRPC envelope even on errors — try to read it so the
    // caller can distinguish "missing app" from "broken endpoint".
    const text = await res.text().catch(() => "");
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // not JSON — fall through to plain HTTP error
    }
    // Tolerate both bare {error} envelopes (non-batch) and legacy
    // [{error}] batch shape, so a transient server rollback doesn't
    // confuse the not-found vs broken-endpoint branch.
    const errEnv: ErrEnvelope | null = Array.isArray(parsed)
      ? ((parsed[0] as ErrEnvelope) ?? null)
      : ((parsed as ErrEnvelope) ?? null);
    const code = errEnv?.error?.data?.code;
    const httpStatus = errEnv?.error?.data?.httpStatus;
    if (code === "NOT_FOUND" || httpStatus === 404) {
      return null;
    }
    throw new Error(`openclawos.apps.get HTTP ${res.status}`);
  }

  const parsed = (await res.json()) as unknown;
  // Same tolerance on the success path — bare {result:{data}} is the
  // post-Phase-206 shape, [{result:{data}}] is the legacy batch shape.
  const successEnv = (Array.isArray(parsed) ? parsed[0] : parsed) as {
    result?: { data?: { json?: OpenUiApp } | OpenUiApp };
    error?: { data?: { code?: string } };
  };
  if (!successEnv || typeof successEnv !== "object") {
    throw new Error("openclawos.apps.get malformed envelope");
  }
  if (successEnv.error) {
    if (successEnv.error.data?.code === "NOT_FOUND") return null;
    throw new Error(
      `openclawos.apps.get error: ${successEnv.error.data?.code ?? "UNKNOWN"}`,
    );
  }
  const raw = successEnv.result?.data;
  if (!raw) throw new Error("openclawos.apps.get empty result");
  // tRPC v11 default transformer wraps in {json}, v10/post-206 does not —
  // accept both (defense-in-depth for a possible superjson re-introduction).
  const app = (raw as { json?: OpenUiApp }).json ?? (raw as OpenUiApp);
  if (
    typeof app?.slug !== "string" ||
    typeof app?.name !== "string" ||
    typeof app?.content !== "string"
  ) {
    throw new Error("openclawos.apps.get invalid shape");
  }
  return app;
}
