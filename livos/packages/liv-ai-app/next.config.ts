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
 */
const nextConfig: NextConfig = {
  basePath: '/liv-ai-app',
  output: 'standalone',
};

export default nextConfig;
