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
 * Wire format — tRPC v10/v11 batch envelope used by the rest of the
 * livinityd-facing surface (see livinityd `httpOnlyPaths` registration of
 * `openclawos.apps.get`):
 *
 *   GET /trpc/openclawos.apps.get?batch=1&input=<encoded {0:{json:{slug}}}>
 *   → 200 [{result:{data:{json: LivosOpenuiApp}}}]
 *   → 404 [{error:{...code:NOT_FOUND, data:{httpStatus:404}}}]  (server emits a tRPC NOT_FOUND envelope on missing slug)
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

  const input = encodeURIComponent(JSON.stringify({ 0: { json: { slug } } }));
  const url = `${baseUrl}/trpc/openclawos.apps.get?batch=1&input=${input}`;

  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    signal: options.signal,
    cache: "no-store",
  });

  if (!res.ok) {
    // Server emits a tRPC envelope even on errors — try to read it so the
    // caller can distinguish "missing app" from "broken endpoint".
    const text = await res.text().catch(() => "");
    let envelope: unknown = null;
    try {
      envelope = JSON.parse(text);
    } catch {
      // not JSON — fall through to plain HTTP error
    }
    if (Array.isArray(envelope) && envelope[0] && typeof envelope[0] === "object") {
      const first = envelope[0] as { error?: { data?: { code?: string; httpStatus?: number } } };
      const code = first.error?.data?.code;
      const httpStatus = first.error?.data?.httpStatus;
      if (code === "NOT_FOUND" || httpStatus === 404) {
        return null;
      }
    }
    throw new Error(`openclawos.apps.get HTTP ${res.status}`);
  }

  const envelope = (await res.json()) as unknown;
  if (!Array.isArray(envelope) || !envelope[0] || typeof envelope[0] !== "object") {
    throw new Error("openclawos.apps.get malformed envelope");
  }
  const first = envelope[0] as {
    result?: { data?: { json?: OpenUiApp } | OpenUiApp };
    error?: { data?: { code?: string } };
  };
  if (first.error) {
    if (first.error.data?.code === "NOT_FOUND") return null;
    throw new Error(`openclawos.apps.get error: ${first.error.data?.code ?? "UNKNOWN"}`);
  }
  // tRPC v11 default transformer wraps in {json}, v10 does not — accept both.
  const raw = first.result?.data;
  if (!raw) throw new Error("openclawos.apps.get empty result");
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
