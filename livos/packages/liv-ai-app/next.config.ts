import type { NextConfig } from "next";

/**
 * Phase 201-06 — Liv AI subapp mounts under `/liv-ai-app/*` on the per-user
 * vhost (e.g. https://bruce.livinity.io/liv-ai-app/). Caddy's runtime
 * generator (livos/packages/livinityd/source/modules/domain/caddy.ts) adds a
 * `handle /liv-ai-app/* { reverse_proxy 127.0.0.1:3010 }` block ABOVE the
 * catch-all `handle { reverse_proxy 127.0.0.1:8080 }` so the prefix is NOT
 * stripped — Next.js MUST be `basePath`-aware so its router emits asset URLs
 * + Link hrefs prefixed with `/liv-ai-app`.
 *
 * `output: 'standalone'` keeps the production build self-contained so the
 * systemd unit (scripts/install/systemd/livos-app-liv-ai.service) can run
 * `pnpm --filter liv-ai-app start` against the standalone server.
 *
 * Phase 201 dev-mode (2026-05-23) — when developing the UI on localhost:3010
 * we point at the live bruce.livinity.io livinityd instead of running a
 * local backend. Both `/chat/*` and `/trpc/*` get server-side proxied so the
 * browser sees same-origin (no CORS) and the operator's LIVINITY_SESSION
 * cookie (manually copied to localhost via DevTools → Application → Cookies
 * for first-time setup) is forwarded server-side to the real backend.
 *
 * Production deploys (Caddy on Mini PC) do NOT use these rewrites — the
 * Caddy `handle /liv-ai-app/* → :3010` block already gives same-origin
 * routing, so the AssistantChatTransport's relative `api: '/chat/livAi'`
 * resolves natively to the parent livinityd's Express route.
 */
const UPSTREAM = process.env.LIV_AI_UPSTREAM ?? "https://bruce.livinity.io";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // basePath only in production — locally we open localhost:3010 at root
  // for a flat dev URL. Caddy still prefixes /liv-ai-app/* in production.
  basePath: isProd ? "/liv-ai-app" : undefined,
  output: "standalone",
  async rewrites() {
    return [
      { source: "/chat/:path*", destination: `${UPSTREAM}/chat/:path*` },
      { source: "/trpc/:path*", destination: `${UPSTREAM}/trpc/:path*` },
    ];
  },
};

export default nextConfig;
