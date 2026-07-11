/**
 * src/main/orchestrator/map-marker-to-bucket.ts
 *
 * Pure, zero-IO marker-title -> progress-bucket classifier (INSTALL-02).
 * Source of truth: 05-RESEARCH.md Pattern 2 / Pitfall 1 (the CORRECTED
 * bucket table), NOT 05-UI-SPEC.md's as-written Screen-1 table. The
 * UI-SPEC's table was built from `step()` call-site FILE line order (grep
 * position); tracing `deploy_livinityd()`'s REAL function-call order showed
 * several steps it assigned to the LAST bucket ("Finishing up") actually
 * fire in the first few seconds of the ~15-20 minute build. Combined with
 * "unmatched falls through to the last bucket," that would freeze the
 * enriched progress UI at "Finishing up" almost immediately -- the exact
 * opposite of the UX goal. Full trace: 05-RESEARCH.md Pitfall 1.
 *
 * The fix has two parts:
 *   1. This corrected keyword table (steps moved/added per the real trace).
 *   2. An unmatched title returns null so the caller does NOT advance --
 *      it never falls through to a catch-all bucket. This is the load-
 *      bearing regression guard: any future install.sh step title this
 *      table doesn't know about simply leaves the current caption in place
 *      rather than mis-classifying it.
 *
 * Bucket NAMES/ORDER/COUNT (6, "Getting your system ready" -> "Finishing
 * up") are the UI-SPEC's locked contract -- only the keyword-to-bucket
 * ASSIGNMENT is corrected here (explicitly within Claude's Discretion per
 * CONTEXT.md). Caller-side monotonicity (never regress once advanced) is
 * NOT this module's job -- the caller (install-invoke.ts, 05-06) applies
 * `bucket >= activeBucket` before accepting a new bucket; this module only
 * classifies one title in isolation.
 *
 * Zero runtime imports -- no IO, no Node built-ins, no electron surface.
 */

const BUCKET_KEYWORDS: string[][] = [
  // 1 "Getting your system ready"
  ['Detecting platform', 'common dependencies'],
  // 2 "Connecting your domain"
  [
    'cloudflared',
    'Cloudflare Tunnel',
    'Caddy',
    'tunnel-mode',
    'Cloudflare API token',
    'marketplace API key', // <- ADDED: matched nothing in the UI-SPEC table and fell through early
  ],
  // 3 "Installing LivOS components"
  [
    'system packages',
    'PostgreSQL',
    'Redis setup',
    'clone livinity-io',
    'Installing Docker',
    'streaming subsystem',
    'google-chrome',
    'pnpm',
    'npm install',
    'sync liv dist',
    '@liv/core',
    'Build-memory guard', // <- MOVED (fires 3rd in real order, not late)
    'Port preflight', // <- MOVED (fires 4th in real order, not late)
    'create desktop user', // <- MOVED (fires 7th in real order, not bucket 4)
    'Flatpak runtime', // <- MOVED (not bucket 6)
    'deploying livinityd', // <- MOVED (the umbrella step, fires FIRST, not unmatched)
  ],
  // 4 "Configuring your server"
  [
    'JWT secret',
    '/opt/livos/.env',
    'seed liv:mcp:config',
    'seed livos:domain:config',
    'terminal_panel',
    'platform:api_key', // <- REMOVED the bare "desktop user" collision (belongs to bucket 3's early step)
  ],
  // 5 "Starting Livinity"
  [
    'systemd unit livos.service',
    'systemd units for liv-core',
    'health check livinityd',
    'liv-assistant',
    'reverse_proxy 127.0.0.1:8080',
  ],
  // 6 "Finishing up" -- an EXPLICIT keyword list, not a blind catch-all
  [
    'update gallery cache',
    'fix permissions',
    'bruce user migration',
    'vault rename',
    'template app units',
    'UFW deny',
    'cleanup',
    '.deployed-sha',
  ],
];

export function bucketForTitle(title: string): number | null {
  const lower = title.toLowerCase();
  for (let i = 0; i < BUCKET_KEYWORDS.length; i++) {
    if (BUCKET_KEYWORDS[i].some((kw) => lower.includes(kw.toLowerCase()))) return i + 1;
  }
  return null; // no match -> caller does NOT advance (Pitfall-1 regression guard)
}
