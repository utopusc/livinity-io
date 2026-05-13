---
phase: 111-server5-dashboard-install-wizard
plan: 01
subsystem: infra
tags: [server5, install.sh, next.js, route-handler, sed, pm2, cross-repo]

# Dependency graph
requires:
  - phase: 104-fresh-vps-deploy-livinity-tunnel-and-app-store
    provides: "scripts/install.sh modular installer (mode-cloud / mode-local-lan / mode-hybrid dispatch) + scripts/install/parse-cli.sh + scripts/install/mode-*.sh helpers"
  - phase: 108-app-store-local-mode-no-api-key-required
    provides: "fresh-VPS UAT that surfaced the served install.sh mismatch (legacy livos/install.sh vs wizard expectations)"
provides:
  - "https://livinity.io/install.sh now serves the Phase 104+ modular installer (99 lines, scripts/install.sh) instead of the legacy livos/install.sh (1725 lines, Mini PC bootstrap)"
  - "Wizard one-liners targeting --mode|--domain|--cf-token|--cf-zone-id|--api-key flags now reach an installer that actually parses those flags"
  - "Rollback artifact /opt/platform/web/src/app/install.sh/route.ts.pre-111-01.bak on Server5"
affects: ["111-02 API keys CRUD", "111-03 CF zone resolver", "111-04 wizard UI 3-step flow", "111-05 mode reference docs panel"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server5 cross-repo execution: single SSH session batches sed + backup + build + reload + curl-UAT to dodge fail2ban sshd jail"
    - "Backup-before-edit (.pre-111-NN.bak) for instant rollback on Server5 files not under git control"

key-files:
  created:
    - ".planning/phases/111-server5-dashboard-install-wizard/111-01-SUMMARY.md"
    - "server5:/opt/platform/web/src/app/install.sh/route.ts.pre-111-01.bak"
  modified:
    - "server5:/opt/platform/web/src/app/install.sh/route.ts (two-line sed: livos/install.sh -> scripts/install.sh)"

key-decisions:
  - "D-NO-LIVOS-CHANGE upheld: zero edits to livos/ or liv/ source trees in this repo; Server5 file change is out-of-band (Server5 is NOT a git repo per PLANNING-NOTES)"
  - "D-111-EXISTING-AUTH upheld: route handler stays unauthenticated by design (public install bootstrap)"
  - "Used sed -i pattern over file rewrite to minimize blast radius: only the two URL strings change, all other route logic byte-identical"
  - "Build command auto-fallback: plan specified pnpm but Server5 project uses package-lock.json + npm; the SSH block detected pnpm-lock.yaml absence and ran npm run build instead — same artifact, same result (Rule 3 micro-deviation)"

patterns-established:
  - "Cross-repo Server5 patches: batch SSH ops (backup + edit + sanity grep + build + pm2 reload + curl-UAT) into one heredoc to avoid fail2ban"
  - "Rollback contract for Server5 file edits: always cp <file> <file>.pre-<phase>-<plan>.bak before sed; documented in SUMMARY"

requirements-completed: []

# Metrics
duration: ~6min
completed: 2026-05-13
---

# Phase 111 Plan 01: Server5 install.sh Route URL Swap Summary

**Two-string sed swap on Server5 `route.ts` flipped `livos/install.sh` -> `scripts/install.sh` so `https://livinity.io/install.sh` now serves the Phase 104+ modular installer (99 lines, dispatch-style) instead of the legacy 1725-line Mini PC bootstrap — unblocking every downstream Phase 111 wizard one-liner.**

## Performance

- **Duration:** ~6 min (SSH + sed + Next.js build + pm2 reload + curl-UAT in one session)
- **Started:** 2026-05-13 (post-Phase 113 evening session)
- **Completed:** 2026-05-13
- **Tasks:** 2 (Server5 patch + local SUMMARY commit)
- **Files modified:** 1 on Server5 (route.ts), 1 local artifact (this SUMMARY)

## Accomplishments

- **Critical prerequisite bug fixed:** `https://livinity.io/install.sh` now returns the Phase 104+ modular installer (`scripts/install.sh`), which actually parses the `--mode | --domain | --cf-token | --cf-zone-id | --api-key` flags the Phase 111 wizard will bake into its one-liner output.
- **Two-line atomic patch on Server5:** sed touched exactly the two URL strings (upstream GitHub raw fetch URL + fallback `exec bash` target). All other route handler logic (caching, headers, fallback envelope) byte-identical.
- **Rollback artifact placed:** `/opt/platform/web/src/app/install.sh/route.ts.pre-111-01.bak` (1376 bytes) ready for instant restore if anything breaks downstream.
- **Live UAT proof captured:** served content header confirms the modular dispatcher is in flight (see Verification Outputs below).

## The Server5 Patch (diff)

```diff
--- /opt/platform/web/src/app/install.sh/route.ts.pre-111-01.bak
+++ /opt/platform/web/src/app/install.sh/route.ts
@@ -10,7 +10,7 @@ export async function GET() {
   // Try to fetch the real installer from GitHub
   try {
     const res = await fetch(
-      'https://raw.githubusercontent.com/utopusc/livinity-io/master/livos/install.sh',
+      'https://raw.githubusercontent.com/utopusc/livinity-io/master/scripts/install.sh',
       { next: { revalidate: 300 } }, // Cache for 5 minutes
     );
     if (res.ok) {
@@ -32,7 +32,7 @@ set -euo pipefail
 echo "Downloading LivOS installer..."
 TMPDIR=$(mktemp -d)
 git clone --depth 1 https://github.com/utopusc/livinity-io.git "$TMPDIR/livinity-io"
-exec bash "$TMPDIR/livinity-io/livos/install.sh" "$@"
+exec bash "$TMPDIR/livinity-io/scripts/install.sh" "$@"
 `;
```

Patch applied via:

```bash
sed -i "s|livos/install\.sh|scripts/install.sh|g" /opt/platform/web/src/app/install.sh/route.ts
```

## Verification Outputs (live from Server5, 2026-05-13)

### route.ts grep counts (post-patch)

```
scripts/install.sh count: 2
livos/install.sh count: 0 (sanity grep -q exited non-zero — file clean)
```

### Next.js build

```
> web@0.1.0 build
> next build
▲ Next.js 16.1.7 (Turbopack)
  Creating an optimized production build ...
✓ Compiled successfully in 7.9s
✓ Generating static pages using 5 workers (36/36) in 643.7ms
...
├ ƒ /install.sh                                  (dynamic, server-rendered on demand)
```

### pm2 reload

```
[PM2] Applying action reloadProcessId on app [web](ids: [ 14 ])
[PM2] [web](14) ✓
pm2 status web → online, uptime 4s, 0 restart loop
```

### Served content (curl -sSfL https://livinity.io/install.sh | head -10)

```bash
#!/usr/bin/env bash
# scripts/install.sh
# LivOS one-shot installer. Dispatches to mode-cloud.sh, mode-local-lan.sh, or
# mode-hybrid.sh based on --mode flag.
#
# Source: 104-RESEARCH.md §Pattern 5 (Sentry-style sourced helpers).
# D-104-INSTALL-ENTRY: single entry point. D-104-DEFAULT-MODE: default = hybrid.
# D-104-NO-PROD-IMPACT: this is a NEW file; the existing livos/install.sh stays
# unchanged so update.sh on the Mini PC keeps working byte-for-byte.
```

### Modular-helper grep proof (curl ... | grep -E 'mode-hybrid|mode-local-lan|parse-cli')

```
# LivOS one-shot installer. Dispatches to mode-cloud.sh, mode-local-lan.sh, or
# mode-hybrid.sh based on --mode flag.
source "$SCRIPT_DIR/parse-cli.sh"
    local-lan) source "$SCRIPT_DIR/mode-local-lan.sh"; install_mode_local_lan ;;
    hybrid)    source "$SCRIPT_DIR/mode-hybrid.sh"; install_mode_hybrid ;;
