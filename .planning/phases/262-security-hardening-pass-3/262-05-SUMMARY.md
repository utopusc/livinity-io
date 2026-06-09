---
phase: 262-security-hardening-pass-3
plan: 262-05
subsystem: security
tags: [aes-256-gcm, dek, key-separation, lazy-re-key, manifest-threading, public-forbidden, bwrap, userns, fail-safe, vitest, tsx-node-test]

# Dependency graph
requires:
  - phase: 261-security-research-pass
    provides: SECURITY-RESEARCH-PASS-3.md LIVOS-052/052b/057/058 (file:line, exploit sketch, recommendation, verifier note)
  - phase: 257-security-hardening-pass-2
    provides: registry-credentials.ts FIXED reference pattern (credential-dek file, getLegacyKey, lazy re-key on decrypt) extracted verbatim into the shared module
  - phase: 262-02
    provides: WS2-edited apps/routes.ts + apps/apps.ts this plan layers on (installV37 legacySingleUser pattern at routes.ts:777 mirrored at setPublicAccess)
  - phase: 256-01
    provides: bwrap sandbox + ShellExecutor + buildScrubbedEnv (the contained-autonomy control whose no-silent-fallback property is preserved)
provides:
  - shared modules/secrets/dek.ts (getKey/getLegacyKey/encrypt/decrypt + fs-deps test seam) reading /opt/livos/data/secrets/credential-dek
  - git-credentials.ts / stack-secrets.ts / backup-secrets.ts keyed by the shared DEK with legacy sha256(jwt) DECRYPT-ONLY lazy re-key fallback
  - compose-generator + apps.ts native-builtin + platform manifest writers thread requiresLocalAiClis + neverPublic
  - buildPublicForbiddenSignals ORs requiresLocalAiClis AND neverPublic with getBuiltinApp(appId) (manifest-write regression can no longer fail open)
  - setPublicAccess admin inference gated on explicit ctx.legacySingleUser === true
  - bwrap runtime userns probe (BWRAP_ON_PATH vs BWRAP_AVAILABLE distinct) + SANDBOX_REFUSAL code-126 stable refusal + module-load operator health log
affects: [operator deploy walk (update.sh rebuilds liv/core dist on-server), WS6 operator checklist, future builtin apps declaring requiresLocalAiClis]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ONE shared DEK module for every credential store: getKey reads a dedicated 0600 key file; sha256(JWT) survives ONLY as getLegacyKey decrypt fallback; stores lazy-re-key on read (PG UPDATE / Redis hset, non-fatal on persist failure)"
    - "guard signals OR the trusted in-code catalog with the on-disk manifest (mirror the credential mount path) so a manifest-write regression cannot silently disable a security gate"
    - "absent currentUser is admin-equivalent ONLY via the explicit ctx.legacySingleUser === true flag (256-04 requireRole parity) — never a bare ': true'"
    - "sandbox usability = a REAL runtime probe (enter the namespace), not binary presence; present-but-unusable fails toward a stable refusal, never toward an unsandboxed exec"

key-files:
  created:
    - livos/packages/livinityd/source/modules/secrets/dek.ts
    - livos/packages/livinityd/source/modules/secrets/dek.unit.test.ts
  modified:
    - livos/packages/livinityd/source/modules/docker/git-credentials.ts
    - livos/packages/livinityd/source/modules/docker/stack-secrets.ts
    - livos/packages/livinityd/source/modules/scheduler/backup-secrets.ts
    - livos/packages/livinityd/source/modules/apps/compose-generator.ts
    - livos/packages/livinityd/source/modules/apps/apps.ts
    - livos/packages/livinityd/source/modules/apps/routes.ts
    - livos/packages/livinityd/source/modules/apps/public-forbidden.test.ts
    - liv/packages/core/src/sandbox.ts
    - liv/packages/core/src/shell.ts
    - liv/packages/core/src/sandbox.test.ts

key-decisions:
  - "registry-credentials.ts NOT refactored onto dek.ts this plan — it keeps its own (byte-identical) copy. The plan's files_modified excludes it; its unit suite locks the same properties, so the consolidation is a zero-risk follow-up"
  - "js-yaml dump() silently drops undefined-valued keys (verified) — the native-builtin and platform manifest writers use the plan's exact `?? undefined` form; absent flags stay absent on disk"
  - "buildPublicForbiddenSignals ORs neverPublic with the builtin too (the plan's optional extra) — same regression class as requiresLocalAiClis"
  - "shell refusal = code 126 ('found but not executable' semantics) with stderr naming the userns cause + LIVOS-058; logged per-call at warn, the ONE health log fires at sandbox.ts module load"
  - "ShellExecutor gained an optional test-only sandboxStateOverride constructor param so the tsx/node:assert suite (no mocking framework) can prove the stubbed probe-failure path executes NOTHING — production callers (index.ts:155) unchanged"

patterns-established:
  - "modules/secrets/ is the home for shared at-rest-crypto primitives; new credential stores import dek.ts instead of hand-rolling getKey"

requirements-completed: [LIVOS-052, LIVOS-052b, LIVOS-057, LIVOS-058]

