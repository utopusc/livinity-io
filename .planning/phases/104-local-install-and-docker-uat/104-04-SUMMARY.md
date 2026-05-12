---
phase: 104
plan: "04"
subsystem: install + livinityd-domain
tags: [hybrid, cloudflare, dns-01, caddy, lets-encrypt, server5, control-plane, tRPC]
requires:
  - 104-02 (install.sh dispatch + mode-hybrid.sh stub)
  - 104-03 (caddy.ts + local-dns/routes.ts shapes — APPEND-only contract)
provides:
  - livos/packages/livinityd/source/modules/local-dns/hybrid-provision.ts (Server5 control-plane API client)
  - generateHybridCaddyfile + validateHybridDomain in caddy.ts (APPEND)
  - tRPC local.{activateHybrid,getHybridStatus} (APPEND to local.* router)
  - scripts/install/mode-hybrid.sh real body (xcaddy + cf-token + Server5 mint)
affects:
  - livos/packages/livinityd/source/modules/domain/caddy.ts (APPEND — 2 new exports)
  - livos/packages/livinityd/source/modules/domain/caddy.test.ts (APPEND — 13 new tests)
  - livos/packages/livinityd/source/modules/local-dns/routes.ts (APPEND — 2 procedures + 1 schema + 3 Redis keys)
  - livos/packages/livinityd/source/modules/local-dns/routes.test.ts (APPEND — 5 new tests + mock extension)
  - livos/packages/livinityd/source/modules/server/trpc/common.ts (APPEND — 2 httpOnlyPaths entries)
  - scripts/install/mode-hybrid.sh (stub body → real implementation)
tech-stack:
  added:
    - Caddy `caddy-dns/cloudflare` plugin via xcaddy build
    - systemd EnvironmentFile drop-in pattern for caddy.service
    - Server5 `/api/hybrid/provision` control-plane endpoint client
  patterns:
    - Append-only edits to shared 104-03 files (Wave 3 parallel-safety contract)
    - Negative-grep static testing of generator output (data-plane invariant proof)
    - Mode-gated public ACME via Cloudflare API token (defense-in-depth: 0700 dir + 0600 file + umask 0077)
    - Recoverable error class (ServerSideProvisionUnavailable) for install.sh fallback dispatch
key-files:
  created:
    - livos/packages/livinityd/source/modules/local-dns/hybrid-provision.ts
    - livos/packages/livinityd/source/modules/local-dns/hybrid-provision.test.ts
    - .planning/phases/104-local-install-and-docker-uat/104-04-SUMMARY.md
  modified:
    - livos/packages/livinityd/source/modules/domain/caddy.ts (APPEND-only)
    - livos/packages/livinityd/source/modules/domain/caddy.test.ts (APPEND-only)
    - livos/packages/livinityd/source/modules/local-dns/routes.ts (APPEND-only)
    - livos/packages/livinityd/source/modules/local-dns/routes.test.ts (APPEND-only)
    - livos/packages/livinityd/source/modules/server/trpc/common.ts (APPEND-only)
    - scripts/install/mode-hybrid.sh (stub body → real implementation)
decisions:
  - D-104-RELAY-ZERO-DATA-PLANE realized at code-generation level — static negative-grep test proves Server5 IP (45.137.194.102) AND Server4 IP (45.137.194.103) absent from generateHybridCaddyfile output
  - D-104-NO-PROD-IMPACT preserved — generateFullCaddyfile UNTOUCHED; cloud-mode regression test re-asserts (no `dns cloudflare {env...}` directive bleeds into cloud output)
  - Append-only contract respected for all 5 shared 104-03 files — no existing test/procedure/export was modified or removed
  - mode-hybrid.sh exits gracefully (warns, never abort) when xcaddy install or Server5 endpoint are unavailable — install.sh succeeds end-to-end; Caddy issuance is the only deferred surface
  - Hybrid Redis key namespace: `livos:domain:hybrid_subdomain`, `livos:domain:hybrid_zone_id`, `livos:domain:cf_api_token_secret_ref` (path only, NEVER token itself)