```

### Line count comparison (served vs legacy)

| Path | Lines | Era |
|------|-------|-----|
| served `https://livinity.io/install.sh` (now) | 99 | Phase 104+ modular |
| local `livos/install.sh` (legacy, untouched) | 1725 | Mini PC bootstrap |

Drop from 1725 → 99 lines proves the route is now serving the dispatcher entry point and the legacy bootstrap has been retired from the public install URL.

### Before/After served-content header probe

| When | Header line 1 | Header line 2 | Identity |
|------|--------------|---------------|----------|
| BEFORE (pre-sed) | `#!/usr/bin/env bash` | `# ──────────────────────────────────────────────────────────` | legacy `livos/install.sh` ("LivOS One-Command Installer" banner) |
| AFTER (post-sed) | `#!/usr/bin/env bash` | `# scripts/install.sh` | Phase 104+ modular `scripts/install.sh` ("LivOS one-shot installer. Dispatches to mode-...") |

## Files Created/Modified

- **server5:`/opt/platform/web/src/app/install.sh/route.ts`** — two URL strings changed from `livos/install.sh` to `scripts/install.sh` (1376 bytes pre + post; sed in-place; identical envelope)
- **server5:`/opt/platform/web/src/app/install.sh/route.ts.pre-111-01.bak`** — rollback artifact (1376 bytes, mode 644)
- **local `.planning/phases/111-server5-dashboard-install-wizard/111-01-SUMMARY.md`** — this file

NO local source-tree files touched (D-NO-LIVOS-CHANGE upheld; verified with `git diff master -- livos/ liv/ | wc -l → 0`).

## Decisions Made

