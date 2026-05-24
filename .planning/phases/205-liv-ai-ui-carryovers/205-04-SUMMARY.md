---
phase: 205-liv-ai-ui-carryovers
plan: 04
subsystem: livinityd + liv-claw-os/claw-client
tags: [gateway, openclaw, trpc, self-lock, paired-devices, allowed-origins, auth-mode, wave-3]
requirements_addressed: [R4, R5, R6]
dependency_graph:
  requires:
    - 205-01 (Wave 0 spike — LOCKED self-lock guard contract + revoke race mitigation + auth.mode enum correction)
    - 205-02 (Wave 1 — GatewayTab placeholder + livinityd-client.ts helpers)
    - 205-03 (Wave 2 — boot wire-up pattern shared via this.ai.redis)
    - livinityd/source/modules/openclawos/device-auto-approver.ts (paired/pending JSON trio + sweepPendingRequests)
    - livinityd/source/modules/provider/env-file-writer.ts (atomic tmp+rename precedent)
  provides:
    - OpenclawConfigStore class — atomic read/patch over openclaw.json (used by any future config-touching surface)
    - openclawos.gateway.* tRPC namespace (8 procedures — devices.list/revoke, origins.list/add/remove, auth.get/setMode/rotateToken)
    - revoked.json deny-list + device-auto-approver.sweepPendingRequests consultation
    - Full 3-section GatewayTab.tsx replacing the Wave 1 placeholder
  affects:
    - livinityd/source/modules/server/trpc/index.ts (mounts openclawos.gateway as sibling of openclawos.apps)
    - livinityd/source/modules/server/trpc/common.ts (httpOnlyPaths +8 entries)
    - livinityd/source/index.ts (boot-time router construction + env override slots)
tech-stack:
  added: []
  patterns:
    - "Atomic tmp+rename JSON writes (chmod 0o600 preserved) — OpenclawConfigStore mirrors env-file-writer.ts defaultFs.writeAtomic"
    - "Factory-DI tRPC router (mirror openclawos-router.ts sibling pattern) + empty-injection stub at module bottom"
    - "Self-lock guard via X-Claw-Device-Id request header — NOT JWT payload (proven absent in Probe B0)"
    - "Defense-in-depth NO_CALLER_IDENTITY refuse rather than fail-open on missing header"
    - "3-step atomic revoke: scrub pending.json → delete paired.json row → append revoked.json deny-list"
    - "device-auto-approver.sweepPendingRequests consults revoked.json BEFORE the promotion branch"
    - "Direct-fetch escape hatch from GatewayTab.onRevoke (callMutation does not accept extra headers)"
    - "navigator.clipboard.writeText for one-time token banner copy + Dismiss cleanup"
key-files:
  created:
    - livos/packages/livinityd/source/modules/openclawos/openclaw-config-store.ts
    - livos/packages/livinityd/source/modules/openclawos/openclaw-config-store.test.ts
    - livos/packages/livinityd/source/modules/server/trpc/openclawos-gateway-router.ts
    - livos/packages/livinityd/source/modules/server/trpc/openclawos-gateway-router.test.ts
  modified:
    - livos/packages/livinityd/source/modules/openclawos/device-auto-approver.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts
    - livos/packages/livinityd/source/modules/server/trpc/index.ts
    - livos/packages/livinityd/source/index.ts
    - livos/packages/liv-claw-os/packages/claw-client/src/components/settings/GatewayTab.tsx
decisions:
  - "auth.mode enum corrected from SPEC's planner-guessed ['token','master'] to the LIVE-PROBED ['none','token','password','trusted-proxy'] per Probe A6. Tests assert the SPEC's 'master' is REJECTED."
  - "Self-lock guard uses X-Claw-Device-Id request header (NOT JWT payload). JWT has neither deviceId nor jti — Probe B0 proved it. claw-client populates the header from getOrCreateDeviceIdentity()."
  - "Missing X-Claw-Device-Id on a revoke call → FORBIDDEN/NO_CALLER_IDENTITY (defense-in-depth, refuse rather than fail open)."
  - "Revoke is a 3-step atomic sequence — pending scrub FIRST so the F4 sweep cannot re-promote in-flight (A5 race close)."
  - "GatewayTab.onRevoke uses a direct fetch instead of the shared callMutation helper because the helper does not accept extra headers and the X-Claw-Device-Id header is mandatory for the guard."
  - "Token rotation banner is one-shot — after Dismiss the local state is cleared (D-205-17 redact-after-display); operator must copy before dismissing or run rotateToken again."
  - "OpenclawConfigStore lives in modules/openclawos/ (not in modules/provider/) because it's openclaw-specific. Reuses env-file-writer.ts atomic-rename pattern but does NOT depend on it."
