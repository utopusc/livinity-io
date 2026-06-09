---
phase: 262-security-hardening-pass-3
plan: 262-04
subsystem: security
tags: [trpc, adminProcedure, authz, ssrf, cifs, mount-options, cred-egress-proxy, docker-bridge, bind-on-first-use, node-test]

# Dependency graph
requires:
  - phase: 261-security-research-pass
    provides: SECURITY-RESEARCH-PASS-3.md LIVOS-046/048/050/051/056 (file:line, exploit sketch, recommendation, verifier note)
  - phase: 256-public-app-access
    provides: cred-egress proxy (cred-egress-proxy.ts) + the __livinity_credproxy__ injection slot this plan adds a per-app token to; adminProcedure/requireRole fail-closed helpers (256-04)
provides:
  - system.shutdown/system.restart as adminProcedure (server-side)
  - files routes sharePassword/addShare/removeShare/formatExternalDevice/unmountExternalDevice/addNetworkShare/removeNetworkShare/discoverNetworkSharesOnServer as adminProcedure
  - external-storage formatExternalDevice + unmountExternalDevice deviceId strict-regex + USB-only external-set membership guard
  - network-storage CIFS charset validation + 0600 credentials= file mount + loopback/RFC1918/link-local/metadata SMB host SSRF block
  - cred-egress proxy per-app token registry (bind-on-first-use) + CONNECT token gate + docker-bridge-gateway bind (not 0.0.0.0)
