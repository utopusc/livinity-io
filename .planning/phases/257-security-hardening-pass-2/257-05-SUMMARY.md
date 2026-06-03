---
phase: 257-security-hardening-pass-2
plan: 05
subsystem: infra
tags: [secrets, redis, postgres, aes-256-gcm, dek, jwt, env, least-privilege, docker]

# Dependency graph
requires:
  - phase: 256-security-hardening-contained-autonomy
    provides: "inject-local-ai-clis cred-egress proxy (creds no longer bind-mounted) — scratch HOME no longer nests a cred mount"
provides:
  - "Zero committed/fallback default passwords in tracked source (grep-clean SC-E invariant)"
  - "Fail-closed env/secret-file reads at every former hardcoded credential site"
  - "At-rest credential encryption key (DEK) independent of the JWT signing secret, with non-breaking lazy re-key"
  - "0o700 least-privilege scratch HOME for host-AI-CLI containers"
affects: [257-06, 257-07, 258, sibling-credential-store-sweep]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dedicated data-encryption key (DEK) file under data/secrets/, randomBytes(32) mode 0600, independent of JWT"
    - "Lazy re-key migration: legacy-key decrypt fallback + re-encrypt-and-persist with the new key"
    - "Fail-closed env reads (throw / no-connect on unset) — no silent default credential fallback"
    - "REDISCLI_AUTH env to pass a Redis password to redis-cli without leaking it into argv/ps"

key-files:
  created: []
  modified:
    - "liv/packages/core/src/heartbeat-runner.ts — Redis pw from REDIS_URL (REDISCLI_AUTH), no literal"
    - "livos/packages/livinityd/source/modules/database/index.ts — removed DEFAULT_DATABASE_URL, fail-closed"
    - "docker/docker-compose.postgres.yml — POSTGRES_PASSWORD required from env"
    - "platform/web/src/lib/db.ts + drizzle.config.ts — require DATABASE_URL, throw on unset"
    - "platform/web/ecosystem.config.cjs + platform/relay/ecosystem.config.cjs — DATABASE_URL/REDIS_URL from process.env"
    - "platform/relay/src/config.ts — envRequired() for DATABASE_URL + REDIS_URL"
    - "platform/web/src/lib/username-validator.test.ts — <DATABASE_PASSWORD> placeholder"
    - "livos/packages/livinityd/source/modules/docker/registry-credentials.ts — DEK independent of JWT + lazy re-key"
    - "livos/packages/livinityd/source/modules/docker/registry-credentials.unit.test.ts — +4 LIVOS-033 tests"
    - "livos/packages/livinityd/source/modules/apps/inject-local-ai-clis.ts — scratch HOME 0o700"
    - "livos/setup.sh — openssl-rand PG password (no liv:liv)"
    - "liv/deploy/setup-server4.sh — DELETED (dead Server4 script, removed Nexus* literals)"

key-decisions:
  - "registry-credentials.ts uses the raw 32 DEK bytes directly as the AES-256 key (no extra hash) — source is independent of the JWT secret, which is the LIVOS-033 point"
  - "database/index.ts returns false (no connection) on unset DATABASE_URL rather than throwing, matching its existing Promise<boolean> contract / docstring — fail-closed without crashing the daemon"
  - "setup-server4.sh DELETED rather than scrubbed (Server4 is out of scope per the operator hard-rule; zero tracked references)"
  - "Sibling cred stores (git/stack/backup-secrets) still JWT-keyed — listed for a fast-follow sweep, not silently left"

patterns-established:
  - "DEK file + injectable fs deps so at-rest crypto is unit-testable fully offline"
  - "Lazy re-key: decrypt-fallback-to-legacy then re-encrypt+persist, so a key rotation never bricks existing blobs"

requirements-completed: [LIVOS-020, LIVOS-021, LIVOS-030, LIVOS-031, LIVOS-032, LIVOS-033, LIVOS-034]

# Metrics
duration: ~30 min
completed: 2026-06-03
---

# Phase 257 Plan 05: WS-E Secret Hygiene Summary

**Removed every committed/fallback default password from tracked source (grep-clean), made each former hardcoded site a fail-closed env/secret-file read, derived the at-rest credential DEK independently of the JWT secret with a non-breaking lazy re-key, and tightened the host-AI-CLI scratch HOME from 0o777 to 0o700.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-06-03
- **Tasks:** 6 (Task 6 was a verify-only gate — no edit needed)
- **Files modified:** 13 (12 edited + 1 deleted)