# Metrics
duration: ~15min
completed: 2026-06-09
---

# Phase 262 Plan 05: WS5 — DEK migration + manifest-flag threading + bwrap runtime probe Summary

Shared credential-dek module decouples git/stack/backup at-rest keys from the JWT signing secret (legacy decrypt-only fallback preserves rotation safety); manifest writers thread requiresLocalAiClis/neverPublic and buildPublicForbiddenSignals ORs the builtin catalog so the public-forbidden guard cannot be regression-disabled; bwrap usability is now a real runtime userns probe with a stable code-126 refusal instead of any silent unsandboxed fallback.

## Task Commits

| Task | Name | Commit | Key files |
| ---- | ---- | ------ | --------- |
| 1 | Shared credential-dek module + migrate git/stack/backup off sha256(JWT) with legacy lazy-re-key | `14d6aa4c` | secrets/dek.ts (new), dek.unit.test.ts (new), git-credentials.ts, stack-secrets.ts, backup-secrets.ts |
| 2 | Thread requiresLocalAiClis/neverPublic + OR buildPublicForbiddenSignals with builtin + legacySingleUser guard | `2acde1fa` | compose-generator.ts, apps.ts, routes.ts, public-forbidden.test.ts |
| 3 | bwrap runtime userns probe + stable shell refusal + sandboxed-log fix, liv/core rebuilt | `dbf21020` | sandbox.ts, shell.ts, sandbox.test.ts |

## What Was Done

### Task 1 — LIVOS-052 / LIVOS-052b (DEK migration)
- Created `modules/secrets/dek.ts`: verbatim extraction of the Phase 257-05 registry pattern — `getKey()` reads `/opt/livos/data/secrets/credential-dek` (generates 32 random bytes mode 0600 if absent), `getLegacyKey()` = sha256(trim(jwt)) returned null-on-miss and used ONLY for decrypt, byte-identical `iv12||tag16||ct` base64 codec, `_setKeyProvidersForTests` fs-deps seam.
- All three siblings (`git-credentials.ts`, `stack-secrets.ts`, `backup-secrets.ts`) deleted their local JWT-derived `getKey` + duplicate crypto and import the shared module. Zero `createHash` hits remain in the three files (the only sha256(jwt) code lives in dek.ts getLegacyKey; two doc-comment mentions of the fallback remain by design).
- Each read path ports the registry lazy re-key exactly: try DEK → on GCM auth-tag throw, getLegacyKey → decrypt legacy → re-encrypt with DEK → persist (`UPDATE git_credentials SET encrypted_data=...` / `hset liv:stack:secrets:{stack}` / `hset liv:scheduler:backup-creds:{jobId}`), non-fatal on persist failure.
- TDD: dek.unit.test.ts RED (module absent) → GREEN, 7 cases incl. the two load-bearing properties — a DEK blob does NOT decrypt under sha256(jwt) (leaked-jwt) and a legacy blob DOES decrypt via getLegacyKey (rotation non-destructive).

### Task 2 — LIVOS-057 + WS-A5 parity (manifest threading + signal OR + legacySingleUser)
- `compose-generator.ts` builtin manifest builder threads `requiresLocalAiClis` + `neverPublic` exactly as `requiresAiProvider` (conditional `=== true` writes).
- `apps.ts` native-builtin branch adds both flags to its minimal manifest with `?? undefined` (js-yaml drops undefined keys — verified empirically before relying on it).
- `apps.ts` platform path adds `neverPublic: data.neverPublic ?? data.manifest?.neverPublic ?? undefined` alongside the existing requiresLocalAiClis thread.
- `buildPublicForbiddenSignals` now ORs BOTH flags with `getBuiltinApp(appId)` (mirroring the credential mount path OR at reapplyAppConfig) — an install path that drops the flag can no longer make a credentialed builtin public-exposable.
- `routes.ts` setPublicAccess: `const isAdmin = ctx.currentUser ? ctx.currentUser.role === 'admin' : ctx.legacySingleUser === true` (was bare `: true`); comment updated to reference the explicit flag.
- TDD: public-forbidden.test.ts RED (OR case failed pre-change) → GREEN; the new suite exercises the REAL `Apps.prototype.buildPublicForbiddenSignals` via a minimal `this` stub + a surgical `vi.mock` of getBuiltinApp (pass-through for every other appId): flag-absent install-path manifest + builtin flag ⇒ `{forbidden: true, reason: 'local-ai-clis'}`; no false positive for non-builtins; on-disk flag still forbids standalone. 20/20 green.

