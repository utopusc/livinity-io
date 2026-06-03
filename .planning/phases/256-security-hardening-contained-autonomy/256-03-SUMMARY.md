---
phase: 256-security-hardening-contained-autonomy
plan: 03
subsystem: livinityd app-install pipeline admin-gate + non-builtin compose sanitizer
tags: [security, compose-sanitizer, admin-gate, LIVOS-007, LIVOS-013, SC5, SC7, WS-C]
requires: ['256-02']
provides:
  - compose-sanitizer.ts (sanitizeNonBuiltinCompose + ComposeRejected — strips privileged/host-net/pid/userns/caps/unconfined, rejects out-of-tree host binds, allowlists CLI_MOUNT_PREFIX + app data dir, adds no-new-privileges)
  - install-admin-gate.ts (assertInstallAllowed + InstallForbidden — admin-only for cred-bearing + new non-builtin community apps)
  - apps.ts install() sanitizes the community-repo compose before WS-B inject + docker compose up; installForUser() sanitizes after the per-user volume-remap; install() admin-gated via isAdmin param
  - routes.ts addRepository/removeRepository -> adminProcedure; install threads isAdmin
affects:
  - livos/packages/livinityd/source/modules/apps/apps.ts (install + installForUser; +43/+1 lines, additive — distinct regions from 256-02's edits)
  - livos/packages/livinityd/source/modules/apps/routes.ts (addRepository/removeRepository gates + install isAdmin thread)
tech-stack:
  added: []
  patterns: [compose-sanitization, host-path-bind-allowlist, admin-pipeline-gate, sanitize-before-inject-ordering]
key-files:
  created:
    - livos/packages/livinityd/source/modules/apps/compose-sanitizer.ts
    - livos/packages/livinityd/source/modules/apps/compose-sanitizer.test.ts
    - livos/packages/livinityd/source/modules/apps/install-admin-gate.ts
    - livos/packages/livinityd/source/modules/apps/install-admin-gate.test.ts
  modified:
    - livos/packages/livinityd/source/modules/apps/apps.ts
    - livos/packages/livinityd/source/modules/apps/routes.ts
key-decisions:
  - "Tests use tsx (liv/node_modules) + node:test + node:assert/strict — vitest is NOT installed in livos/node_modules/.bin and is unavailable offline; same deviation 256-01/256-02 took. The plan's `npx vitest run` was substituted with `node ../liv/node_modules/tsx/dist/cli.mjs --test`."
  - "installForUser() sanitizes AFTER the legacy volume-remap loop (NOT before, as the plan's literal 'sanitize first then remap' wording suggested) using the user's OWN /opt/livos/data/users/<username> subtree as the allowlist root. Reason: the per-user model deliberately mounts legacy `${UMBREL_ROOT}/data/storage` + `/home` host paths that the remap rewrites to `/users/<user>/home`; sanitizing before the remap would reject those legitimate per-user mounts. Running after the remap with the user-subtree root preserves them while still rejecting docker.sock, /, other users' data, and operator secrets."
  - "Extracted the install admin-gate decision into a pure `install-admin-gate.ts` helper (assertInstallAllowed) so it is unit-testable offline — install() itself does heavy rsync/docker I/O and cannot be exercised in a unit test. The helper is called from install() after manifest resolution."
  - "ComposeRejected + InstallForbidden are imported into apps.ts (per plan) and propagate naturally (install() already returns false / throws on failure); no explicit catch added — surfacing the clear error message to the caller is the desired fail-closed behaviour."
  - "apps.ts and routes.ts are NOT in scripts/sacred-shas-v38.json (20-file frozen set) — verified — so no re-freeze was needed; the pre-commit sacred-sha hook PASSed on all three commits."
requirements-completed: [LIVOS-007, LIVOS-013]
duration: ~40 min
completed: 2026-06-03
---

# Phase 256 Plan 03: Pipeline Admin-Gate + non-builtin compose sanitizer (WS-C) Summary

Closed LIVOS-007 (no host-path validation on per-user app compose volumes — any marketplace app could mount arbitrary host paths incl. docker.sock) and LIVOS-013 (untrusted app-store compose run verbatim — no filter of privileged / docker.sock / host-mount), plus the #1 residual (the privileged install pipeline reachable by non-admins). A new `sanitizeNonBuiltinCompose()` strips `privileged` / `network_mode:host` / `pid:host` / `userns_mode:host` / `cap_add` / `security_opt …unconfined` from every service of a **non-builtin** compose and **rejects** any volume host-path bind outside the app data dir (docker.sock, `/`, other users' data, operator secrets) — while **allowlisting** the WS-B operator-trusted inject mounts under `CLI_MOUNT_PREFIX` (`/opt/livos-clis`, incl. the `:ro` `credproxy-ca.pem` CA cert) so OpenDesign's cred-proxy path survives (fix F). It runs on both install paths (`install()` community-repo branch BEFORE the WS-B inject; `installForUser()` after the per-user remap). A companion `assertInstallAllowed()` gate makes `addRepository`/`removeRepository` admin-only and blocks non-admins from installing cred-bearing (`requiresLocalAiClis`/`requiresAiProvider`) or new non-builtin community apps — builtin + platform-DB apps stay installable by members and keep their declared mounts (SC7).

## Tasks Completed

| Task | Name | Commit | Tests |
|------|------|--------|-------|
| 1 | non-builtin compose sanitizer | `8ec87bea` | compose-sanitizer.test.ts — 9/9 |
| 2 | wire sanitizer on both non-builtin install paths | `3746e981` | tsc -p packages/livinityd clean (WS-C wiring) |
| 3 | admin/verified gate on the privileged pipeline | `5b4b1460` | install-admin-gate.test.ts — 6/6 + adminProcedure grep |

Total WS-C unit cases green: 15 (9 + 6). WS-B regression (inject-local-ai-clis.test.ts): 18/18 still green.

## Key Implementation Details

**Task 1 — `compose-sanitizer.ts`:**
- `class ComposeRejected extends Error` carries the offending `directive` for a clear install error.
- `sanitizeNonBuiltinCompose(composeData, appDataDir)` iterates ALL `composeData.services`: deletes `privileged`; deletes `network_mode`/`pid`/`userns_mode` only when value `=== 'host'` (a non-host `network_mode:bridge` survives — Test 2b); deletes `cap_add`; filters `security_opt` entries matching `/unconfined/`; merges `no-new-privileges:true` (de-duped); collects every removal into `removed[]`.
- Volume binds: `bindHostSide()` handles short form (`<host>:<container>[:mode]` where host starts with `/`/`.`/`~`) AND long form (`{type:'bind', source}`); named volumes (`myvol:/data`) pass through. `normalizeHost()` resolves relative/`~` paths; `isUnder()` uses POSIX path-boundary semantics. ALLOW if under `appDataDir` OR under `CLI_MOUNT_PREFIX` (imported from `./inject-local-ai-clis.js`, NOT hardcoded — stays in sync, fix F); else `throw new ComposeRejected`.
- 9 unit cases: strip-privileged, strip-host-net/pid/caps, preserve-non-host-net, reject-docker.sock, reject-out-of-tree + allow-appdata + allow-named, allow-CLI_MOUNT_PREFIX (fix F), no-new-privileges merge/dedupe, multi-service, userns + long-form bind reject.

**Task 2 — `apps.ts` wiring:**
- `install()`: after rsync + the `isGeneratedTemplate` cleanup and BEFORE the `requiresAiProvider`/`requiresLocalAiClis` injects + `appEnvironment('up')`, a `if (!isGeneratedTemplate)` block reads `${appDataDirectory}/docker-compose.yml`, `yaml.load`s it, calls `sanitizeNonBuiltinCompose(composeData, appDataDirectory)`, writes it back, logs `LIVOS-013: sanitized non-builtin compose for <appId> removed=…`. `ComposeRejected` propagates (the install error path already returns false/throws). Ordering invariant (fix F): sanitize precedes the WS-B inject so the injected CA/CLI mounts are added post-sanitize and never checked.
- `installForUser()`: sanitize runs AFTER the per-user volume-remap loop using `${dataDirectory}/users/${username}` as the allowlist root (see Deviations). builtin (`generateAppTemplate`) + platform-DB (`fetchPlatformTemplate`) paths are NOT touched (SC7).

**Task 3 — `routes.ts` + `apps.ts` + `install-admin-gate.ts`:**
- `routes.ts`: `addRepository` + `removeRepository` `privateProcedure` → `adminProcedure` (`adminProcedure` already imported at :3). `install` resolves `isAdmin = ctx.currentUser ? ctx.currentUser.role === 'admin' : true` and threads it as the 4th arg of `ctx.apps.install(...)`.
- `apps.ts`: `install()` gains `isAdmin: boolean = true`; after manifest resolution calls `assertInstallAllowed({isAdmin, isGeneratedTemplate, manifest})`.
- `install-admin-gate.ts`: `assertInstallAllowed` throws `InstallForbidden` for non-admins when the manifest sets `requiresLocalAiClis`/`requiresAiProvider` (operator creds) OR `!isGeneratedTemplate` (new non-builtin community app); no-op for admins and for member installs of plain builtin/platform apps. 6 unit cases.
- `installForUser` was already `adminProcedure` (routes.ts:483) — unchanged. uninstall/start/stop gates untouched.

## Deviations from Plan

### [Rule 3 - Blocker] Tests use tsx + node:test, not vitest
- **Found during:** Task 1 (before the first test).
- **Issue:** The plan's `<verify>` calls `npx vitest run …`, but vitest is NOT in `livos/node_modules/.bin` and `npx` would require an offline-blocked download. Same as 256-01/256-02.
- **Fix:** Ran suites via `node ../liv/node_modules/tsx/dist/cli.mjs --test <file>` (node:test runner) with `node:assert/strict`. Same assertions vitest would make.
- **Verification:** 9 sanitizer + 6 admin-gate cases pass; 18 inject-local-ai-clis regression cases pass.

### [Rule 1 - Bug avoidance] installForUser sanitizes AFTER the remap, with the user-subtree allowlist root
- **Found during:** Task 2.
- **Issue:** The plan's literal wording ("sanitize first, then the remap") would reject legitimate per-user mounts. `installForUser` deliberately mounts legacy `${UMBREL_ROOT}/data/storage` and `/home` host paths (the marketplace per-user shared-storage model); the remap loop rewrites them to `/opt/livos/data/users/<user>/home`. Those host paths are OUTSIDE the app-data dir, so sanitizing before the remap with `userDataDir` as the allowlist root would `ComposeRejected` every legacy per-user app — a functional regression.
- **Fix:** Run `sanitizeNonBuiltinCompose` AFTER the remap loop, using the user's OWN `${dataDirectory}/users/${username}` subtree as the allowlist root (covers both the app-data dir and the remapped `/home` + `/data/storage` mounts). This preserves the legitimate per-user mounts while still rejecting docker.sock, `/`, other users' trees, and operator secrets — the LIVOS-007 attack surface. The single-user `install()` path (no legacy remap) sanitizes BEFORE the inject with `appDataDirectory` as the plan specifies.
- **Files modified:** apps.ts installForUser().
- **Commit:** `3746e981`.

### [Design choice] Admin-gate extracted to a pure helper for testability
- **Found during:** Task 3.
- **Issue:** `install()` performs heavy rsync/docker I/O — not unit-testable offline. Testing the admin-gate decision inline would require mocking the whole install.
- **Fix:** Extracted the decision into `install-admin-gate.ts` (`assertInstallAllowed`), unit-tested in isolation (6 cases), and called from `install()`. The route-level `adminProcedure` gates are asserted via grep (the plan's own verify mechanism for routes).

## Known Stubs

None. All four files implement complete logic. The compose-sanitizer and admin-gate are pure functions fully exercised by unit tests; the apps.ts/routes.ts wiring is the live install path.

## Success Criteria

- **SC5 — non-admin blocked from addRepository / non-builtin / cred installs; dangerous non-builtin directives stripped or rejected before docker compose up:** SATISFIED in code/unit.
  - `addRepository`/`removeRepository` are `adminProcedure` (grep-confirmed at routes.ts:42/52). A non-admin tRPC call hits `requireRole('admin')` → `FORBIDDEN`.
  - `install()` calls `assertInstallAllowed` → a non-admin installing a `requiresLocalAiClis`/`requiresAiProvider` app or a new non-builtin community app gets `InstallForbidden` (Tests 2/3/4); a member installing a plain builtin still succeeds (Test 1).
  - A non-builtin compose with `privileged:true` + docker.sock → `privileged` stripped + reported, docker.sock bind → `ComposeRejected` (install aborts) — Tests 1/3. Stripping runs BEFORE `docker compose up` (install()) / `docker compose up -d` (installForUser()).
- **SC7 — builtin/platform apps unchanged + WS-B inject mounts survive sanitization:** SATISFIED.
  - The sanitizer runs ONLY on `!isGeneratedTemplate` (install) and the per-user marketplace path — builtin (`generateAppTemplate`) + platform-DB (`fetchPlatformTemplate`) composes are never passed to it, so Portainer's docker.sock and OpenHands' accepted mounts persist (T-256C-05 accept).
  - OpenDesign (`requiresLocalAiClis`, `isGeneratedTemplate===true` verified) is NOT sanitized; even on the community path the CLI_MOUNT_PREFIX allowlist preserves the WS-B `:ro` `credproxy-ca.pem` CA cert + glibc/node/CLI/wrapper mounts (Test 5, fix F). Ordering invariant: sanitize BEFORE the WS-B inject in install() → injected mounts are added post-sanitize.
  - inject-local-ai-clis.test.ts 18/18 regression-green — WS-B inject behaviour unchanged.

Live SC5/SC7 probes (the plan's `<verification>`: non-admin `apps.addRepository` → FORBIDDEN; install a community `privileged:true`+docker.sock app → rejected; Portainer install keeps docker.sock; OpenDesign keeps WS-B mounts) require the Mini PC deploy = **256-05** (this plan is local code + tests only, per the execution rules).

## Self-Check: PASSED

- All 4 created files exist on disk: compose-sanitizer.ts, compose-sanitizer.test.ts, install-admin-gate.ts, install-admin-gate.test.ts.
- All 3 task commits present in `git log`: `8ec87bea`, `3746e981`, `5b4b1460`.
- 15 WS-C unit cases (9 sanitizer + 6 admin-gate) green; 18 inject-local-ai-clis regression cases green. `tsc -p packages/livinityd` clean on the WS-C wiring. `adminProcedure` grep matches addRepository (routes.ts:42) + removeRepository (routes.ts:52). sacred-SHA hook PASS (20 files) on every commit.

## Next

Ready for **256-04** (WS-D Auth Fail-Closed). All four WS-C files are additive/distinct from 256-02's apps.ts edits (no overlap with the WS-B credential-injection regions). Live SC5/SC7 synthetic probes land with the Mini PC deploy in **256-05**.