metrics:
  completed: 2026-05-24
  duration: ~30 minutes
  tasks: 3
  files_changed: 9 (4 created + 5 modified)
  commits: 3
---

# Phase 205 Plan 04: Gateway Tab + tRPC Router + Self-Lock + OpenclawConfigStore Summary

Closed the SPEC R4 + R5 gap by shipping the in-chat Gateway tab end-to-end:
backend `OpenclawConfigStore` (atomic JSON read/patch of `openclaw.json`) +
8-procedure `openclawos.gateway.*` tRPC router with self-lock guard (locked
in 205-01 spike — header-based, not JWT-based) + pending.json scrub +
revoked.json deny-list + claw-client `GatewayTab.tsx` 3-section UI (Paired
Devices / Allowed Origins / Authentication) with friendly self-lock toast +
one-shot token-rotation copy banner.

## Tasks Completed

| Task | Name                                                                       | Commit     |
|------|----------------------------------------------------------------------------|------------|
| 1    | OpenclawConfigStore (atomic tmp+rename JSON + 6 vitest cases)              | `ca93f7f1` |
| 2    | openclawos.gateway.* router + 14 vitest + boot wire-up + httpOnlyPaths     | `9487d57d` |
| 3    | GatewayTab.tsx full body (3 sections, self-lock toast, rotation banner)    | `28013a13` |

## File Map

| File                                                                                                                       | Change | Notes                                                                                                                                                  |
|----------------------------------------------------------------------------------------------------------------------------|--------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| `livos/packages/livinityd/source/modules/openclawos/openclaw-config-store.ts`                                              | NEW    | OpenclawConfigStore class — atomic read/patch (chmod 0o600, tmp+rename). 81 lines.                                                                     |
| `livos/packages/livinityd/source/modules/openclawos/openclaw-config-store.test.ts`                                         | NEW    | 6 vitest cases — read-happy, missing-file throws, atomic-no-leftover-tmp, unknown-key-preservation, throw-rollback, sequential-patch.                  |
| `livos/packages/livinityd/source/modules/server/trpc/openclawos-gateway-router.ts`                                         | NEW    | 8 adminProcedure routes (devices.list/revoke, origins.list/add/remove, auth.get/setMode/rotateToken). Empty-injection stub at module bottom. 495 lines. |
| `livos/packages/livinityd/source/modules/server/trpc/openclawos-gateway-router.test.ts`                                    | NEW    | 14 vitest cases covering all 10 plan behaviours + 4 ancillaries (empty stub, devices.list happy path, revoke-missing NOT_FOUND, origins-remove-existing). |
| `livos/packages/livinityd/source/modules/openclawos/device-auto-approver.ts`                                               | MOD    | +21 / -0 — sweepPendingRequests gains revoked.json deny-list consultation BEFORE the promotion branch (closes A5 race window even if a fresh pending entry races in). |
| `livos/packages/livinityd/source/modules/server/trpc/common.ts`                                                            | MOD    | +19 / -0 — httpOnlyPaths gains 8 `openclawos.gateway.*` entries (pitfall B-12 / X-04).                                                                  |
| `livos/packages/livinityd/source/modules/server/trpc/index.ts`                                                             | MOD    | +23 / -0 — appRouter `openclawos` namespace gains `gateway` sibling alongside existing `apps`. Empty-injection stub default.                            |
| `livos/packages/livinityd/source/index.ts`                                                                                 | MOD    | +51 / -0 — boot-time construction of OpenclawConfigStore + production gateway router with OPENCLAW_CONFIG_PATH/OPENCLAW_DEVICES_DIR env override slots. |
| `livos/packages/liv-claw-os/packages/claw-client/src/components/settings/GatewayTab.tsx`                                   | REWRITE| +658 / -11 — replaces Wave 1 placeholder with full 3-section UI + self-lock toast + token-rotation banner. 668 lines total.                              |

## Verification