### Task 3 — LIVOS-058 (bwrap runtime probe + fail-safe refusal)
- `sandbox.ts`: `BWRAP_RUNTIME_PROBE_ARGV = ['--unshare-all','--share-net','--ro-bind','/','/','true']` executed at module load; `BWRAP_ON_PATH` (cheap `--version` presence) and `BWRAP_AVAILABLE` (runtime probe) are now distinct exported facts. On `BWRAP_ON_PATH && !BWRAP_AVAILABLE` ONE operator health log fires: "bwrap present but userns unavailable; agent shell disabled (LIVOS-058)".
- New pure `resolveShellExecutionMode(onPath, runtimeUsable)` → `'bwrap' | 'unsandboxed-dev' | 'refuse'` + `SANDBOX_REFUSAL` `{stdout:'', stderr:'Shell sandbox unavailable: bwrap present but user namespaces are not permitted on this host. Refusing to run unsandboxed (LIVOS-058).', code:126}`.
- `shell.ts`: refuse mode resolves the stable refusal BEFORE any exec; the genuinely-off-PATH dev fallback (env-scrubbed `exec` in LIV_AGENT_WORKSPACE) is byte-for-byte unchanged in behavior; the `sandboxed:` log now reflects the ACTUAL branch taken (`mode === 'bwrap'`), fixing the stale `BWRAP_AVAILABLE` flag. **The no-silent-fallback property the WS-B2 Mitigation-Confirmed entry verified is preserved and now test-locked.**
- TDD: sandbox.test.ts RED (exports absent) → GREEN, 11 checks; the stubbed probe-failure test proves `execute('echo LIVOS058_MUST_NOT_RUN')` resolves the exact refusal and never runs the command.
- **liv/core rebuilt**: `npm run build --workspace=packages/core` clean (tsc exit 0); `dist/sandbox.js`/`dist/shell.js` reflect the probe + refusal. `dist/` is gitignored — update.sh rebuilds on-server at deploy.

## Verification Results

- `npx vitest run dek.unit.test.ts public-forbidden.test.ts registry-credentials.unit.test.ts` — **38/38 passed** (7 + 20 + 11).
- `grep "secrets/dek" git-credentials.ts stack-secrets.ts backup-secrets.ts` — exactly three import matches.
- `npx tsx packages/core/src/sandbox.test.ts` — **ALL PASS (11 checks)**; `npm run build --workspace=packages/core` — clean, dist updated.
- livinityd `npx tsc --noEmit` — **zero NEW errors**: stash-comparison on the apps module shows the identical 64-error pre-existing baseline (TS18048 ctx.* noise + TS2322/TS2345 at lines untouched by this plan) before and after the edits; no errors in secrets/, docker/, scheduler/ edited files.
- Report WS5 success criteria: leaked jwt no longer decrypts git/stack/backup blobs (leaked-jwt test); JWT rotation non-destructive (legacy-migration test + per-store lazy re-key); buildPublicForbiddenSignals forbids a requiresLocalAiClis app written via the install path (real-method test); bwrap probe failure surfaces a health log + code-126 refusal with no silent unsandboxed fallback (no-exec test).

## Deviations from Plan

### Minor implementation choices (no scope change)

**1. ShellExecutor optional `sandboxStateOverride` constructor param**
- **Found during:** Task 3
- **Why:** the tsx + node:assert convention has no module mocking, but the plan's test behavior requires proving "a stubbed probe-failure yields the refusal (code 126, no exec)". A test-only injection point on the single-call-site class was the smallest honest way to exercise the real `execute()` refuse path.
- **Files modified:** liv/packages/core/src/shell.ts
- **Commit:** `dbf21020`

**2. neverPublic also OR'd with the builtin in buildPublicForbiddenSignals**
- The plan marked this "optionally" — done, same regression class as requiresLocalAiClis.
- **Commit:** `2acde1fa`

Otherwise: plan executed as written. No authentication gates. No deploy or live-box mutation of any kind (no update.sh / systemctl / ssh / ufw).

## Known Stubs

None — no placeholder values, no unwired data paths introduced.

## Carry-Forward (recorded per plan objective — NOT executed)

- **Kopia backup repository password cleartext** in `modules/apps/backups/backups.ts:246,286,432` → move into the AES-256-GCM vault pattern (WS-C backup recommendation).
- **Dedicated `/opt/livos/data/secrets/backup-vault-key`** distinct from the shared credential-dek for the backup store (NIST key-usage separation refinement). The DEK migration in this plan already delivered the load-bearing half (backup-secrets.ts is off sha256(JWT)).
- **registry-credentials.ts consolidation onto secrets/dek.ts** — zero-risk dedup follow-up (its private copy is byte-identical; its unit suite already locks the same properties).
- **Operator (deploy):** `update.sh` rebuilds liv/core dist on-server; on first post-deploy read, legacy blobs lazily re-key to `/opt/livos/data/secrets/credential-dek` (file auto-generated 0600 by the first getKey call — already exists on the Mini PC from 257-05's registry store).

## Threat Flags

None — no new network endpoints, auth paths, file-access patterns, or schema changes beyond the plan's threat model. The new on-disk surface (`credential-dek`) is the SAME file 257-05 already introduced, now shared.

## Self-Check: PASSED

- FOUND: livos/packages/livinityd/source/modules/secrets/dek.ts
- FOUND: livos/packages/livinityd/source/modules/secrets/dek.unit.test.ts
- FOUND: liv/packages/core/dist/sandbox.js (rebuilt, gitignored)
- FOUND: commits 14d6aa4c, 2acde1fa, dbf21020 on master
- Tests: 38/38 vitest + 11/11 tsx green at HEAD