metrics:
  duration: "~25min"
  completed: "2026-05-12T00:30:00.000Z"
  commits: 3
  tests_added: 28
  tests_passed: 52
  test_files: 5
---

# Phase 104 Plan 04: Hybrid Mode Backend Summary

HYBRID mode (the DEFAULT install.sh mode per D-104-DEFAULT-MODE) is now code-complete. install.sh `--mode hybrid` produces a working Cloudflare DNS-01 → Let's Encrypt wildcard cert pipeline that keeps Server5 zero-touch on the data plane: Cloudflare hosts a LivOS-provisioned `<random>.home.livinity.io` A-record pointing at the user's LAN IP, the local Caddy issues an LE cert via DNS-01 challenges (Cloudflare API token), and all subsequent client traffic flows LAN-direct without ever crossing Server5.

## One-Liner

Cloudflare DNS-01 wildcard cert + Server5-provisioned `<random>.home.livinity.io` apex subdomain + zero-data-plane invariant proven by static negative-grep test — wired end-to-end through livinityd local-dns module + install.sh dispatch, with cloud-mode contract untouched.

## What Shipped

### Task 1 — `hybrid-provision.ts` module + tests (commit `9a9801c8`)

NEW module `livos/packages/livinityd/source/modules/local-dns/hybrid-provision.ts`:

- `provisionHybridSubdomain({hostIp, cloudflareApiToken, fetcher?})` — POSTs to `https://livinity.io/api/hybrid/provision`; returns `{subdomain, zoneId}` on 200; strict response-shape validation (must match `<label>.home.livinity.io` apex regex).
- `ServerSideProvisionUnavailable` error class with `recoverable: true` flag — thrown on 404/503/network error so install.sh can fall back to manual-prompt path.
- Token redaction: error messages NEVER include the `cloudflareApiToken` (T-104-04-I1 mitigation verified by test — `super-secret-token-123` literal absent from all error paths).
- `LIVINITY_INSTALL_TOKEN` env honored as `Authorization: Bearer <token>` header (forward-compatible with future control-plane gating).
- `writeCfTokenSecret(token, filePath)` — writes EnvironmentFile-shaped 0600-mode file; defense-in-depth via parent-dir 0700 + explicit chmod (some filesystems silently ignore writeFile mode arg).
- `HYBRID_TOKEN_SECRET_PATH = '/etc/livos/secrets/cf-token'` constant — referenced by mode-hybrid.sh systemd drop-in.

**Tests:** 10 cases — happy path / 404 / 503 / network error / recoverable flag / malformed (missing zoneId) / malformed (wrong apex) / token-leak / LIVINITY_INSTALL_TOKEN env / 0600 file write.

### Task 2 — caddy.ts + caddy.test.ts + routes.ts + routes.test.ts + common.ts (commit `edfc4a80`)

**caddy.ts** (APPEND-only — 2 new exports):

- `validateHybridDomain(domain)` — accepts user-owned domains (e.g. `home.bruceoz.com`) AND `<random>.home.livinity.io`; rejects `.local` TLDs (route to `generateLocalCaddyfile` instead), IPv4-shaped strings, traversal patterns, empty/over-253-chars input.
- `generateHybridCaddyfile(hybridDomain, subdomains?, multiUser?)` — emits wildcard + bare-apex + optional multi-user subdomain blocks. Each block carries `tls { dns cloudflare {env.CLOUDFLARE_API_TOKEN} }` for LE DNS-01 wildcard. **Every `reverse_proxy` line targets `127.0.0.1:*`** — generator-level proof that data plane stays LAN-direct.

**caddy.test.ts** (APPEND-only — 13 new tests, total now 25/25):

