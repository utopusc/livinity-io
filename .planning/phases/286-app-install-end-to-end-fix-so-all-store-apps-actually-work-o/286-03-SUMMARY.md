---
phase: 286-app-install-end-to-end-fix
plan: 03
subsystem: apps / install resolution
tags: [catalog-precedence, builtin-apps, install, SC5]
wave: 2
requires: [286-01]
provides:
  - "BUILTIN_PRECEDENCE_ALLOWLIST (6 special builtins) + shouldPreferCatalog() decision helper"
  - "install() + installForUser() resolution chains flipped to catalog-first for non-allowlisted apps"
affects:
  - livos/packages/livinityd/source/modules/apps/apps.ts
tech-stack:
  added: []
  patterns: ["pure decision helper + ReadonlySet allowlist", "vitest unit tests (device-id.test.ts style)"]
key-files:
  created:
    - livos/packages/livinityd/source/modules/apps/builtin-precedence.ts
    - livos/packages/livinityd/source/modules/apps/builtin-precedence.test.ts
  modified:
    - livos/packages/livinityd/source/modules/apps/apps.ts
decisions:
  - "Task-1 checkpoint (autonomous:false) resolved to the plan's safe default 'approve-as-proposed' — the 6-app allowlist (portainer, open-webui, mirofish, bolt-diy, suna, bytebot-desktop), independently confirmed against the builtin-apps.ts flag audit."
metrics:
  duration: ~10m
  completed: 2026-06-19
  tasks: 3
  files: 3
  tsc-errors: 305
---

# Phase 286 Plan 03: Catalog > Builtin Precedence Summary

Flip install resolution from builtin-first to catalog-first for plain builtins (n8n et al.) so installs use the well-engineered catalog def (named volume + pinned image + unique port 41000-41534) instead of the stale shadowing builtin def; the 6 operator-curated special builtins (AI-broker / docker.sock / privileged) keep builtin precedence via an explicit allowlist.

## What Was Built

- **`builtin-precedence.ts`** — `BUILTIN_PRECEDENCE_ALLOWLIST` (ReadonlySet of the 6 special builtins) + pure `shouldPreferCatalog(appId, allowlist?)` returning `!allowlist.has(appId)`. Default-param binds the module allowlist.
- **`builtin-precedence.test.ts`** — 6 vitest cases (5 plan-specified behaviors + 1 default-binding sanity). All pass.
- **`apps.ts`** — added `import {shouldPreferCatalog} from './builtin-precedence.js'`; replaced both resolution chains (main `install()` ~:523-567 and `installForUser()` ~:1967-2000) with precedence-aware logic. When `preferCatalog` is true: `fetchPlatformTemplate` first, fall back to `generateAppTemplate`, else throw. When false (allowlisted special): `generateAppTemplate` first (old behavior preserved), fall back to catalog.

## Decisions Made

### Task 1 (checkpoint:decision, `autonomous: false`) — resolved to safe default

Per executor policy for non-autonomous decision tasks (apply the plan's safe default, do not block), Task 1 was resolved to option **`approve-as-proposed`**: the 6-app allowlist `[portainer, open-webui, mirofish, bolt-diy, suna, bytebot-desktop]`.

This default was independently verified against the live `builtin-apps.ts` source before pinning:
- `portainer` — docker.sock + privileged + `network_mode: host` (lines 150, 163-164, 169)
- `open-webui` — `requiresAiProvider: true` (line 548)
- `mirofish` — `requiresAiProvider: true` (line 1213)
- `bolt-diy` — `requiresAiProvider: true` + docker.sock (line 1262)
- `suna` — `requiresAiProvider: true` + docker.sock (lines 1346, 1483)
- `bytebot-desktop` — `privileged: true` (line 1535)

No plain builtin carries any of those flags, so the catalog cannot silently replace a curated def. If the operator later wants to expand the allowlist, edit the set in `builtin-precedence.ts` and Test 5's expected array.

## Deviations from Plan

### Auto-fixed / adjustments

**1. [Rule 3 - Blocking: stale line refs] Located real anchors instead of cited line numbers.**
- **Found during:** Task 3 — the plan cited `:491-513` and `:1900-1915`; Wave-1 (286-01) edits had shifted them.
- **Fix:** Grepped `generateAppTemplate|fetchPlatformTemplate` → main chain at :522-544, per-user chain at :1967-1982. Edited via exact-string match on the actual code.
- **Files modified:** apps.ts

**2. [Minor] Test file got a 6th case.**
- The plan specified 5 behavior tests; I added one extra ("uses the module-default allowlist when none is passed") to lock the default-param binding used by the apps.ts call sites (`shouldPreferCatalog(appId)` with no allowlist arg). Strictly additive — all 5 plan tests are present and pass.

No other deviations. `app.ts` and `reconcile-volume-ownership.ts` were NOT touched (per constraint). `fetchPlatformTemplate` / `generateAppTemplate` themselves unchanged — only call order flipped. The fail-safe is preserved: an app with no catalog entry still installs from the builtin (catalog returns null → builtin fallback), and the 6 specials still install builtin-first.

## Verification

- `npx vitest run source/modules/apps/builtin-precedence.test.ts` → **6/6 passed**.
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → **305** (baseline ≤305 held exactly; no new errors).
- `grep -n "import {shouldPreferCatalog}"` → matches (apps.ts:21).
- `grep -c "shouldPreferCatalog(appId)"` → **2** (install + per-user install).
- `grep -n "catalog>builtin"` → matches (apps.ts:523, :537, :1968).
- Read-verify: in `install()`, `fetchPlatformTemplate(appId)` (:535) is called BEFORE `generateAppTemplate(appId)` (:541) inside `if (preferCatalog)`. The `else` (allowlisted) branch still calls `generateAppTemplate` first (:551).

## Must-Haves Coverage (truths)

- ✅ App in BOTH builtin + catalog → catalog def used (preferCatalog=true tries catalog first).
- ✅ The 6 special builtins ALWAYS keep builtin precedence (allowlist → preferCatalog=false → builtin-first).
- ✅ Builtin-only app (no catalog entry) → still installs from builtin (catalog returns null → builtin fallback).
- ✅ Catalog-only app → still installs from catalog (preferCatalog=true; builtin returns null is the original behavior, now reached even faster).

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: livos/packages/livinityd/source/modules/apps/builtin-precedence.ts
- FOUND: livos/packages/livinityd/source/modules/apps/builtin-precedence.test.ts
- FOUND: livos/packages/livinityd/source/modules/apps/apps.ts (modified: import + 2 resolution chains)
- Tests 6/6 pass; tsc 305 (baseline).
- Changes left UNCOMMITTED per operator instruction.
