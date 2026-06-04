---
phase: 258-public-app-access
plan: 01
subsystem: apps + domain (Caddy)
tags: [public-access, manifest-schema, caddy-subdomain, data-contract]
requires: []
provides:
  - "AppManifestSchema.publicAccess + AppManifestSchema.neverPublic (optional manifest fields)"
  - "apps/public-access.ts — PublicAccessConfig + PublicAccessInstallSetting types, resolvePublicAccess() pure resolver, DEFAULT_CALCOM_PATHS"
  - "SubdomainConfig.publicAccess? optional field (type-only contract for the 258-02 emitter)"
affects:
  - "258-02 (Caddy emit carve-out) consumes SubdomainConfig.publicAccess + resolvePublicAccess"
  - "258-03 (enforce + persist) consumes resolvePublicAccess + persists PublicAccessInstallSetting on the Redis SubdomainConfig"
  - "258-04 (Share dialog UI) consumes DEFAULT_CALCOM_PATHS to pre-fill suggestions"
tech-stack:
  added: []
  patterns:
    - "Interface-first data contract: define + test the resolved shape before its two consumers (emit, enforce) are written"
    - "Optional-field-through-Redis/regen mirrors the existing upstreamBearer? precedent on SubdomainConfig"
    - "import type for cross-module shape (caddy.ts gains no runtime dep on the apps module)"
key-files:
  created:
    - livos/packages/livinityd/source/modules/apps/public-access.ts
    - livos/packages/livinityd/source/modules/apps/public-access.test.ts
    - livos/packages/livinityd/source/modules/apps/schema.test.ts
  modified:
    - livos/packages/livinityd/source/modules/apps/schema.ts
    - livos/packages/livinityd/source/modules/domain/caddy.ts
decisions:
  - "resolvePublicAccess defaults mode to 'none' — a manifest declaring publicAccess can NEVER self-enable (T-258A-01); only the operator per-install setting activates public access"
  - "Operator install paths win; manifest publicAccess.paths is a suggestion fallback (used when operator picks 'paths' without a list)"
  - "Path normalization drops empty/whitespace + bare '/' so no universal prefix can smuggle in and shadow the gated catch-all (T-258A-02)"
  - "validateManifest's zod .parse stays commented out (bypassed) — new fields ride the inferred type + read structurally; lenient existing manifests unaffected (SC5)"
metrics:
  duration: ~4m
  completed: 2026-06-04
---

# Phase 258 Plan 01: Public App Access — Manifest Fields + Per-Install Config Contract Summary

WS-A establishes the public-access data contract interface-first: two optional manifest fields (`publicAccess`/`neverPublic`), a pure `resolvePublicAccess` resolver that is the single source of truth for an install's effective public shape, and an optional `SubdomainConfig.publicAccess?` field — all tested, with the existing Caddy emit byte-unchanged so apps without `publicAccess` behave exactly as today.

## What Was Built

### Task 1 — Manifest fields (`feat(258-01)` `85fc97e7`)
- `AppManifestSchema` gains `publicAccess: z.object({ mode: z.enum(['none','whole-app','paths']), paths?: string[], hasOwnAuth?: boolean }).optional()` and `neverPublic: z.boolean().optional()`, placed next to `requiresLocalAiClis` with doc-comments matching the existing style (app-author DECLARATION of public-access support, not the per-install toggle).
- `validateManifest`'s commented-out `AppManifestSchema.parse` was left untouched (out of scope) — fields ride the inferred `AppManifest` type and are read structurally; lenient existing manifests keep parsing.
- `schema.test.ts` (new, vitest): 4 tests — publicAccess parses, invalid mode rejected (enum), neverPublic parses + absence ok, neither-field manifest still parses (SC5).

### Task 2 — `public-access.ts` resolver (`feat(258-01)` `cf237aea`)
- New PURE module (no I/O / Redis / livinityd imports) exporting:
  - `PublicAccessConfig` — the resolved runtime shape (`paths` always an array, `hasOwnAuth` always a boolean, no undefineds).
  - `PublicAccessInstallSetting` — the per-install operator choice 258-03 will persist on the Redis SubdomainConfig.
  - `DEFAULT_CALCOM_PATHS` — the CONTEXT Cal.com prefix list (`/booking`, `/booking-successful`, `/d/`, `/api/book`, `/api/trpc/public`, `/api/trpc/slots`, `/api/trpc/availability`, `/[a-z]`), documented with the catch-all-last invariant (no bare `/`).
  - `resolvePublicAccess(manifest, installSetting)` — merges: mode from installSetting (default `'none'`); paths = installSetting.paths ?? manifest.publicAccess.paths ?? [] (normalized, emptied for non-`paths` modes); hasOwnAuth from manifest.
