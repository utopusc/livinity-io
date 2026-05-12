---
phase: 104
plan: "03"
subsystem: install + livinityd-domain
tags: [local-lan, dnsmasq, caddy, pki, tls, tRPC]
requires:
  - 104-02 (install.sh dispatch + mode-local-lan.sh stub)
provides:
  - livos/packages/livinityd/source/modules/local-dns/ module
  - generateLocalCaddyfile + validateLocalTld + LocalSubdomainConfig in caddy.ts
  - GET /api/local/ca.crt public endpoint (mode-gated)
  - tRPC local.{activate,getStatus,getCaCert} namespace
  - install.sh --mode local-lan real body (dnsmasq + Caddy pki-global.conf)
affects:
  - scripts/install/mode-local-lan.sh
  - livos/packages/livinityd/source/modules/server/index.ts
  - livos/packages/livinityd/source/modules/server/trpc/{index,common}.ts
tech-stack:
  added: [dnsmasq (apt), Caddy pki named-CA "liv-local"]
  patterns:
    - Atomic temp+mv for config writes (idempotency contract)
    - Caddy pki block in separate /etc/caddy/pki-global.conf imported by livinityd-generated Caddyfile (D-104-CADDY-PKI-IMPORT)
    - Mode-gated public endpoint (404 unless Redis flag matches)
    - vi.doMock + vi.resetModules for ESM-style mock isolation
key-files:
  created:
    - livos/packages/livinityd/source/modules/local-dns/dnsmasq-config.ts
    - livos/packages/livinityd/source/modules/local-dns/dnsmasq-config.test.ts
    - livos/packages/livinityd/source/modules/local-dns/pki.ts
    - livos/packages/livinityd/source/modules/local-dns/pki.test.ts
    - livos/packages/livinityd/source/modules/local-dns/routes.ts
    - livos/packages/livinityd/source/modules/local-dns/routes.test.ts
    - livos/packages/livinityd/source/modules/domain/caddy.test.ts
    - .planning/phases/104-local-install-and-docker-uat/104-03-SUMMARY.md
  modified:
    - scripts/install/mode-local-lan.sh (stub body → real implementation)
    - livos/packages/livinityd/source/modules/domain/caddy.ts (ADD-only: 3 new exports)
    - livos/packages/livinityd/source/modules/server/index.ts (insert /api/local/ca.crt handler)
    - livos/packages/livinityd/source/modules/server/trpc/index.ts (register local router)
    - livos/packages/livinityd/source/modules/server/trpc/common.ts (3 new httpOnlyPaths)
decisions:
  - D-104-CADDY-PKI-IMPORT realized: pki block in /etc/caddy/pki-global.conf, NOT inlined
  - D-104-NO-PROD-IMPACT enforced via cloud-mode regression test (asserts generateFullCaddyfile has NO pki/import/ca-liv-local directives)
  - LocalSubdomainConfig sibling type introduced (Rule 3 deviation — existing SubdomainConfig has different shape)
  - dangerouslyBypassAuthentication path used in routes.test.ts (existing trpc auth bypass)
metrics:
  duration: "~30min"
  completed: "2026-05-12T07:55:00.000Z"
  commits: 3
  tests_added: 24
  tests_passed: 24
  test_files: 4
---

# Phase 104 Plan 03: Local-LAN Backend Summary

LOCAL-LAN mode backend wired end-to-end — install.sh now installs dnsmasq + provisions Caddy named CA (`liv-local`), livinityd ships a `local-dns/` module mirroring `domain/`'s shape, `generateLocalCaddyfile()` lives next to `generateFullCaddyfile()` (cloud-mode parity proven by regression test), and `GET /api/local/ca.crt` serves the root cert PEM to LAN devices unauthenticated when local-lan mode is active.

## One-Liner

dnsmasq + Caddy internal PKI ("liv-local" named CA) wired through livinityd local-dns module with mode-gated public CA cert download — cloud-mode contract untouched.

## What Shipped

### Task 1 — `mode-local-lan.sh` real body (commit `9bba50ba`)

Replaced the stub from plan 104-02 with two helper functions + the dispatch entry-point:

- `_install_dnsmasq_local_lan`: disables `systemd-resolved` stub listener (Pitfall 2), `apt-get install -y -qq dnsmasq`, writes `/etc/dnsmasq.d/livinity.conf` atomically (temp + `mv -f`), enables + restarts the service.
- `_install_caddy_local_pki`: writes `/etc/caddy/pki-global.conf` with `pki { ca liv-local { name "LivOS Local CA" } }` once, guarded by `grep -qF "ca liv-local"` for idempotency.
- `install_mode_local_lan`: chains both, re-writes the three Redis keys defensively.

Idempotency contract preserved — re-running produces exactly ONE `address=` line in `/etc/dnsmasq.d/livinity.conf` (uses `mv -f`, never appends).

### Task 2 — `local-dns/` module + `caddy.ts` extension + `caddy.test.ts` (commit `4c942de2`)