- 5 validateHybridDomain cases
- 5 generateHybridCaddyfile cases (including a 127.0.0.1-only reverse_proxy invariant)
- 1 cloud-mode regression case (no `dns cloudflare {env...}` directive in generateFullCaddyfile)
- **2 D-104-RELAY-ZERO-DATA-PLANE negative-grep cases** — assert Server5 IP `45.137.194.102` AND Server4 IP `45.137.194.103` absent from `generateHybridCaddyfile` output, AND no `reverse_proxy *livinity.io` host reference. One uses the contract-literal object-arg cast (plan-checker iteration 2 spec); the other exercises the real positional signature.

**routes.ts** (APPEND-only — 2 procedures + 1 zod schema + 3 Redis key constants):

- `local.activateHybrid` mutation: zod-validates `subdomain` (via `validateHybridDomain`) + `zoneId` (non-empty, max 100 chars) + `hostIp` (IPV4_RE) + optional `subdomains[]`. Generates Caddyfile, writes it, reloads Caddy, then writes 4 Redis keys (`livos:domain:local_mode=hybrid`, `hybrid_subdomain`, `hybrid_zone_id`, `host_ip`).
- `local.getHybridStatus` query: returns `{subdomain, zoneId, hostIp, cfTokenAvailable: boolean}`. Last field probed via `fs.stat(cfTokenPath)` — best-effort, never reads the token itself (information-disclosure mitigation).

**routes.test.ts** (APPEND-only — 5 new tests, total 8/8; mock extended with `generateHybridCaddyfile` + `validateHybridDomain`):

- rejects `.local` subdomain (route to local-lan instead)
- rejects invalid hostIp (zod `999.999.999.999`)
- writes 4 Redis keys + calls generateHybridCaddyfile + writeCaddyfile + reloadCaddy
- getHybridStatus returns full shape from Redis
- getHybridStatus returns nulls when no state

**common.ts** (APPEND-only — 2 new `httpOnlyPaths`):

- `'local.activateHybrid'` + `'local.getHybridStatus'` — clustered immediately after the 104-03 local.* trio. Same WS-reconnect-survival rationale (1-5s wall-clock for systemctl reload + Redis MSET + fs.stat).

### Task 3 — `mode-hybrid.sh` real body (commit `62a526b1`)

Replaces the stub from 104-02 with three idempotent helpers + a dispatch entry:

**`_verify_caddy_cloudflare_plugin`:** `caddy list-modules | grep ^dns.providers.cloudflare` short-circuits if already present. Else installs xcaddy (apt → fallback `go install` with `GOBIN=/usr/local/bin`), then `xcaddy build --with github.com/caddy-dns/cloudflare` in mktemp dir, atomically swaps `/usr/bin/caddy`. **Graceful exit:** if xcaddy is uninstallable OR build fails, warns and continues (does NOT abort install.sh — operator can manually rebuild Caddy + restart; `local_mode=hybrid` Redis key still set so the wizard works on the next run).

**`_write_cf_token_secret`:** Creates `/etc/livos/secrets/` with mode 0700, writes `cf-token` with mode 0600 via `umask 0077` + explicit `chmod` (defense-in-depth). Format: `EnvironmentFile`-shaped `CLOUDFLARE_API_TOKEN=<token>`. Provisions `/etc/systemd/system/caddy.service.d/livos-cf-token.conf` with `EnvironmentFile=/etc/livos/secrets/cf-token` (idempotent via `grep -qF` guard), then `systemctl daemon-reload`. Writes `livos:domain:cf_api_token_secret_ref=<path>` (the PATH, NEVER the token itself).

**`_provision_hybrid_subdomain`:** `curl -fsSL -X POST` to `https://livinity.io/api/hybrid/provision` with `--max-time 30`. On unreachable/non-2xx: interactive prompt fallback (if stdin is a tty) OR silent skip (non-interactive — UI wizard handles on first run). JSON parsed via `jq` if available, else `grep | sed` fallback.

**Token never echoed** — verified by `grep 'echo.*CLOUDFLARE_API_TOKEN' scripts/install/mode-hybrid.sh` returning empty. Only heredoc + curl `--data` carry the token, never stdout/stderr.

## Test Counts