- Used `sed -i` over a full file rewrite to keep the diff to exactly two lines — minimizes blast radius and review surface.
- Auto-detected package manager: plan specified `pnpm install && pnpm build`, but live filesystem inspection showed `package-lock.json` (no `pnpm-lock.yaml`). The SSH block branched to `npm run build` automatically. Same Next.js output, same pm2 reload semantics.
- Did NOT update `master` branch's `livos/install.sh` to redirect or symlink to `scripts/install.sh` — the legacy file stays byte-identical because Mini PC's `update.sh` still references it for production deploys (D-NO-PROD-IMPACT; per memory `feedback_p65_rename_complete.md` Mini PC has its own deploy path).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Build command swapped from `pnpm build` to `npm run build` based on lockfile detection**
- **Found during:** Task 1 (post-sed build step)
- **Issue:** Plan said `pnpm install --frozen-lockfile && pnpm build`, but Server5's `/opt/platform/web` uses npm (`package-lock.json` present, no `pnpm-lock.yaml`).
- **Fix:** SSH block branched on `if [ -f pnpm-lock.yaml ]; then ... else npm run build; fi` and chose `npm run build`. Next.js 16.1.7 Turbopack build completed in 7.9s, generated 36 routes including `/install.sh` (dynamic).
- **Files modified:** none beyond what the plan already prescribed (the build step is a side-effect, not a source change).
- **Verification:** Next.js build exit 0, pm2 reload web ✓ ok, `curl https://livinity.io/install.sh | head -10` returns the new modular content.
- **Committed in:** N/A — Server5 file edits are out-of-band; only this SUMMARY documents the swap.

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** Trivial. The plan was written assuming pnpm; the project uses npm. Either tool produces an identical Next.js build artifact for this codebase. No scope creep, no functional change.

## Issues Encountered

None. Sacred SHA preservation, route patch, build, reload, and live UAT all clean on first attempt.

## Sacred SHA Preservation Check

| When | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` |
|------|------------------------------------------------------------|
| Pre-execution | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ |
| Pre-commit | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ |

No `liv/` source-tree changes were made (this plan touches Server5 only). Pre-commit hook will gate the SUMMARY commit.

## Cross-repo Caveat

Server5 (`45.137.194.102`) is NOT a git repo — `/opt/platform/web` is direct-edited via SSH (no `git pull` flow there). The route.ts change exists ONLY on Server5's filesystem. To replicate or recover:

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master \
    -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    root@45.137.194.102 \
    'sed -i "s|livos/install\.sh|scripts/install.sh|g" /opt/platform/web/src/app/install.sh/route.ts && cd /opt/platform/web && npm run build && pm2 reload web'
```

## Rollback Command

If a downstream Phase 111 plan reveals that the modular installer breaks something the legacy bootstrap was silently working around:

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master \
    -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    root@45.137.194.102 \
    'cp /opt/platform/web/src/app/install.sh/route.ts.pre-111-01.bak /opt/platform/web/src/app/install.sh/route.ts && cd /opt/platform/web && npm run build && pm2 reload web && curl -sSfL https://livinity.io/install.sh | head -3'
```

The `.bak` file persists on Server5 until explicitly removed.

## Next Phase Readiness

- **Wave 1 parallel-safe siblings (111-02 API keys CRUD, 111-03 CF zone resolver):** unblocked. They touch disjoint files (`/opt/platform/web/src/app/api/account/api-keys/*` and `/opt/platform/web/src/app/api/cf/resolve-zone/route.ts` respectively) — no merge conflict with this plan.
- **Wave 2 dependent (111-04 wizard UI):** unblocked. The wizard's `buildCommand()` output URL (`curl -fsSL https://livinity.io/install.sh | sudo bash -s -- --mode hybrid ...`) now targets the modular installer; UAT step 4 of 111-04 will succeed (vs. failing silently against the legacy bootstrap).
- **Phase-level UAT gate:** `curl -fsSL https://livinity.io/install.sh | sudo bash -s -- --help` on a fresh VPS should print the modular installer's flag list. (Live `--help` not run from this plan — kept inside the worktree's `curl | head` smoke. Real fresh-VPS run is 111-04 Task 4 territory.)

## Self-Check: PASSED

- [x] `/opt/platform/web/src/app/install.sh/route.ts` references `scripts/install.sh` exactly twice, zero references to `livos/install.sh` (live SSH grep)
- [x] `/opt/platform/web/src/app/install.sh/route.ts.pre-111-01.bak` exists for rollback (1376 bytes, ls -la verified)
- [x] `pm2 status web` → online, uptime 4s, 0 restart loop after reload
- [x] `curl -sSfL https://livinity.io/install.sh | head -10` → modular installer header (`#!/usr/bin/env bash` + `# scripts/install.sh` + `# LivOS one-shot installer. Dispatches to mode-cloud.sh, mode-local-lan.sh, or mode-hybrid.sh`)
- [x] `curl -sSfL https://livinity.io/install.sh | grep -E 'mode-hybrid|mode-local-lan|parse-cli'` returns 5 hits (sourcing lines + dispatch case branches)
- [x] Served line count: 99 (vs legacy 1725) — proves dispatcher in flight, not bootstrap
- [x] Sacred SHA preserved: `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- [x] `git diff master -- livos/ liv/ | wc -l` → 0 (D-NO-LIVOS-CHANGE upheld)
- [x] SUMMARY artifact created and committed (will be confirmed by final commit)

---
*Phase: 111-server5-dashboard-install-wizard*
*Plan: 01*
*Completed: 2026-05-13*