## Accomplishments
- **SC-E grep-clean invariant holds:** `git grep` for `LivRedis2024`, `LivPostgres2024`, `LivPlatform2024`, `NexusRedis2024`, `NexusDB2024`, and `liv:liv@` over tracked code/config/scripts (excluding `.planning/` + `SECURITY-AUDIT.md`) returns **ZERO** hits.
- Every former hardcoded site now reads from env / a secret file and **fails closed** when unset (no new silent default).
- At-rest credential encryption key is now an independent 32-byte DEK file (0600), no longer `sha256(JWT secret)` — a JWT-secret leak no longer decrypts stored registry/git/stack creds.
- Lazy re-key keeps existing encrypted blobs decryptable (legacy fallback → re-encrypt with DEK) — no vault bricking on the live box.
- Scratch HOME for host-AI-CLI containers is 0o700 (was world-writable 0o777) — removes the plant-a-poisoned-config vector.

## Per-Finding Still-Exists / Resolution

| Finding | Plan-time state | Re-verified | Resolution |
|---------|-----------------|-------------|------------|
| LIVOS-020 (`LivRedis2024!` heartbeat-runner) | OPEN | Confirmed at :223 | Pw parsed from `REDIS_URL` via `REDISCLI_AUTH`; no literal; ping auth-less if unset |
| LIVOS-021 (`LivPlatform2024` platform web+relay) | OPEN | Confirmed 7 sites (db, drizzle, 2 ecosystem, relay config, test doc, + relay Redis literal) | All require DATABASE_URL/REDIS_URL from env, throw on unset; `git grep LivPlatform2024 -- platform/` = 0 |
| LIVOS-030 (`LivPostgres2024!` livinityd db + compose) | OPEN | Confirmed at index.ts:11 + compose:10 | DEFAULT_DATABASE_URL removed (fail-closed); compose `${POSTGRES_PASSWORD:?…}` |
| LIVOS-031 (`liv:liv` setup.sh) | OPEN | Confirmed at :190 | PG pw now `openssl rand -hex 24` |
| LIVOS-032 (`NexusRedis2024!`/`NexusDB2024!` setup-server4.sh) | OPEN | Confirmed at :23/24/41/86 | File DELETED (no tracked refs; Server4 out of scope) |
| LIVOS-033 (DEK = sha256(JWT)) | OPEN | Confirmed at :27-29 | DEK from dedicated 0600 `credential-dek` file; lazy re-key for legacy blobs; 4 unit tests |
| LIVOS-034 (0o777 scratch HOME) | OPEN | Confirmed at :301 | `chmod 0o700`; comment updated; `git grep 0o777` in file = 0 |

## Task Commits

1. **Task 1: heartbeat Redis pw + livinityd PG fallback + orphan compose (LIVOS-020/030)** — `2e0051ed` (fix)
2. **Task 2: platform web+relay require DATABASE_URL (LIVOS-021)** — `a9520c5d` (fix)
3. **Task 3: at-rest DEK independent of JWT + lazy re-key (LIVOS-033)** — `b4aa446b` (feat, TDD test+impl)
4. **Task 4: scratch HOME 0o700 (LIVOS-034)** — `0c0007f3` (fix)
5. **Task 5: setup.sh openssl PG pw + delete setup-server4.sh (LIVOS-031/032)** — `687682f2` (fix)
6. **Task 6: grep-clean invariant gate** — no commit (verify-only; no residual hit to fix)

## Tests / Verification Run

- `registry-credentials.unit.test.ts` — **11/11 pass** (7 original + 4 new LIVOS-033: round-trip, key-independence vs sha256(JWT), DEK-gen 0600, legacy lazy re-key migration).
- `liv` core `tsc --noEmit -p packages/core` — clean.
- `livinityd` `tsc --noEmit -p packages/livinityd` — no new errors in the touched files.
- `bash -n livos/setup.sh` — clean.
- SC-E negation `! git grep -nE '…' -- ':!.planning/' ':!SECURITY-AUDIT.md'` — **PASS (zero source hits)**.
- `git grep 0o777` in inject-local-ai-clis.ts — **0**.

### Final grep output (SC-E)
```
$ git grep -nE 'LivRedis2024|LivPostgres2024|LivPlatform2024|NexusRedis2024|NexusDB2024|liv:liv@' -- ':!.planning/' ':!SECURITY-AUDIT.md'
(empty — exit 1)
```

## At-Rest-Key Re-Key Safety Note (LIVOS-033)

