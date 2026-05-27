---
phase: 235
plan: 01
subsystem: liv-assistant
tags: [hotfix, install-script, iframe, sed, idempotent, sacred-sha-preserved]
requires:
  - Phase 226 (Caddy /liv reverse proxy)
  - Phase 227 (LivAssistantWindow component)
  - Phase 234-02 (LIVINITY_liv-assistant systemApps entry + icon ref)
  - Phase 234-03 (install-liv-assistant.sh rebrand block — Phase 235 inserts AFTER)
  - Phase 234-04 (/liv-login auto-login handler)
provides:
  - install-liv-assistant.sh `count_unprefixed_paths()` helper (pipefail-safe pattern, reusable)
  - install-liv-assistant.sh Phase 235 path-rewrite block (idempotent /api/ -> /liv/api/, /ws -> /liv/ws)
  - apps.tsx ?v=235 cache-bust on dock-ai-chat icon
affects:
  - bruce.livinity.io/liv/* iframe API surface (now 200 instead of 404 at root)
tech-stack:
  added: []
  patterns:
    - "Pipefail-safe command substitution wrapper (set +o pipefail in helper function, always return 0)"
    - "Path-prefix rewrite for iframe-mounted SPAs whose bundle issues root-relative API calls"
    - "Cache-bust query string for asset URLs to force operator browser refetch"
key-files:
  created:
    - .planning/phases/235-liv-ai-hotfix-paths/235-PLAN.md
    - .planning/phases/235-liv-ai-hotfix-paths/235-DEPLOY-LOG.md
    - .planning/phases/235-liv-ai-hotfix-paths/235-SUMMARY.md
  modified:
    - scripts/install-liv-assistant.sh (+50 LOC Phase 235 block + count_unprefixed_paths helper)
    - livos/packages/ui/src/providers/apps.tsx (icon ref +?v=235)
    - livos/packages/ui/src/modules/desktop/dock.test.tsx (mock + click assertion +?v=235)
decisions:
  - "Pipefail-safe pattern via helper function (count_unprefixed_paths) — cleaner than `|| true` sprinkled inline; keeps the rest of install-liv-assistant.sh hard-failing on real errors."
  - "Cache-bust ?v=235 chosen over operator hard-reload instruction — automatic + idempotent + doesn't require operator action. Static asset version-bump is the canonical pattern for forcing client refetch."
  - "Path rewrite scope kept to ${CURRENT_LINK}/static/ (same as Phase 234-03 rebrand) — D-V42-APACHE-NOTICE structural enforcement preserved (LICENSE/NOTICE at INSTALL_ROOT, outside the static/ walk)."
metrics:
  duration: ~15 minutes
  completed: 2026-05-27
  tasks: 3
  commits: 4
  files_modified: 3
  files_created: 3
sacred-sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred-sha-status: UNCHANGED
mini-pc-deployed-sha: 541848a5
sc-pass: 5
sc-total: 5
---

# Phase 235 Plan 01: Liv AI hot-fix — absolute API path rewrite + icon visibility — Summary

**One-liner:** Vendored AionUi JS bundle absolute-path rewrite (`/api/` → `/liv/api/`, `/ws` → `/liv/ws`) via idempotent sed extension to install-liv-assistant.sh + dock-ai-chat icon cache-bust (`?v=235`), shipped LIVE on Mini PC with 5/5 SCs GREEN post-fix.

## Why this plan

Operator opened https://bruce.livinity.io in browser post-Phase 234 deploy and saw console errors:
```
GET https://bruce.livinity.io/api/settings/client 404
GET https://bruce.livinity.io/api/auth/user 404
GET https://bruce.livinity.io/api/agents 404
WebSocket connection to 'wss://bruce.livinity.io/ws' failed
```

The vendored AionUi JS bundle issues root-relative paths that bypass the Caddy `LIV_ASSISTANT_HANDLE` `/liv /liv/*` matcher — those requests hit the LivOS shell at root domain and 404. AionUi falls back to login UI despite Plan 234-04 setting the `aionui-session` cookie correctly. Compound effect: the Plan 234-04 auto-login was working perfectly (verified externally), but the iframe SPA couldn't bootstrap because its API requests landed at the wrong origin path.

Dock tile separately showed blank — investigation proved icon file IS present and HTTP 200 on Mini PC; root cause was operator browser cache from pre-Plan-234-02 404.

## What was built

### 1. install-liv-assistant.sh extension (commit `ed618706`)

New idempotent sed block inserted between the Phase 234-03 rebrand block and the LICENSE+NOTICE defensive grep loop:

```bash
# Patterns covered:
#   "/api/  -> "/liv/api/
#   '/api/  -> '/liv/api/
#   `/api/  -> `/liv/api/
#   "/ws"   -> "/liv/ws"
#   '/ws'   -> '/liv/ws'
#   `/ws`   -> `/liv/ws`
```

Idempotency guard: counts files containing UNPREFIXED quoted forms whose content does NOT yet carry the PREFIXED form. Zero such files → log `skipping sed pass` + no-op. RUN-B of update.sh proved this works (`Path rewrite: absolute API/WS paths already prefixed (or absent); skipping sed pass`).

### 2. Icon cache-bust (commit `5048b246`)

`livos/packages/ui/src/providers/apps.tsx` line 132: `'/figma-exports/dock-ai-chat.svg'` → `'/figma-exports/dock-ai-chat.svg?v=235'`. Mirror update to `dock.test.tsx` mock + click-contract assertion. 4/4 vitest GREEN locally.

### 3. Pipefail-safe helper (commit `541848a5` — Rule 1+3 auto-fix during deploy)

First Mini PC deploy of commits `ed618706`+`5048b246` failed because `grep -L` exits 1 when zero files print, which under `set -euo pipefail` killed the parent shell at command-substitution time, before my Phase 235 block could log anything. Diagnosed via on-Mini-PC `bash -c` repro with vs. without pipefail.

Fix: extracted the grep pipeline into a `count_unprefixed_paths()` function that locally toggles pipefail off + always echoes a numeric result + always returns 0. Re-enables pipefail at function exit. Same pattern applied to both PRE-count and POST-count call sites.

## Mini PC deploy evidence

```
RUN-A update.sh exit=0
  [install-liv-assistant] Path rewrite: applying /api/ -> /liv/api/ and /ws -> /liv/ws sed pass on 4 files
  [install-liv-assistant] Path rewrite: post-pass unprefixed-only file count = 0
  Deployed SHA recorded: 541848a

RUN-B update.sh exit=0 (idempotency)
  [install-liv-assistant] Path rewrite: absolute API/WS paths already prefixed (or absent); skipping sed pass
```

External post-fix verification (Cloudflare → Server5 → Mini PC tunnel → Caddy → :3020):

| Endpoint | Pre-fix | Post-fix |
|----------|---------|----------|
| `https://bruce.livinity.io/liv/api/settings/client` | HTTP 404 (LivOS shell SPA fallback) | **HTTP 200 + Content-Type: application/json + 26 bytes** |
| `https://bruce.livinity.io/liv/api/auth/user` | HTTP 404 | **HTTP 403** (auth gate — AionUi reached) |
| `https://bruce.livinity.io/liv/api/agents` | HTTP 404 | **HTTP 200** |
| `https://bruce.livinity.io/liv/` (HTML body) | `<title>Liv AI</title>` + 0 AionUi | Unchanged (no regression) |
| `https://bruce.livinity.io/liv/api/auth/status` | `{...is_authenticated:false}` | Unchanged |
| `https://bruce.livinity.io/liv-login` | 302 + Set-Cookie aionui-session | Unchanged |

## Invariants honored

- **D-V42-SACRED:** sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED. Pre-commit hook `[sacred-sha] PASS: 20 files verified` on all 4 Phase 235 commits. Mini PC sha256 `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` PRE = POST = RUN-B. Zero edits under `liv/packages/core/`.
- **D-V42-APACHE-NOTICE:** LICENSE sha256 `a515d5a7...` + NOTICE sha256 `be9e969f...` byte-identical PRE/POST. Structural enforcement via scope (`${REBRAND_TARGET}=${CURRENT_LINK}/static/`, LICENSE+NOTICE at `${INSTALL_ROOT}/` outside the find walk).
- **D-V42-IDEMPOTENT:** RUN-B exit=0, idempotency log line confirmed, file counts identical PRE-B/POST-B.
- **HARD-RULE Mini PC ONLY:** No Server4/5 touched. Mini PC `bruce@10.69.31.68` is the only deploy target.

## Deviations from plan

### Auto-fixed Issues

**1. [Rule 1+3 — Bug + Blocking] Pipefail incompatibility in grep pipeline**

- **Found during:** Task 3 (first Mini PC deploy)
- **Issue:** `update.sh exit=1` with `[FAIL] install-liv-assistant.sh failed`. Phase 235 block's `PATH_PRE_HITS="$(grep ... | xargs grep -L ... | wc -l)"` died silently under `set -euo pipefail` because `grep -L` exits 1 when zero files print.
- **Fix:** Wrapped the grep pipeline in a `count_unprefixed_paths()` helper that locally toggles pipefail off, always echoes a numeric result, always returns 0.
- **Files modified:** `scripts/install-liv-assistant.sh`
- **Commit:** `541848a5`
- **Rule:** Rule 1 (bug — script doesn't work as intended) + Rule 3 (blocking — couldn't complete Task 3 verification without it).

### No other deviations

Plan executed as written except for the pipefail fix. Operator did not need to intervene.

## Operator action post-deploy

Hard-reload browser (Ctrl+F5 / Cmd+Shift+R) once to refetch the cached
404s. Cache-bust `?v=235` forces fresh fetch of the icon automatically.
Subsequent iframe loads use the now-prefixed JS bundle paths.

## Self-Check: PASSED

All files exist + all commits present + sacred SHA byte-identical:

- [x] `scripts/install-liv-assistant.sh` — Phase 235 block + `count_unprefixed_paths` helper present
- [x] `livos/packages/ui/src/providers/apps.tsx` — `?v=235` cache-bust on icon
- [x] `livos/packages/ui/src/modules/desktop/dock.test.tsx` — mock + assertion mirror `?v=235`, 4/4 GREEN
- [x] `.planning/phases/235-liv-ai-hotfix-paths/235-PLAN.md` — FOUND
- [x] `.planning/phases/235-liv-ai-hotfix-paths/235-DEPLOY-LOG.md` — FOUND
- [x] Commit `ed618706` (feat path rewrite) — FOUND, sacred-sha PASS
- [x] Commit `5048b246` (feat icon cache-bust) — FOUND, sacred-sha PASS
- [x] Commit `541848a5` (fix pipefail-safe) — FOUND, sacred-sha PASS
- [x] Sacred SHA UNCHANGED (repo + Mini PC sha256 byte-identical)
- [x] Mini PC update.sh RUN-A + RUN-B both EXIT 0
- [x] External `/liv/api/settings/client` HTTP 200 (was 404)
- [x] Phase 234 non-regression GREEN