```
$ npx vitest run --testTimeout 60000 source/modules/local-dns source/modules/domain/caddy.test.ts
✓ source/modules/local-dns/dnsmasq-config.test.ts   (5 tests)
✓ source/modules/local-dns/pki.test.ts              (4 tests)
✓ source/modules/local-dns/hybrid-provision.test.ts (10 tests)  ← NEW
✓ source/modules/domain/caddy.test.ts               (25 tests)  ← 12 existing + 13 new
✓ source/modules/local-dns/routes.test.ts           (8 tests)   ← 3 existing + 5 new
Tests: 52 passed (52)
```

| File | Pre-104-04 | Added by 104-04 | Total |
|------|-----------:|----------------:|------:|
| local-dns/dnsmasq-config.test.ts | 5 | 0 | 5 |
| local-dns/pki.test.ts | 4 | 0 | 4 |
| local-dns/hybrid-provision.test.ts | 0 | 10 | 10 |
| domain/caddy.test.ts | 12 | 13 | 25 |
| local-dns/routes.test.ts | 3 | 5 | 8 |
| **Total** | **24** | **28** | **52** |

Plan target: ≥19 new assertions. Achieved: **28 new / 52 total PASS**. Test run duration: 0.55s.

## Acceptance Criteria

| AC | Status | Evidence |
|----|--------|----------|
| AC-104-15 (hybrid mode wired) | Code-shipped | mode-hybrid.sh produces Cloudflare-DNS-01-shaped Caddyfile via `local.activateHybrid` Redis writes + generator; **runtime tcpdump assertion deferred to plan 104-07 UAT** |
| D-104-RELAY-ZERO-DATA-PLANE | **PASS** | `caddy.test.ts` "generateHybridCaddyfile output never references Server5 IP 45.137.194.102 (and Server4 IP 45.137.194.103) — no `reverse_proxy *livinity.io` line" PASS (×2 cases) |
| D-104-NO-PROD-IMPACT (cloud mode untouched) | **PASS** | `caddy.test.ts` "generateFullCaddyfile cloud output contains NO `dns cloudflare {env...}` directive" PASS (×1) — REGRESSION test from 104-03 still PASS (×2) |
| D-104-DEFAULT-MODE preserved | Verified | `scripts/install/parse-cli.sh` already defaults `MODE=hybrid`; this plan's mode-hybrid.sh body is what runs on default install |
| D-104-CADDY-PKI-IMPORT (local-lan only) | N/A | Hybrid mode has no pki block — Caddy issues LE certs directly. Generator omits any `pki` / `import` / `ca liv-local` / `issuer internal` directive (test PASS) |

## Threat Model Coverage

All STRIDE entries from the plan's `<threat_model>` are mitigated at code level:

| Threat ID | Status |
|-----------|--------|
| T-104-04-S1 (MITM Server5) | Mitigated — `https://livinity.io/api/hybrid/provision`; curl `-fsSL` rejects bad certs |
| T-104-04-T1 (malicious subdomain response) | Mitigated — `HYBRID_DOMAIN_RE` enforces `<label>.home.livinity.io` apex match; `evil.example.com` payload rejected (test PASS) |
| T-104-04-I1 (token leak in errors) | Mitigated — test asserts `SECRET` literal absent from all error paths (including `.cause` chain) |
| T-104-04-I2 (cf-token world-readable) | Mitigated — `umask 0077` + `chmod 0600` + 0700 parent dir; 0600 file write verified by `writeCfTokenSecret` test |
| T-104-04-I3 (backdoored xcaddy build) | Accepted (per plan) — pinned to `github.com/caddy-dns/cloudflare`; future hardening = checksum verification |
| T-104-04-R1 (orphan CF records on re-mint) | Mitigated — install.sh skips provision if `livos:domain:hybrid_subdomain` already set; idempotent contract per AC-104-2 |
| T-104-04-D1 (Server5 endpoint flood) | Mitigated — same skip-on-existing-key guard |
| T-104-04-E1 (xcaddy build as root) | Accepted (per plan) — mktemp build dir; install.sh requires root anyway |

