/**
 * Phase 203-11 — Standalone OpenUI app renderer.
 *
 * Route: `/apps/[slug]` (Next.js App Router). Served at
 * `/liv-ai-app/apps/{slug}` on the parent vhost via the Caddy
 * `handle /liv-ai-app/*` reverse_proxy + `rewrite * /plugins/openclawos{path}`
 * chain shipped in Plans 203-09 + 203-10.
 *
 * Plan 203-10's `OpenUiAppContent` mounts this URL inside an iframe in the
 * LivOS dock window. The client component reads the live slug from
 * `window.location.pathname`, fetches the app from livinityd's
 * `openclawos.apps.get` tRPC route (Plan 203-04), and renders the OpenUI
 * Lang markup via `@openuidev/react-lang`'s Renderer + the
 * `@openuidev/react-ui` openuiLibrary — the SAME 14-component whitelist
 * renderer used by AppDetail (T-203-03 mitigations active).
 *
 * ── Static export strategy ─────────────────────────────────────────────
 *
 * The claw-client uses `output: "export"` (see next.config.ts), so
 * `generateStaticParams` is mandatory for dynamic routes. We emit a single
 * `__placeholder__` slug; the claw-plugin's static-file handler
 * (Phase 203-11 patch) rewrites every `/apps/<slug>` request that doesn't
 * have its own HTML to `apps/__placeholder__.html`. The client component
 * then reads the actual slug from `window.location.pathname` at runtime.
 *
 * This server-shell-with-client-body split is the standard Next.js pattern
 * for combining `generateStaticParams` with a fully client-rendered body.
 */

import { OpenUiAppView } from "./OpenUiAppView";

export function generateStaticParams(): Array<{ slug: string }> {
  return [{ slug: "__placeholder__" }];
}

// Force the placeholder to NOT be tagged as a 404 by the static export
// pipeline — we WANT this HTML to be served for any unknown slug via the
// plugin's /apps/* fallback (see livos/packages/liv-claw-os/packages/claw-plugin/src/index.ts).
export const dynamicParams = false;

export default function OpenUiAppPage(_props: { params: Promise<{ slug: string }> }) {
  // The actual slug is extracted from window.location.pathname inside the
  // client view — the route param is the literal "__placeholder__" sentinel
  // for the prebuilt HTML; the page is only ever fetched live via the
  // plugin's fallback rewrite.
  return <OpenUiAppView />;
}
