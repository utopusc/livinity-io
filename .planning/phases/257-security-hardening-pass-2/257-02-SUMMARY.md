---
phase: 257-security-hardening-pass-2
plan: 02
subsystem: infra
tags: [ssrf, dns-rebind, loopback-bind, ufw, mcp, app-store, security-hardening]

# Dependency graph
requires:
  - phase: 256-security-hardening-contained-autonomy
    provides: "addRepository made adminProcedure (256-03); webapps/url-validator validateUrl/isPrivateHost"
provides:
  - "livinityd admin daemon (:8080) binds 127.0.0.1 by default (LIVOS_BIND_HOST override) — LAN admin-console surface removed (LIVOS-015)"
  - "deploy-livinityd.sh _dld_harden_firewall — ufw deny 8080/tcp (defense in depth, ufw-guarded)"
  - "apps.addRepository SSRF gate — webapps validateUrl (scheme allowlist + isPrivateHost) before any git fetch (LIVOS-024)"
  - "mcp-ssrf-guard.assertResolvedHostSafe — resolve + per-IP private/loopback/link-local/ULA check incl IPv4-mapped IPv6 + integer-encoded IPs (LIVOS-038)"
affects: [257-06, mcp-client-manager, app-store, deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dependency-free testable helper module (bind-host.ts) so a one-line config decision is unit-testable without importing the native-addon server graph"
    - "Resolve-and-check SSRF guard: canonicalize host (strip brackets, ::ffff: map, decimal/hex/octal int IPv4) → DNS-resolve via injectable lookup → classify every IP"

key-files:
  created:
    - livos/packages/livinityd/source/modules/server/bind-host.ts
    - livos/packages/livinityd/source/modules/server/index.bind.test.ts
    - livos/packages/livinityd/source/modules/apps/app-repository.test.ts
    - liv/packages/core/src/mcp-ssrf-guard.ts
    - liv/packages/core/src/mcp-ssrf-guard.test.ts
  modified:
    - livos/packages/livinityd/source/modules/server/index.ts
    - livos/packages/livinityd/source/modules/apps/app-repository.ts
    - livos/packages/livinityd/source/modules/apps/app-store.ts
    - livos/packages/livinityd/source/modules/apps/app-repository.integration.test.ts
    - liv/packages/core/src/mcp-client-manager.ts
    - scripts/install/deploy-livinityd.sh

key-decisions:
  - "Kept AppRepository.url as the RAW input (not res.normalized) — cleanUrl() hashes this.url for the on-disk app-store cache dir + the persisted dedup key; normalizing would orphan every existing clone and shift dedup keys. Security gate fully enforced regardless."
  - "Factored resolveBindHost() into a standalone dependency-free module so the bind decision is unit-testable on any platform (importing index.ts pulls native addons / fails on Windows)."
  - "_dld_harden_firewall only adds the deny rule when ufw is already present AND active — never enables ufw mid-install (would risk locking out a remote operator); the loopback bind is the primary mitigation, the ufw rule is defense in depth."
  - "Ported the private-range predicate into mcp-ssrf-guard.ts rather than importing the livos webapps validator — keeps liv/ dependency-free across the package boundary."

patterns-established:
  - "SSRF guards classify EVERY resolved address (DNS-rebind safe), not just the literal hostname."
  - "IP canonicalization must cover IPv4-mapped IPv6 and integer-encoded (decimal/hex/octal) hostnames before classification."

requirements-completed: [LIVOS-015, LIVOS-024, LIVOS-038]

# Metrics
duration: 12 min
completed: 2026-06-03
---

# Phase 257 Plan 02: Network & Request-Forgery Surface (WS-C) Summary

**livinityd admin daemon loopback-bound (127.0.0.1) + UFW-denied off the LAN, apps.addRepository gated by the reused webapps SSRF validator, and a resolve-and-check MCP SSRF guard that closes DNS-rebind / IPv4-mapped-IPv6 / integer-encoded-IP bypasses.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-03T14:11:00Z
- **Completed:** 2026-06-03T14:20:00Z
- **Tasks:** 3 (all TDD)
- **Files modified:** 11 (5 created, 6 modified)

## Accomplishments
- **LIVOS-015:** the admin daemon's `listen()` now passes a bind host (`127.0.0.1` default via `resolveBindHost()`; `LIVOS_BIND_HOST` override for overlay opt-in) instead of binding `INADDR_ANY`, removing the LAN admin-console attack surface. `deploy-livinityd.sh` adds `_dld_harden_firewall` (ufw deny 8080/tcp, guarded) as defense in depth.
- **LIVOS-024:** `AppRepository` constructor runs `validateUrl` (scheme allowlist + `isPrivateHost`) before any `git.clone` / `git.listServerRefs`, threading `isAdmin` (default strict). The adminProcedure-gated `addRepository` + trusted persisted `getRepositories` pass `isAdmin:true`.
- **LIVOS-038:** new `assertResolvedHostSafe()` canonicalizes the host and validates every resolved IP; `mcp-client-manager.validateUrl` is now async and delegates to it (awaited at `connectServer`).

## Task Commits

1. **Task 1: loopback bind + UFW deny :8080 (LIVOS-015)** — `13ef7444` (fix, TDD)
2. **Task 2: webapps SSRF validator on apps.addRepository (LIVOS-024)** — `eb88bc48` (fix, TDD)
3. **Task 3: MCP SSRF guard resolve + per-IP check (LIVOS-038)** — `d8e1c8ba` (fix, TDD)

## Still-Exists Verification (read before edit)
- **LIVOS-015:** OPEN — `server/index.ts` `this.server.listen(targetPort, () => {...})` had no host arg (INADDR_ANY). FIXED.
- **LIVOS-024:** OPEN — `app-repository.ts` constructor used a bare `new URL()` check; `validateUrl` existed but was unapplied; 256-03 added admin-gate but no SSRF guard. FIXED.
- **LIVOS-038:** OPEN — `mcp-client-manager.ts validateUrl` tested only `parsed.hostname` against regexes, no DNS, no `::ffff:` / integer normalization. FIXED.

## Tests
- `index.bind.test.ts` (vitest) — 3 cases: loopback default, `LIVOS_BIND_HOST` override, empty-fallback. **PASS.**
- `app-repository.test.ts` (vitest) — 6 cases: reject 169.254/RFC1918/`file:`/`gopher:`, allow public https, admin carve-out. **PASS.**
- `mcp-ssrf-guard.test.ts` (tsx + node:assert) — 12 cases: literal-private, IPv4-mapped IPv6, DNS-rebind (resolver-returns-private), public-allowed, decimal/hex IP, IPv6 ::1 / link-local / ULA, bad scheme, public literal. **12 passed, 0 failed.**
- `bash -n scripts/install/deploy-livinityd.sh` — **clean.**
- `tsc --noEmit` on `liv/packages/core` — **0 errors**; livinityd changed files — no type errors.

## SC-C Confirmation (loopback bind keeps Caddy/localhost working)
The listen bind defaults to `127.0.0.1`. Caddy's `reverse_proxy 127.0.0.1:8080` (both `deploy-livinityd.sh` and the runtime `caddy.ts` generator) targets loopback, and liv-core↔livinityd calls are loopback — all on the same interface the daemon now binds. The public Caddy front door and internal loopback path are therefore preserved; only off-host (LAN) reach to `:8080` is removed. The `_dld_harden_firewall` ufw rule does not filter the `lo` interface, so loopback traffic is unaffected. **SC-C met.** (On-box probe `ss -tlnp | grep 8080 → 127.0.0.1:8080` is deferred to the Mini PC; no deploy in this plan.)

## Decisions Made
- **Keep `this.url` raw, not normalized** (LIVOS-024): the plan said use `res.normalized.toString()`, but `cleanUrl()` hashes `this.url` to name the on-disk app-store cache dir and the persisted `appRepositories` set is keyed on the raw url. Substituting the normalized form recomputes every cache-dir hash (verified DIFF for all 6 cleanUrl integration fixtures) → orphans existing clones + breaks dedup. The security gate (reject private/scheme) is fully enforced on the raw input either way, so only the cosmetic normalization was dropped. (Deviation Rule 1.)
- Factored `resolveBindHost()` into its own module so the bind decision is unit-testable cross-platform (importing `index.ts` pulls native `drivelist`, unavailable on Windows).
- `_dld_harden_firewall` is conservative: skips when ufw absent/inactive (warn-not-fail) and never enables ufw itself.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Kept AppRepository.url raw instead of normalized**
- **Found during:** Task 2 (apps.addRepository SSRF gate)
- **Issue:** The plan's literal instruction (`this.url = res.normalized.toString()`) would change `cleanUrl()`'s hash for every repo (it hashes `this.url`), renaming the on-disk app-store cache directory and shifting the persisted dedup key — verified DIFF for all 6 `cleanUrl()` integration fixtures. That orphans existing clones and re-clones on next boot.
- **Fix:** Validate with `validateUrl` (full SSRF gate) but assign `this.url = url` (raw). Security unchanged; cache-dir + dedup-key stability preserved.
- **Files modified:** app-repository.ts, app-store.ts
- **Verification:** app-repository.test.ts (6/6) green; cleanUrl fixtures unchanged (raw url → identical hashes).
- **Committed in:** eb88bc48

**2. [Rule 3 - Blocking] Threaded isAdmin into AppRepository call sites + fixed stale integration assertion**
- **Found during:** Task 2
- **Issue:** Adding the `isAdmin` constructor opt required updating the two `new AppRepository(...)` call sites in app-store.ts (`getRepositories`, `addRepository`) so trusted/admin paths pass `isAdmin:true`; the existing `app-repository.integration.test.ts` asserted the old `'Invalid URL'` message which the new gate replaces with `'Invalid repository URL: …'`.
- **Fix:** Passed `isAdmin:true` at both trusted call sites; updated the integration test's expectation to `'Invalid repository URL'`. (app-store.ts + the integration test are beyond the plan's `files_modified` list but are required for the change to compile and keep the existing suite green.)
- **Files modified:** app-store.ts, app-repository.integration.test.ts
- **Verification:** app-repository.test.ts green; integration assertion now matches the wrapped message.
- **Committed in:** eb88bc48