The DEK cutover is **non-breaking**. `getKey()` now sources the 32-byte AES-256 key from a dedicated `/opt/livos/data/secrets/credential-dek` file (generated via `crypto.randomBytes(32)`, mode 0600, if absent), independent of the JWT signing secret. Existing rows were encrypted with the OLD key = `sha256(JWT secret)`. On the first decrypt of such a row, the DEK decrypt throws a GCM auth-tag failure; `decryptCredentialData` then retries with the legacy JWT-derived key, succeeds, and **re-encrypts the blob with the DEK and persists it** (`UPDATE registry_credentials SET encrypted_data = …`). Re-key persistence failure is non-fatal (the read already succeeded; the row migrates on the next read). No existing vault/registry credential is bricked during the grace window. New writes only ever use the DEK.

## Server5 Rotation Reminder (operator action — OUT OF BAND)

`platform/web` + `platform/relay` run on **Server5 (off-limits for deploy)**. These edits are **SOURCE-ONLY** — they remove the committed `LivPlatform2024` literal (and the committed relay Redis password) from the tracked repo. They do **NOT** deploy to Server5. **The operator MUST rotate the live Server5 `platform` DB password (and the relay Redis password) out of band**, since both were committed and must be treated as compromised. After rotation, set the new `DATABASE_URL`/`REDIS_URL` in the Server5 PM2 env / env file (the ecosystem units now read `process.env.DATABASE_URL` / `process.env.REDIS_URL`).

## Decisions Made
- DEK bytes used directly as the AES-256 key (no extra hashing) — the security property is *source independence from the JWT secret*, which is satisfied.
- `initDatabase` returns `false` (no pool) on unset `DATABASE_URL` rather than throwing — matches its existing `Promise<boolean>` contract and avoids crashing the daemon, while still failing closed (no default credential).
- `setup-server4.sh` deleted rather than scrubbed — Server4 is out of scope (operator hard-rule), zero tracked references.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Removed committed relay Redis credential + LivRelayRedis2024! default**
- **Found during:** Task 2 (platform relay tier)
- **Issue:** `platform/relay/ecosystem.config.cjs:14` committed a real Redis password (`redis://:680542add…@…`) and `platform/relay/src/config.ts:31` defaulted to `LivRelayRedis2024!` — same finding-class as LIVOS-021 (committed production credential), not in the original interface list.
- **Fix:** Ecosystem unit now reads `process.env.REDIS_URL`; config.ts uses `envRequired('REDIS_URL')` (no default).
- **Files modified:** platform/relay/ecosystem.config.cjs, platform/relay/src/config.ts
- **Verification:** `git grep` for both literals returns 0; tsc unaffected.
- **Committed in:** `a9520c5d` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing-critical secret-hygiene).
**Impact on plan:** Strengthens the same secret-hygiene goal; no scope creep beyond the WS-E credential-removal mandate.

## Issues Encountered
- Plan referenced `registry-credentials.test.ts`, but the repo convention / existing file is `registry-credentials.unit.test.ts` — extended the existing file (added the injection hook + 4 tests) rather than creating a divergent one.
- The container uid is **not available** in `writeLocalAiCliWrappers` (the cred-ACL step is a no-op since 256-02 and creds are no longer bind-mounted). Per the plan's explicit fallback, used `0o700` owned by the livinityd process user (still removes world-write). Function is preserved for these operator-trusted VERIFIED apps; the residual regression risk is the plan's accepted T-257E-04.

## Sibling Cred-Store Fast-Follow (LIVOS-033 tracked, T-257E-05)
These three each **inline** their own `getKey()` using `sha256(JWT secret)` (no shared helper, so registry-credentials' fix does not propagate automatically). They should be swept in 257-06 / 258 with the same DEK + lazy-re-key pattern:
- `livos/packages/livinityd/source/modules/docker/git-credentials.ts`
- `livos/packages/livinityd/source/modules/docker/stack-secrets.ts`
- `livos/packages/livinityd/source/modules/scheduler/backup-secrets.ts`

## User Setup Required
None - no new external service configuration. (Operator action above: rotate Server5 platform DB + relay Redis passwords out of band — credential rotation, not new setup.)

## Next Phase Readiness
- WS-E complete; SC-E grep-clean invariant holds. Runs in parallel with 257-01/02/03/04 (no file overlap).
- Fast-follow: sweep the 3 sibling cred stores (above) to the DEK pattern.
- Operator: rotate Server5 platform DB + relay Redis credentials out of band.

## Self-Check: PASSED
- All 12 modified files present on disk; `setup-server4.sh` confirmed deleted.
- All 5 task commits (`2e0051ed`, `a9520c5d`, `b4aa446b`, `0c0007f3`, `687682f2`) exist in git log.
- SC-E grep-clean negation passes (zero source hits); registry test 11/11; liv core tsc clean; setup.sh bash -n clean.

---
*Phase: 257-security-hardening-pass-2*
*Completed: 2026-06-03*