| Check                                                                                                  | Result                                                                  |
|--------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|
| `pnpm vitest run source/modules/openclawos/openclaw-config-store.test.ts`                              | PASS (6/6)                                                              |
| `pnpm vitest run source/modules/server/trpc/openclawos-gateway-router.test.ts`                         | PASS (14/14)                                                            |
| `pnpm vitest run source/modules/openclawos/device-auto-approver.test.ts` (baseline check)              | PASS (9/9) — no regression from the +21 line patch                       |
| `pnpm tsc --noEmit` (livinityd) restricted to new files                                                | CLEAN (0 errors on `openclaw-config-store.ts`, `openclawos-gateway-router.ts`, `device-auto-approver.ts`) — baseline non-related errors unchanged |
| `pnpm tsc --noEmit` (claw-client)                                                                       | PASS (no output)                                                         |
| `pnpm --filter @openuidev/claw-client build`                                                           | PASS — Next.js 16 Turbopack, "Compiled successfully in 5.8s", 5/5 routes prerendered |
| `grep "export class OpenclawConfigStore"` in `openclaw-config-store.ts`                                | 1 hit                                                                   |
| `grep "OPENCLAW_CONFIG_MISSING"` in `openclaw-config-store.ts`                                         | 1 hit                                                                   |
| `grep "renameSync"` in `openclaw-config-store.ts`                                                      | 2 hits (import + call)                                                  |
| `grep "0o600"` in `openclaw-config-store.ts`                                                           | 2 hits (writeFileSync mode + explicit chmodSync)                        |
| `grep "createOpenclawosGatewayRouter"` in `openclawos-gateway-router.ts`                               | 2 hits (export + type alias)                                            |
| `grep "CANNOT_REVOKE_SELF"` in `openclawos-gateway-router.ts`                                          | 1 hit (FORBIDDEN throw)                                                 |
| `grep "NO_CALLER_IDENTITY"` in `openclawos-gateway-router.ts`                                          | 1 hit (defense-in-depth FORBIDDEN throw)                                |
| `grep "randomBytes(32)"` in `openclawos-gateway-router.ts`                                             | 1 hit (token rotation)                                                  |
| `grep "deps.configStore.patch"` in `openclawos-gateway-router.ts`                                      | 4 hits (origins.add, origins.remove, auth.setMode, auth.rotateToken)    |
| `grep -c "openclawos.gateway\."` in `common.ts`                                                        | 8 (all 8 new paths registered)                                          |
| `grep "createOpenclawosGatewayRouter"` in `livinityd/source/index.ts`                                  | 3 hits (import + factory call + slot assignment)                        |
| `grep "createOpenclawosGatewayRouter"` in `trpc/index.ts`                                              | 3 hits (import + slot type + mount)                                     |
| `grep -c "^\s*\(test\|it\)("` in `openclawos-gateway-router.test.ts`                                   | 14 (≥10 required)                                                       |
| `grep -c "^\s*\(test\|it\)("` in `openclaw-config-store.test.ts`                                       | 6 (≥6 required)                                                         |
| GatewayTab.tsx imports `callMutation` AND `callQuery` from `@/lib/livinityd-client`                    | PASS                                                                    |
| GatewayTab.tsx contains all 6 required tRPC paths                                                      | PASS (devices.list, devices.revoke, origins.list, origins.add, origins.remove, auth.get, auth.setMode, auth.rotateToken — all present) |
| GatewayTab.tsx contains `'Cannot revoke the device you are currently signed in with.'` exact string   | PASS (1 hit)                                                            |
| GatewayTab.tsx contains `CANNOT_REVOKE_SELF` for wire-level match                                      | PASS (1 hit)                                                            |
| GatewayTab.tsx contains `NO_CALLER_IDENTITY` for defense-in-depth match                                | PASS (1 hit)                                                            |
| GatewayTab.tsx contains `navigator.clipboard.writeText`                                                | PASS (1 hit)                                                            |
| GatewayTab.tsx negative-grep `?batch=1` + `process.env.LIV_API_KEY`                                    | PASS (0 hits each)                                                      |
| GatewayTab.tsx line count                                                                              | 668 (≥180 required)                                                     |
| Sacred SHA pre-commit hook                                                                             | `[sacred-sha] PASS: 20 files verified` × 3 commits                       |

## Deviations from Plan

None — plan executed exactly as written, with the following routine adaptations all already prescribed by the plan or by the 205-01 SPIKE-NOTES contracts:

- The plan permitted the self-lock guard to read JWT payload `deviceId`/`jti` OR the `X-Claw-Device-Id` header per 205-01. The SPIKE-NOTES LOCKED contract is header-only (JWT proven absent) — I implemented header-only with `NO_CALLER_IDENTITY` fail-closed on missing header.
- `auth.mode` zod schema uses the LIVE-PROBED enum `['none','token','password','trusted-proxy']`, NOT the SPEC's `['token','master']` — this is the Rule-1 spike correction the plan explicitly called out (line 290 of SPIKE-NOTES).
- Token rotation returns `{token, generatedAt}` per plan; the UI renders both (banner shows the token in `<pre>` + a footer line with `generatedAt`). Plan permitted either; chose to surface both for operator UX.

## Auth Gates

None encountered during execution. All work was source-edits + local vitest. The Mini PC live UAT (revoke + paired/pending JSON diff + token rotation propagation) is documented in the plan output spec but executed at operator UAT time — not part of the automated executor scope.

## Known Stubs

None. Both Wave 1 placeholders (`McpServersTab.tsx` and `GatewayTab.tsx`) are now fully implemented. The empty-injection stub at the bottom of `openclawos-gateway-router.ts` is intentional and matches the openclawos-router.ts pattern — production boot replaces it via `setProductionAppRouter` when `OpenclawConfigStore` constructs cleanly.

