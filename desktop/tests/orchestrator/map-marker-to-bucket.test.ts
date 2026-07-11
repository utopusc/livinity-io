import { describe, it, expect } from 'vitest';
import { bucketForTitle } from '../../src/main/orchestrator/map-marker-to-bucket';

/**
 * Flat table (mirrors tests/wsl/map-install-exit.test.ts style), ZERO mocks.
 * One row per REAL step() title, grep-verified this session against
 * scripts/install.sh, scripts/install/common-deps.sh,
 * scripts/install/mode-tunnel.sh, scripts/install/deploy-livinityd.sh (the
 * exact 4 scripts 05-RESEARCH.md's inventory covers) -- 45 real titles total,
 * ~44 per the research estimate. This IS the Pitfall-1 regression guard: it
 * proves the CORRECTED bucket table classifies the installer's real
 * execution-order titles correctly, not the UI-SPEC's as-written (buggy)
 * table.
 */
describe('bucketForTitle', () => {
  // ---- Bucket 1: "Getting your system ready" ----

  it('install.sh:95 "Detecting platform" -> 1', () => {
    expect(bucketForTitle('Detecting platform')).toBe(1);
  });

  it('common-deps.sh:13 "Installing common dependencies (apt + Caddy + Redis tools)" -> 1 (common dependencies wins before bucket 2\'s Caddy/Redis keywords are even checked)', () => {
    expect(bucketForTitle('Installing common dependencies (apt + Caddy + Redis tools)')).toBe(1);
  });

  // ---- Bucket 2: "Connecting your domain" ----

  it('mode-tunnel.sh:43 "Installing cloudflared (Cloudflare Tunnel daemon)" -> 2', () => {
    expect(bucketForTitle('Installing cloudflared (Cloudflare Tunnel daemon)')).toBe(2);
  });

  it('mode-tunnel.sh:125 "Fetching Cloudflare Tunnel token from livinity.io API (Plan 140-07)" -> 2 (Pro-only step -- Free/BYOD already has an explicit tunnel token)', () => {
    expect(bucketForTitle('Fetching Cloudflare Tunnel token from livinity.io API (Plan 140-07)')).toBe(2);
  });

  it('mode-tunnel.sh:168 "Writing Cloudflare Tunnel token secret" -> 2', () => {
    expect(bucketForTitle('Writing Cloudflare Tunnel token secret')).toBe(2);
  });

  it('mode-tunnel.sh:228 "Registering cloudflared as a systemd service" -> 2', () => {
    expect(bucketForTitle('Registering cloudflared as a systemd service')).toBe(2);
  });

  it('mode-tunnel.sh:307 "Configuring Caddy for tunnel mode (plain HTTP on :80)" -> 2', () => {
    expect(bucketForTitle('Configuring Caddy for tunnel mode (plain HTTP on :80)')).toBe(2);
  });

  it('mode-tunnel.sh:493 "Persisting tunnel-mode markers to Redis" -> 2', () => {
    expect(bucketForTitle('Persisting tunnel-mode markers to Redis')).toBe(2);
  });

  it('mode-tunnel.sh:511 "Saving marketplace API key" -> 2 (the Pitfall-1 fix: this matched NOTHING in the UI-SPEC\'s as-written table and fell through to bucket 6 early)', () => {
    expect(bucketForTitle('Saving marketplace API key')).toBe(2);
  });

  it('mode-tunnel.sh:536 "Saving Cloudflare API token (BYO-domain per-app DNS)" -> 2', () => {
    expect(bucketForTitle('Saving Cloudflare API token (BYO-domain per-app DNS)')).toBe(2);
  });

  // ---- Bucket 3: "Installing LivOS components" ----

  it('deploy-livinityd.sh:106 "Plan 104-11 — system packages (Node 22 + pnpm + postgresql + redis-server)" -> 3', () => {
    expect(bucketForTitle('Plan 104-11 — system packages (Node 22 + pnpm + postgresql + redis-server)')).toBe(3);
  });

  it('deploy-livinityd.sh:284 "Plan 104-11 — PostgreSQL setup" -> 3', () => {
    expect(bucketForTitle('Plan 104-11 — PostgreSQL setup')).toBe(3);
  });

  it('deploy-livinityd.sh:388 "Plan 104-11 — Redis setup" -> 3', () => {
    expect(bucketForTitle('Plan 104-11 — Redis setup')).toBe(3);
  });

  it('deploy-livinityd.sh:470 "...create desktop user (sudo + docker groups...)" -> 3 (MOVED per Pitfall 1: fires 7th in real order, right after Postgres/Redis -- NOT bucket 4)', () => {
    expect(
      bucketForTitle(
        'Phase 106 Bug #10 / 262 WS3 — create desktop user (sudo + docker groups; scoped sudoers fragment only)',
      ),
    ).toBe(3);
  });

  it('deploy-livinityd.sh:621 "Plan 104-11/104-12 — clone livinity-io source" -> 3', () => {
    expect(bucketForTitle('Plan 104-11/104-12 — clone livinity-io source')).toBe(3);
  });

  it('deploy-livinityd.sh:748 "Installing Docker engine (fresh boxes ship without it)" -> 3', () => {
    expect(bucketForTitle('Installing Docker engine (fresh boxes ship without it)')).toBe(3);
  });

  it('deploy-livinityd.sh:835 "105-02 (G2) — streaming subsystem dependencies (update.sh:339-405)" -> 3', () => {
    expect(bucketForTitle('105-02 (G2) — streaming subsystem dependencies (update.sh:339-405)')).toBe(3);
  });

  it('deploy-livinityd.sh:958 "...install google-chrome-stable (WebApp Launcher blocker)" -> 3', () => {
    expect(bucketForTitle('Phase 106 Bug #9 — install google-chrome-stable (WebApp Launcher blocker)')).toBe(3);
  });

  it('deploy-livinityd.sh:1046 "...write pnpm .npmrc (block-exotic-subdeps=false for baileys → libsignal)" -> 3', () => {
    expect(
      bucketForTitle('Plan 104-13 — write pnpm .npmrc (block-exotic-subdeps=false for baileys → libsignal)'),
    ).toBe(3);
  });

  it('deploy-livinityd.sh:1082 "...pnpm install + build (@livos/config + ui)" -> 3', () => {
    expect(bucketForTitle('Plan 104-11/104-12 — pnpm install + build (@livos/config + ui)')).toBe(3);
  });

  it('deploy-livinityd.sh:1151 "...npm install + build liv stack (core, worker, mcp-server, memory)" -> 3', () => {
    expect(bucketForTitle('Plan 104-12 — npm install + build liv stack (core, worker, mcp-server, memory)')).toBe(3);
  });

  it('deploy-livinityd.sh:1206 "...sync liv dist into livinityd\'s pnpm-store" -> 3', () => {
    expect(bucketForTitle("Plan 104-12 — sync liv dist into livinityd's pnpm-store")).toBe(3);
  });

  it('deploy-livinityd.sh:1257 "...verify livinityd\'s @liv/core import path" -> 3', () => {
    expect(bucketForTitle("Phase 132-05 — verify livinityd's @liv/core import path")).toBe(3);
  });

  it('deploy-livinityd.sh:2646 "Flatpak runtime (native/Flathub app installs)" -> 3 (MOVED per Pitfall 1 -- NOT bucket 6)', () => {
    expect(bucketForTitle('Flatpak runtime (native/Flathub app installs)')).toBe(3);
  });

  it('deploy-livinityd.sh:2767 "Build-memory guard (RAM+swap vs the vite/Next build chain)" -> 3 (MOVED per Pitfall 1: fires 3rd in real order, immediately after system packages/Docker -- NOT late/bucket 6)', () => {
    expect(bucketForTitle('Build-memory guard (RAM+swap vs the vite/Next build chain)')).toBe(3);
  });

  it('deploy-livinityd.sh:2816 "Port preflight (8080 / 3010 / 3020 / 3200)" -> 3 (MOVED per Pitfall 1: fires 4th in real order -- NOT late/bucket 6)', () => {
    expect(bucketForTitle('Port preflight (8080 / 3010 / 3020 / 3200)')).toBe(3);
  });

  it('deploy-livinityd.sh:2990 "...deploying livinityd + liv stack (full LivOS application stack)" -> 3 (the umbrella step -- fires FIRST in the real file but matched NOTHING in the UI-SPEC table; MOVED here per Pitfall 1 fix #4, not left as an unmatched catch-all)', () => {
    expect(
      bucketForTitle(
        'Plan 104-11/104-12/105-02 / 109 / 112 — deploying livinityd + liv stack (full LivOS application stack)',
      ),
    ).toBe(3);
  });

  // ---- Bucket 4: "Configuring your server" ----

  it('deploy-livinityd.sh:1311 "...JWT secret (64-hex, no newline)" -> 4', () => {
    expect(bucketForTitle('Plan 104-11 / 106 Bug #11 — JWT secret (64-hex, no newline)')).toBe(4);
  });

  it('deploy-livinityd.sh:1350 "Plan 104-11 — write /opt/livos/.env" -> 4', () => {
    expect(bucketForTitle('Plan 104-11 — write /opt/livos/.env')).toBe(4);
  });

  it('deploy-livinityd.sh:1448 "...seed liv:mcp:config (HASH, sequential-thinking + luse)" -> 4', () => {
    expect(bucketForTitle('Phase 109 — seed liv:mcp:config (HASH, sequential-thinking + luse)')).toBe(4);
  });

  it('deploy-livinityd.sh:1650 "...seed livos:domain:config from local_mode keys" -> 4', () => {
    expect(bucketForTitle('Phase 112 — seed livos:domain:config from local_mode keys')).toBe(4);
  });

  it('deploy-livinityd.sh:1848 "...seed livos:v43:terminal_panel=true" -> 4', () => {
    expect(bucketForTitle('Phase 252 (R10) — seed livos:v43:terminal_panel=true')).toBe(4);
  });

  it('deploy-livinityd.sh:1908 "...seed livos:platform:api_key from --api-key flag" -> 4 (REMOVED the bare "desktop user" collision from this bucket per Pitfall 1 -- it belongs to bucket 3\'s EARLY create-desktop-user step, not here)', () => {
    expect(bucketForTitle('v34 — seed livos:platform:api_key from --api-key flag')).toBe(4);
  });

  // ---- Bucket 5: "Starting Livinity" ----

  it('deploy-livinityd.sh:1950 "...systemd unit livos.service" -> 5', () => {
    expect(bucketForTitle('Plan 104-11/104-12/105-05 — systemd unit livos.service')).toBe(5);
  });

  it('deploy-livinityd.sh:2054 "...systemd units for liv-core/liv-worker/liv-memory" -> 5', () => {
    expect(bucketForTitle('Plan 104-12 — systemd units for liv-core/liv-worker/liv-memory')).toBe(5);
  });

  it('deploy-livinityd.sh:2131 "Plan 104-11 — health check livinityd :8080" -> 5', () => {
    expect(bucketForTitle('Plan 104-11 — health check livinityd :8080')).toBe(5);
  });

  it('deploy-livinityd.sh:2169 "...install liv-assistant (vendored AionUi :3020) + unit" -> 5', () => {
    expect(bucketForTitle('Phase 223/225 — install liv-assistant (vendored AionUi :3020) + unit')).toBe(5);
  });

  it('a synthetic title matching ONLY the "reverse_proxy 127.0.0.1:8080" keyword (no "Caddy" substring) -> 5, proving the bucket-5 keyword itself is reachable in isolation', () => {
    expect(bucketForTitle('Health-check reverse_proxy 127.0.0.1:8080 route')).toBe(5);
  });

  it('deploy-livinityd.sh:2259 "Plan 104-11 — update Caddy to reverse_proxy 127.0.0.1:8080" -> 2, NOT 5 (documented ordering nuance, not a Pitfall-1 regression: bucket 2\'s generic "Caddy" keyword matches before bucket 5\'s specific "reverse_proxy 127.0.0.1:8080" keyword is ever checked; harmless because by the time this step fires the caller has already advanced past 5, and the caller\'s max(currentIndex, matchedBucket) rule never regresses -- see 05-RESEARCH.md Pattern 2 step 3)', () => {
    expect(bucketForTitle('Plan 104-11 — update Caddy to reverse_proxy 127.0.0.1:8080')).toBe(2);
  });

  // ---- Bucket 6: "Finishing up" (explicit keyword list, not a blind catch-all) ----

  it('deploy-livinityd.sh:2515 "...UFW deny :8080 from the LAN (defense in depth)" -> 6', () => {
    expect(bucketForTitle('257-02 (WS-C / LIVOS-015) — UFW deny :8080 from the LAN (defense in depth)')).toBe(6);
  });

  it('deploy-livinityd.sh:2548 "...update gallery cache (update.sh:596-610)" -> 6', () => {
    expect(bucketForTitle('105-02 (G5) — update gallery cache (update.sh:596-610)')).toBe(6);
  });

  it('deploy-livinityd.sh:2575 "...fix permissions (update.sh:612-622)" -> 6', () => {
    expect(bucketForTitle('105-02 (G6) — fix permissions (update.sh:612-622)')).toBe(6);
  });

  it('deploy-livinityd.sh:2669 "...bruce user migration (idempotent)" -> 6', () => {
    expect(bucketForTitle('Phase 192-02 — bruce user migration (idempotent)')).toBe(6);
  });

  it('deploy-livinityd.sh:2745 "...v35 → v38 vault rename (idempotent)" -> 6', () => {
    expect(bucketForTitle('Phase 173-01 — v35 → v38 vault rename (idempotent)')).toBe(6);
  });

  it('deploy-livinityd.sh:2855 "...template app units + native sudoers to ${_DLD_DESKTOP_USER}" -> 6', () => {
    expect(bucketForTitle('Phase 278 — template app units + native sudoers to ${_DLD_DESKTOP_USER}')).toBe(6);
  });

  it('deploy-livinityd.sh:2921 "...cleanup + .deployed-sha (update.sh:657-682)" -> 6', () => {
    expect(bucketForTitle('105-02 (G7+G9) — cleanup + .deployed-sha (update.sh:657-682)')).toBe(6);
  });

  // ---- The core Pitfall-1 regression guard ----

  it('an unknown/unmapped title -> null, so the caller does NOT advance (never falls through to a catch-all bucket)', () => {
    expect(bucketForTitle('some unknown umbrella step nobody mapped')).toBeNull();
  });

  it('an empty string -> null', () => {
    expect(bucketForTitle('')).toBeNull();
  });

  it('bucket matching is case-insensitive', () => {
    expect(bucketForTitle('DETECTING PLATFORM')).toBe(1);
  });
});