**New module** `livos/packages/livinityd/source/modules/local-dns/`:

- `dnsmasq-config.ts` — `generateLivinityDnsmasqConfig(tld, hostIp)` emits the SAME byte-for-byte content `mode-local-lan.sh` writes; `writeDnsmasqConfig` + `reloadDnsmasq` complete the service layer.
- `pki.ts` — `readRootCert()` reads Caddy's auto-generated `/var/lib/caddy/.local/share/caddy/pki/authorities/liv-local/root.crt`, with `findRootCertPath()` `find(1)` fallback (RESEARCH §Tertiary Sources: Caddy may relocate).
- `routes.ts` — three procedures (`local.getStatus` query, `local.activate` mutation, `local.getCaCert` query). `local.activate` zod-validates `tld` (via `validateLocalTld`) + `hostIp` (strict IPv4 regex) before any side effect.

**caddy.ts extension** — three new EXPORTS appended (existing `generateFullCaddyfile` UNTOUCHED):

- `LocalSubdomainConfig` interface — sibling to existing `SubdomainConfig` (deviation: existing type has cloud-mode `appId`/`enabled` keys that don't apply to local-lan).
- `validateLocalTld(tld)` — rejects path traversal, IPv4-shaped, whitespace, special chars.
- `generateLocalCaddyfile(localDomain, hostIp, subdomains, multiUser)` — emits `import /etc/caddy/pki-global.conf` as the FIRST non-blank line (D-104-CADDY-PKI-IMPORT realized) + wildcard + bare-domain blocks with `ca liv-local` issuer + HTTP-only block by name AND IP for pre-trust CA download.

**caddy.test.ts** (NEW, 12 tests):

- 5 cases for `validateLocalTld` (valid TLDs, path traversal, IPv4-shaped, whitespace/special chars, empty/too-long).
- 5 cases for `generateLocalCaddyfile` (pki-import first line / wildcard with ca liv-local / bare-domain / HTTP-only by name+IP / multi-user subdomains).
- 2 cases for **cloud-mode regression** (`generateFullCaddyfile` produces NO `import` / NO `pki {` / NO `ca liv-local` / NO `issuer internal` in both single-user and multi-user mode) — **D-104-NO-PROD-IMPACT** enforced at unit-test level.

### Task 3 — server/index.ts + tRPC wiring (commit `8d8cec66`)

- `server/index.ts:1147` — `GET /api/local/ca.crt` handler inserted between legacy `/manager-api/v1/system/update-status` (line 1138) and `/api/mcp` proxy (line 1167). Mode-gated by Redis flag (404 unless `livos:domain:local_mode === 'local-lan'`); 500 on read error; correct `Content-Type: application/x-x509-ca-cert` + `Content-Disposition` headers.
- `server/trpc/index.ts` — `import localDns from '../../local-dns/routes.js'` + `local: localDns` registered in `createAppRouter` (placed next to `domain` for namespace locality).
- `server/trpc/common.ts` — `local.activate` / `local.getStatus` / `local.getCaCert` appended to `httpOnlyPaths` (clustered with `domain.platform.*`).

## Test Counts

`pnpm --filter @livos/livinityd test source/modules/domain/caddy.test.ts source/modules/local-dns/`:

| File | Tests |
|------|-------|
| `local-dns/dnsmasq-config.test.ts` | 5 |
| `local-dns/pki.test.ts` | 4 |
| `local-dns/routes.test.ts` | 3 |
| `domain/caddy.test.ts` | 12 |
| **Total** | **24** |

Plan target: ≥18. Achieved: **24/24 PASS**. Test run duration: 0.58s.

TypeScript: ZERO new errors introduced in our edits (verified by comparing `tsc --noEmit` output before/after Task 3 — pre-existing error count `19` in `server/index.ts` UNCHANGED).

## Acceptance Criteria

| AC | Status | Evidence |
|----|--------|----------|
| AC-104-4 (dnsmasq resolves bruce.livinity.local) | Unit-verified | `dnsmasq-config.test.ts` "emits address= line with leading dot wildcard" PASS — runtime probe deferred to 104-07 UAT inside Docker container |
| AC-104-5 (dnsmasq survives systemctl restart) | Code-shipped | Atomic temp+mv writes to `/etc/dnsmasq.d/livinity.conf` persist across reboot — runtime probe deferred to 104-07 |
| AC-104-6 (/api/local/ca.crt route wired) | Code-shipped | `server/index.ts:1147` literal-grep verified — end-to-end PEM serve deferred to 104-07 |
| AC-104-7 (Caddy local-mode TLS chains to liv-local) | Code-shipped | `generateLocalCaddyfile` emits `ca liv-local` issuer per virtual host — end-to-end cert validation deferred to 104-07 |
| **AC-104-8** (pki-global.conf import is first line) | **PASS** | `caddy.test.ts` "emits import /etc/caddy/pki-global.conf as the first non-blank line" PASS |
| D-104-NO-PROD-IMPACT (cloud mode untouched) | **PASS** | `caddy.test.ts` "generateFullCaddyfile cloud output contains NO pki/import/ca-liv-local" PASS (×2 cases) |

## Deviations from Plan

### Rule 1 — Bug auto-fixes

**1. pki.test.ts startsWith assertion broken on Windows**
- **Found during:** Task 2 vitest run
- **Issue:** `path.join('/var/lib/caddy/.../authorities/liv-local', 'root.crt')` returns `'/var/lib/caddy/.../authorities/liv-local\\root.crt'` on Windows hosts; `startsWith(authorityDir)` then fails because of the trailing backslash separator.
- **Fix:** Normalize both sides with `.replace(/\\/g, '/')` before `startsWith`. Production target is Linux (Mini PC / Docker UAT) — POSIX behavior unchanged; this only affects the Windows test runner.
- **Files modified:** `livos/packages/livinityd/source/modules/local-dns/pki.test.ts`
- **Commit:** `4c942de2`

**2. routes.test.ts hit isAuthenticated middleware**
- **Found during:** Task 2 vitest run
- **Issue:** `privateProcedure.createCaller({...})` routes through `isAuthenticated` middleware which requires `ctx.server.verifyToken(token)` — throws `TRPCError UNAUTHORIZED` because no JWT in test context.
- **Fix:** Set `dangerouslyBypassAuthentication: true` on the test caller context (existing escape hatch in `is-authenticated.ts:12`) + provide minimal `logger` stub.
- **Files modified:** `livos/packages/livinityd/source/modules/local-dns/routes.test.ts`
- **Commit:** `4c942de2`

### Rule 3 — Blocking issue auto-fix

**3. `SubdomainConfig` shape mismatch**
- **Found during:** Task 2 implementing routes.ts
- **Issue:** Plan referenced `SubdomainConfig` from `caddy.ts` for `generateLocalCaddyfile` parameter type, but the existing type is `{subdomain: string, appId: string, port: number, enabled: boolean}` (cloud-mode marketplace shape) — incompatible with the `{name, port}` shape the local-lan generator needs.
- **Fix:** Added new exported `LocalSubdomainConfig` interface `{name: string, port: number}` sibling to existing `SubdomainConfig`. Kept the existing `SubdomainConfig` UNTOUCHED (D-104-NO-PROD-IMPACT).
- **Files modified:** `livos/packages/livinityd/source/modules/domain/caddy.ts`, `livos/packages/livinityd/source/modules/local-dns/routes.ts`
- **Commit:** `4c942de2`

## Sacred SHA Preservation

`liv/packages/core/src/sdk-agent-runner.ts` hash verified UNTOUCHED at every commit:

| Commit | Sacred SHA verified |
|--------|---------------------|
| Pre-Task-1 | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ |
| After `9bba50ba` (Task 1) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ |
| After `4c942de2` (Task 2) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ |
| After `8d8cec66` (Task 3) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ |

## Carry-Forward to 104-04 (Hybrid Mode)

Plan 104-04 will append to several files this plan touched. Append-ready surface:

- `caddy.ts` — `generateHybridCaddyfile` can sit next to `generateLocalCaddyfile`; `LocalSubdomainConfig` can be reused or a new `HybridSubdomainConfig` introduced.
- `caddy.test.ts` — append hybrid `describe` block; cloud-mode regression test continues guarding `generateFullCaddyfile`.
- `local-dns/routes.ts` — has 3 procedures; 104-04 can introduce `local.activateHybrid` here or a sibling `hybrid-dns/routes.ts` module.
- `server/trpc/common.ts` — append hybrid procedure paths after `local.getCaCert`.

All named exports — no default-export collisions.

## Self-Check: PASSED

- `scripts/install/mode-local-lan.sh` exists ✓
- `livos/packages/livinityd/source/modules/local-dns/dnsmasq-config.ts` exists ✓
- `livos/packages/livinityd/source/modules/local-dns/pki.ts` exists ✓
- `livos/packages/livinityd/source/modules/local-dns/routes.ts` exists ✓
- `livos/packages/livinityd/source/modules/local-dns/dnsmasq-config.test.ts` exists ✓
- `livos/packages/livinityd/source/modules/local-dns/pki.test.ts` exists ✓
- `livos/packages/livinityd/source/modules/local-dns/routes.test.ts` exists ✓
- `livos/packages/livinityd/source/modules/domain/caddy.test.ts` exists ✓
- `livos/packages/livinityd/source/modules/domain/caddy.ts` — generateLocalCaddyfile + validateLocalTld + LocalSubdomainConfig added ✓
- `livos/packages/livinityd/source/modules/server/index.ts` — `/api/local/ca.crt` handler at line 1147 ✓
- `livos/packages/livinityd/source/modules/server/trpc/index.ts` — `local: localDns` registered ✓
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — 3 local.* paths added ✓
- Commit `9bba50ba` (Task 1) found in git log ✓
- Commit `4c942de2` (Task 2) found in git log ✓
- Commit `8d8cec66` (Task 3) found in git log ✓