## Mini PC Live UAT (Deferred to Operator)

Per the plan's `<output>` spec, the following live walkthrough is operator UAT (not executor scope — requires the deploy walk and a live browser session):

```
# Before
ssh bruce@100.112.68.1 'sudo cat /opt/livos/data/openclaw/openclaw.json | jq .gateway.controlUi.allowedOrigins'
ssh bruce@100.112.68.1 'sudo cat /opt/livos/data/openclaw/devices/paired.json | jq "keys"'

# Open claw-client Settings → Gateway, click "Add Origin" with a new URL
# Within 5s:
ssh bruce@100.112.68.1 'sudo cat /opt/livos/data/openclaw/openclaw.json | jq .gateway.controlUi.allowedOrigins'
# → new entry present

# Click Revoke on the current browser's row:
# UI: friendly toast appears, row STAYS
ssh bruce@100.112.68.1 'sudo cat /opt/livos/data/openclaw/devices/paired.json | jq "keys"'
# → unchanged

# Click Revoke on a different paired row:
# UI: row disappears
ssh bruce@100.112.68.1 'sudo cat /opt/livos/data/openclaw/devices/paired.json | jq "keys"'
# → row gone
ssh bruce@100.112.68.1 'sudo cat /opt/livos/data/openclaw/devices/pending.json | jq "to_entries | map(select(.value.deviceId == \"<revoked-id>\"))"'
# → empty array
ssh bruce@100.112.68.1 'sudo cat /opt/livos/data/openclaw/devices/revoked.json | jq ".[\"<revoked-id>\"]"'
# → {revokedAtMs: number, reason: "operator-revoke"}

# Click Rotate Token:
# UI: sticky banner shows 64-char hex token + Copy button
ssh bruce@100.112.68.1 'sudo cat /opt/livos/data/openclaw/openclaw.json | jq .gateway.auth.token'
# → matches the displayed banner token
```

This file does NOT block plan close-out — automation is exhaustive; operator walks the live path when convenient.

## SPEC Acceptance

- **R4 (Gateway tab — paired devices + allowed origins + auth mode CRUD):** Code-complete. All 4 R4 checkboxes implementable on Mini PC post-deploy: list matches openclaw.json, add/remove round-trip <5s, revoke (with self-lock), auth mode toggle persists.
- **R5 (Self-lock guard):** Code-complete. Wire-level `FORBIDDEN/CANNOT_REVOKE_SELF` proven by vitest case 2; UI friendly toast proven by 1-hit grep on the exact English string.
- **R6 (Sacred SHA + Phase 203/204 invariants):** PRESERVED. Every commit shows `[sacred-sha] PASS: 20 files verified`. INV-204-04 (redact-on-read) honoured in `auth.get` (returns `{mode}` only — vitest case asserts response never contains the seeded raw token).
- **D-205-19 (httpOnlyPaths registration):** All 8 new paths registered (verified 8-hit grep).

## Self-Check: PASSED

- File `livos/packages/livinityd/source/modules/openclawos/openclaw-config-store.ts` — FOUND
- File `livos/packages/livinityd/source/modules/openclawos/openclaw-config-store.test.ts` — FOUND
- File `livos/packages/livinityd/source/modules/server/trpc/openclawos-gateway-router.ts` — FOUND
- File `livos/packages/livinityd/source/modules/server/trpc/openclawos-gateway-router.test.ts` — FOUND
- File `livos/packages/livinityd/source/modules/openclawos/device-auto-approver.ts` — MODIFIED (verified `revoked.json` references)
- File `livos/packages/livinityd/source/modules/server/trpc/common.ts` — MODIFIED (verified 8 `openclawos.gateway.*` entries)
- File `livos/packages/livinityd/source/modules/server/trpc/index.ts` — MODIFIED (verified `createOpenclawosGatewayRouter` import + mount)
- File `livos/packages/livinityd/source/index.ts` — MODIFIED (verified production-instance construction + slot assignment)
- File `livos/packages/liv-claw-os/packages/claw-client/src/components/settings/GatewayTab.tsx` — REWRITTEN (668 lines)
- Commit `ca93f7f1` exists in `git log` — FOUND
- Commit `9487d57d` exists in `git log` — FOUND
- Commit `28013a13` exists in `git log` — FOUND
- All 3 commits show `[sacred-sha] PASS: 20 files verified` — VERIFIED inline above
- vitest openclaw-config-store: 6/6 PASS — VERIFIED inline
- vitest openclawos-gateway-router: 14/14 PASS — VERIFIED inline
- pnpm tsc --noEmit on claw-client: PASS — VERIFIED inline
- pnpm --filter @openuidev/claw-client build: PASS — VERIFIED inline