## Deviations from Plan

None — plan executed exactly as written, with the negative-grep test added in plan-checker round 2 included verbatim (both object-arg-cast and positional-signature forms).

The plan's `<verify>` block for Task 2 used `pnpm --filter @livos/livinityd` filter; the actual package name in `livos/packages/livinityd/package.json` is `livinityd` (not `@livos/livinityd`), so I ran the tests via `npx vitest run` from the package directory directly. This affected the runner invocation only — every assertion in the plan still ran and passed.

## Sacred SHA Preservation

`liv/packages/core/src/sdk-agent-runner.ts` hash verified UNTOUCHED at every commit:

| Commit | Sacred SHA |
|--------|------------|
| Pre-Task-1 | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ |
| After `9a9801c8` (Task 1) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ |
| After `edfc4a80` (Task 2) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ |
| After `62a526b1` (Task 3) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ |

## Carry-Forward to 104-05 (Enrollment Wizard UI)

Hybrid backend is now ready for the UI:

- `trpcReact.local.activateHybrid.useMutation()` accepts `{subdomain, zoneId, hostIp, subdomains?}` — wizard's HybridSetup step calls this after Server5 mint (or after user paste of manual subdomain).
- `trpcReact.local.getHybridStatus.useQuery()` returns `{subdomain, zoneId, hostIp, cfTokenAvailable}` — wizard's done-step renders these in a confirmation card; `cfTokenAvailable: false` blocks the "Activate" button with a "set CLOUDFLARE_API_TOKEN and re-run install.sh" toast.
- ModePickStep should label "hybrid" as **Recommended** (per D-104-DEFAULT-MODE) and show the Apple-device-friendly note (per D-104-INSTALL-MODES row).

## Carry-Forward to 104-07 (UAT)

Plan 104-07's runtime tcpdump assertion is the **complementary** check to the static negative-grep tests added here:

- caddy.test.ts proves the Caddyfile generator CANNOT route data-plane via Server5 (code-level, deterministic).
- 104-07 tcpdump proves the running Caddy instance, in the UAT container, DOES NOT emit any packet to `45.137.194.102` during a page load (runtime, observational).

Both must pass for the D-104-RELAY-ZERO-DATA-PLANE invariant to ship.

## Self-Check: PASSED

- `livos/packages/livinityd/source/modules/local-dns/hybrid-provision.ts` exists ✓
- `livos/packages/livinityd/source/modules/local-dns/hybrid-provision.test.ts` exists ✓
- `livos/packages/livinityd/source/modules/domain/caddy.ts` — `generateHybridCaddyfile` + `validateHybridDomain` exports added ✓
- `livos/packages/livinityd/source/modules/domain/caddy.test.ts` — 13 new tests appended (validateHybridDomain ×5, generateHybridCaddyfile ×5, cloud-mode no-`dns cloudflare` regression ×1, negative-grep D-104-RELAY-ZERO-DATA-PLANE ×2) ✓
- `livos/packages/livinityd/source/modules/local-dns/routes.ts` — `local.activateHybrid` + `local.getHybridStatus` procedures + `hybridActivateSchema` + 3 Redis-key constants appended ✓
- `livos/packages/livinityd/source/modules/local-dns/routes.test.ts` — 5 new tests appended; mock extended with `generateHybridCaddyfile` + `validateHybridDomain` ✓
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — `'local.activateHybrid'` + `'local.getHybridStatus'` appended after the 104-03 trio ✓
- `scripts/install/mode-hybrid.sh` — real body installed (162 insertions; bash -n PASS; `install_mode_hybrid` exported) ✓
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 3 commits ✓
- 52/52 vitest pass (5 dnsmasq + 4 pki + 10 hybrid-provision + 25 caddy + 8 routes) ✓
- Commit `9a9801c8` (Task 1) found in git log ✓
- Commit `edfc4a80` (Task 2) found in git log ✓
- Commit `62a526b1` (Task 3) found in git log ✓