- `public-access.test.ts` (new, vitest): 6 tests — operator paths win, whole-app empties paths + carries hasOwnAuth, default none (private/SC5), manifest-paths fallback, DEFAULT_CALCOM_PATHS exact + no `/` smuggle, path normalization (leading slash, drop empty/whitespace).

### Task 3 — `SubdomainConfig.publicAccess?` (`feat(258-01)` `89922586`)
- `import type {PublicAccessConfig} from '../apps/public-access.js'` (erases at compile → caddy.ts gains no runtime dep on the apps module).
- Added `publicAccess?: PublicAccessConfig` to `SubdomainConfig`, immediately after `upstreamBearer?`, with a doc-comment describing the 258-02 split (header-stripped public blocks + gated catch-all) and the round-trip-through-Redis pattern.
- `generateFullCaddyfile` body UNTOUCHED — emit carve-out is 258-02. **caddy.ts change is interface-field-only.**

## Verification

- `npx vitest run` (3 files together): **99/99 pass** — schema.test.ts (4) + public-access.test.ts (6) + caddy.test.ts (**89 unchanged**, incl. 256-04 + 257-06 regression cases).
- `tsc --noEmit` (workspace `packages/livinityd/node_modules/.bin/tsc`): the three touched files introduce **ZERO new errors**. The only caddy-related errors (`caddy.test.ts:696/706`, `readonly` `as const` array → `CaddyConfig`) were confirmed PRE-EXISTING via a `git stash` baseline of caddy.ts (present without my change). All other tsc errors (webapps, widgets, xai-auth, etc.) are pre-existing and out of scope.
- Grep: `publicAccess` present in schema.ts, public-access.ts, caddy.ts. `resolvePublicAccess` exported + referenced only by its own test/doc-comments — **no production consumer wiring yet** (consumers are 258-02/03), exactly as specified.

## Deviations from Plan

None — plan executed as written.

Notes (not deviations):
- The plan's verify command used `npx vitest`/`npx tsc`. `npx tsc` resolved to a stub in this environment; used the workspace-local `packages/livinityd/node_modules/.bin/tsc` instead (same compiler the `typecheck` npm script uses). `npx vitest run` worked as written.
- New tests use vitest's own API (`describe/it/expect`) to match `caddy.test.ts`; some sibling app tests use the `node:test` API (vitest supports both). Chose vitest style for consistency with the verify command + the file being extended.

## Sacred SHAs

None of the three touched files (schema.ts, public-access.ts, caddy.ts) appear in `scripts/sacred-shas-v38.json`. The pre-commit `[sacred-sha]` hook passed (`20 files verified`) on all three commits with no `--no-verify`.

## Threat-Model Notes

- **T-258A-01 (manifest self-enable):** mitigated — `resolvePublicAccess` defaults mode to `'none'`; a manifest declaring `publicAccess` exposes nothing until the operator's per-install setting (258-03) activates it. Covered by the "default none" test.
- **T-258A-02 (bare `/` catch-all smuggle):** mitigated at the data layer — `normalizePath` drops `''`/`/`/whitespace so a universal prefix cannot enter via the install setting; `DEFAULT_CALCOM_PATHS` documents catch-all-last and contains no bare `/`. The emit-side last-block guarantee remains 258-02's job. Covered by the normalization + DEFAULT_CALCOM_PATHS tests.
- **T-258A-03 (hasOwnAuth spoof):** advisory only — carried through but not load-bearing here; the confirm dialog (258-04) + server-side forbidden guard (258-03) are the mitigations.

No new threat surface introduced — this plan adds types/a pure resolver + one optional interface field; no endpoint, auth path, or emit change.

## Commits

| Task | Commit    | Message                                                          |
| ---- | --------- | --------------------------------------------------------------- |
| 1    | `85fc97e7` | feat(258-01): add publicAccess + neverPublic to AppManifestSchema |
| 2    | `cf237aea` | feat(258-01): public-access.ts resolver + PublicAccessConfig contract |
| 3    | `89922586` | feat(258-01): SubdomainConfig.publicAccess? optional field (type-only) |

## Self-Check: PASSED

All 6 files verified on disk (public-access.ts, public-access.test.ts, schema.test.ts, schema.ts, caddy.ts, 258-01-SUMMARY.md) and all 3 commits (`85fc97e7`, `cf237aea`, `89922586`) present in git history.