**3. [Rule 3 - Blocking] deploy-livinityd.sh had no existing `ufw allow 8080` to replace**
- **Found during:** Task 1
- **Issue:** The plan assumed an existing `ufw allow 8080/tcp` line to DELETE/replace; the script had no firewall region at all.
- **Fix:** Added a new `_dld_harden_firewall` step (idempotent `ufw delete allow 8080*` then `ufw deny 8080/tcp`, guarded on `command -v ufw` + active status) wired into the pipeline after Caddy setup. Net effect (no LAN allow on :8080) matches the plan's intent.
- **Files modified:** scripts/install/deploy-livinityd.sh
- **Verification:** `bash -n` clean.
- **Committed in:** 13ef7444

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking). **Impact:** all necessary for correctness/compile/green-suite; the raw-url decision avoids a real cache/dedup regression the plan's literal text would have introduced. No scope creep beyond the wiring required for the three findings.

## Issues Encountered
- The livinityd vitest in this repo is **v4.1.8**, not the v2.1.9 noted in the plan's `<interfaces>` — no impact (same `npx vitest run` API).
- Integration tests that construct `new Livinityd(...)` cannot run on Windows (native `drivelist` binding ENOENT). Unit tests were designed dependency-light (stub Livinityd / standalone modules) so all three suites run locally; the integration suite runs on the Mini PC / CI.

## User Setup Required
None - no external service configuration required. (`LIVOS_BIND_HOST` is an optional operator opt-in for overlay reach; default is loopback.)

## Next Phase Readiness
- WS-F (257-06) edits `server/index.ts` in a DIFFERENT region (container-name match); this plan's edit is isolated to the `tryListen` `listen()` call (~line 2009) — no overlap.
- No deploy performed (Mini PC only; local code + tests). On-box SC-C probes (`ss -tlnp`, `curl <LAN-IP>:8080`) pending the next Mini PC deploy.

## Self-Check: PASSED
- All 5 created files exist on disk.
- All 3 task commits (13ef7444, eb88bc48, d8e1c8ba) present in git log.
- All unit suites green (bind 3/3, app-repository 6/6, mcp-ssrf-guard 12/12); `bash -n` clean; `tsc --noEmit` 0 errors on liv core.

---
*Phase: 257-security-hardening-pass-2*
*Completed: 2026-06-03*