affects: [262-05 operator walk, WS6 UFW-deny 13129 operator step, future requiresLocalAiClis install lifecycle (token revoke-on-uninstall hook)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "tRPC authz hardening = swap privateProcedure/publicProcedureWhenNoUserExists -> adminProcedure server-side (UI adminOnly flag is not a security boundary; routes are reachable from the Files app too)"
    - "destructive device sink = strict shape regex + membership in a trusted enumerated set BEFORE interpolation, never the caller's raw id"
    - "mount-option injection killed structurally: pass secrets via a 0600 credentials= file under a 0700 mkdtemp dir, deleted in finally — not inline -o option strings"
    - "proxy per-container identity = opaque token delivered via HTTPS_PROXY userinfo (Proxy-Authorization: Basic), bind-on-first-use to the source IP (no docker-inspect race)"
    - "bind a host-side proxy to the docker-bridge gateway interface (host-gateway IP), keep the source-IP CIDR at /12 so per-app br-* (172.18.x) still reaches it; the token, not the CIDR, is the auth"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/system/routes.ts
    - livos/packages/livinityd/source/modules/files/routes.ts
    - livos/packages/livinityd/source/modules/files/external-storage.ts
    - livos/packages/livinityd/source/modules/files/network-storage.ts
    - livos/packages/livinityd/source/modules/files/network-storage.integration.test.ts
    - livos/packages/livinityd/source/modules/apps/cred-egress-proxy.ts
    - livos/packages/livinityd/source/modules/apps/cred-egress-proxy.test.ts
    - livos/packages/livinityd/source/modules/apps/inject-local-ai-clis.ts
    - livos/packages/livinityd/source/modules/apps/inject-local-ai-clis.test.ts

key-decisions:
  - "addNetworkShare/discoverNetworkSharesOnServer promoted from publicProcedureWhenNoUserExists straight to adminProcedure — the unauthenticated pre-onboarding window was the worst case, and these are SSRF probe primitives"
  - "DEVICE_ID_RE /^(sd[a-z]+|nvme\\d+n\\d+|mmcblk\\d+)$/ + #getExternalDevices() (USB-transport-only) membership applied to BOTH formatExternalDevice AND the unmountExternalDevice /sys/block eject path"
  - "CIFS creds delivered via 0600 -o credentials=<file> (deleted in finally) — option-string injection is impossible even if the /[\\n\\r,=]/ charset reject is ever bypassed"
  - "isPrivateSmbHost blocks loopback/127.0.0.0/8, RFC1918, 169.254.0.0/16 (incl. 169.254.169.254 metadata), IPv6 ::1 + fc00::/7; LIVOS_ALLOW_PRIVATE_SMB_HOSTS=1 is a test-only escape (the integration suite mounts samba on localhost)"
  - "cred-egress: token is the PRIMARY auth; isFromBridge stays a coarse /12 docker-bridge gate (NOT narrowed to /16 — that would 403 the legit requiresLocalAiClis container on a br-* network)"
  - "bind-on-first-use over docker-inspect: the container's compose-network IP is not deterministic at inject time; the token claims its source IP on first CONNECT and is pinned, avoiding a race"
  - "server.listen binds resolveBridgeGatewayAddr() (docker0 gateway); falls back to 127.0.0.1 (NEVER 0.0.0.0) with a warning when docker0 is absent"

patterns-established:
  - "Settings/Files privileged backend = adminProcedure + server-side input validation; never trust the UI adminOnly flag"

requirements-completed: [LIVOS-046, LIVOS-048, LIVOS-050, LIVOS-051, LIVOS-056]

# Metrics
duration: ~35min
completed: 2026-06-09
---

# Phase 262 Plan 04: Settings authz + cred-egress isolation Summary

**Power/storage/share mutations + the Samba secret are now adminProcedure server-side; formatExternalDevice can no longer target the OS disk (strict regex + USB-only membership); CIFS creds travel via a 0600 credentials= file and the SMB host param can no longer reach internal/metadata services; the cred-egress proxy gains a per-app bind-on-first-use token + a docker-bridge-gateway bind so a stray container can no longer borrow the operator's OAuth subscription.**

## Performance

- Three atomic commits, one per task; all on master.
- tsc baseline preserved (466-line error set identical modulo line-number shifts; zero new errors across all three tasks).
- Tests: cred-egress-proxy 17/17, inject-local-ai-clis 18/18, install-admin-gate 6/6 — all green via `tsx --test` (the package's node:test convention).

## What shipped

### Task 1 (LIVOS-048/050/056) — commit f21ecbaa
- `system.shutdown` / `system.restart`: `privateProcedure` → `adminProcedure` (mirrors `factoryReset`; closes the non-admin management-plane DoS + power-off).
- `files/routes.ts`: 8 routes promoted to `adminProcedure` — `sharePassword` (128-char Samba secret), samba `addShare`/`removeShare`, `formatExternalDevice`, `unmountExternalDevice`, `addNetworkShare` (was `publicProcedureWhenNoUserExists` — unauth pre-onboarding), `removeNetworkShare`, `discoverNetworkSharesOnServer`. Read-only `list`/`externalDevices`/`listNetworkShares`/`viewPreferences` left public-when-no-user per plan.
- `external-storage.ts`: `DEVICE_ID_RE` + `#getExternalDevices()` (USB-transport-only) membership check inserted BEFORE any `sgdisk`/`wipefs`/`parted`/`mkfs`; the same shape guard added to `unmountExternalDevice`'s `/sys/block/${deviceId}/device/delete` eject path.

### Task 2 (LIVOS-051) — commit 54dc92c3
- `network-storage.ts`: `assertValidSmbHost` (`SMB_HOST_RE` + `isPrivateSmbHost` SSRF block) and `assertValidSmbShareAndCreds` (`SMB_SHARE_RE` + strict `/[\n\r,=]/` credential reject) run at `addShare`, `#mountShare` (the 60s re-mount loop sink), `discoverSharesOnServer`, and `isServerAnLivinityDevice`.
- `#mountShare` no longer interpolates `username=...,password=...` into the `-o` string; it writes a 0600 `credentials=` file under a 0700 `mkdtemp` dir, mounts with `-o credentials=<file>,uid=,gid=,iocharset=utf8`, and deletes the file in `finally` (success OR failure).
- `LIVOS_ALLOW_PRIVATE_SMB_HOSTS=1` test-harness escape; the integration suite (mounts samba on localhost) opts in.

### Task 3 (LIVOS-046, TDD) — commit d7642873
- `cred-egress-proxy.ts`: per-app token registry — `registerAppToken`/`revokeAppToken`/`mintAppToken`/`checkAppToken`/`parseAppToken` with bind-on-first-use; CONNECT gate now requires a known token (Proxy-Authorization Basic or X-Livinity-App-Token) AFTER `isFromBridge`, returning 403 on absent/unknown/wrong-source. `resolveBridgeGatewayAddr()` + `server.listen(CREDPROXY_PORT, bindAddr)` (docker0 gateway; loopback fallback, never 0.0.0.0). `isFromBridge` kept at /12 so per-app br-* sources still pass.
- `inject-local-ai-clis.ts`: mints + registers an unbound per-app token and delivers it via `HTTPS_PROXY=http://app:<token>@livinity-credproxy:13129`; re-issues when the proxy URL is unset or already ours (keeps disk + in-memory registry in sync across reapply/restart).
- Tests: 6 new RED→GREEN cases (checkAppToken bind/pin/revoke, pre-bind, parseAppToken both shapes, tokenless 403, unknown-token 403, per-app br-* acceptance); existing CONNECT tests updated to present a token; inject Test 2c updated for the userinfo contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated existing tests that encoded the now-obsolete contracts**
- **Found during:** Task 2 + Task 3.
- **Issue:** (a) `network-storage.integration.test.ts` mounts a samba server on `localhost`, which the new SSRF guard rejects; (b) `inject-local-ai-clis.test.ts` Test 2c asserted `HTTPS_PROXY === http://livinity-credproxy:13129` (no userinfo), which the new per-app-token delivery breaks; (c) existing cred-egress CONNECT tests (8/9/11) connected with no token, which the new mandatory token gate would 403 before reaching the behavior under test.
- **Fix:** (a) integration test opts into `LIVOS_ALLOW_PRIVATE_SMB_HOSTS=1` (charset/cred validation NOT bypassed); (b) Test 2c now asserts the `app:<48-hex>@credproxy` userinfo shape; (c) tests 8/9/11 register + present a per-app token (bind-on-first-use to the loopback test client).
- **Files modified:** `network-storage.integration.test.ts`, `inject-local-ai-clis.test.ts`, `cred-egress-proxy.test.ts`.
- **Commits:** 54dc92c3 (a), d7642873 (b, c).

### Scope-respected (NOT done — documented)

**revokeAppToken on app uninstall/stop** — the plan's action item 4 said to wire `revokeAppToken` "where the inject lifecycle has a teardown hook." There is NO teardown hook inside this plan's `files_modified` set (`inject-local-ai-clis.ts` has only inject/wrapper-write/no-op-ACL); the uninstall lifecycle lives in `apps.ts`, which is OUT of this plan's `files_modified` (and the orchestrator's hard constraint forbids touching it). `revokeAppToken` is exported, unit-tested, and ready; wiring it into `apps.uninstall()` is deferred to a follow-up that may edit `apps.ts`. Residual risk is minimal: the token is an unguessable 48-hex secret delivered only to the now-removed container's compose, and the in-memory registry is cleared on every livinityd restart.

## Authentication gates

None encountered — all work is code-only.

## Known Stubs

None. All changes are wired end-to-end (the cred-egress token is delivered to the container compose; the validators run on the real router/mount/probe paths).

## TDD Gate Compliance

Task 3 carried `tdd="true"`. Implementation and the new test cases were authored together (the box has a working `openssl`, so the suite runs GREEN). RED is demonstrable: the six new tests reference `registerAppToken`/`revokeAppToken`/`mintAppToken`/`checkAppToken`/`parseAppToken`, none of which existed before commit d7642873 — against the pre-implementation source the file fails to import (RED). Commit `d7642873` is a single `feat(...)` carrying both the implementation and the tests (GREEN, 17/17). No separate `test(...)` RED commit was made; the gate sequence is documented here per the plan's `type: execute` (not `type: tdd`) classification.

## CODE ONLY — NO DEPLOY confirmation

No `update.sh`, `systemctl`, `ufw`, `ssh`, or any live-box mutation was run. The live UFW-deny 13129 (and UFW-deny 3020) remain operator WS6 steps. Repo edits + three atomic commits only. The cred-egress gateway-interface bind narrows the proxy's reach in code; the firewall rule is the operator's transfer-disposition backstop (T-262-22).

## Self-Check: PASSED

- Files exist (modified): all 9 files present and committed.
- Commits exist: f21ecbaa, 54dc92c3, d7642873 all in `git log`.
- Verification: `shutdown: adminProcedure` + `restart: adminProcedure` match; `! grep password=${share.password}` passes (0 hits); `server.listen(CREDPROXY_PORT, bindAddr` present; 8 files-route adminProcedure declarations; cred-egress 17/17 + inject 18/18 green; tsc 466-line error set unchanged (zero new).
