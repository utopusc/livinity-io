---
phase: 104
plan: "09"
subsystem: install
tags: [tunnel, hotfix, cloudflare-tunnel, cloudflared, cgnat, api-key, marketplace]
type: hotfix
requires:
  - 104-02 (install.sh dispatch + parse-cli.sh + show-banner.sh skeleton)
  - 104-08 (parse-cli.sh --domain / --cf-token / partner-flag validation pattern)
provides:
  - scripts/install.sh — `tunnel` case in mode dispatch
  - scripts/install/parse-cli.sh — `--mode tunnel` whitelist + `--cf-tunnel-token` + `--api-key` flags + LIVOS_CF_TUNNEL_TOKEN / LIVOS_API_KEY env vars + tunnel-mode partner-flag gating + api-key liv_k_ prefix check
  - scripts/install/mode-tunnel.sh — NEW. Public entry install_mode_tunnel() with 6 idempotent helpers (cloudflared install, token secret write, systemd registration, Caddy HTTP-only config, Redis markers, optional api-key save).
  - scripts/install/show-banner.sh — tunnel-mode banner branch + CGNAT advisory rewrite (points at --mode tunnel instead of "wait for v34").
  - scripts/install/__tests__/test-mode-tunnel-args.sh — host-side bash test (24 assertions covering parse-cli gating + D-104-RELAY-ZERO-DATA-PLANE + argv-token negative-grep + bash -n + env-var equivalence + 104-08 backward-compat smoke).
affects:
  - scripts/install.sh (1-line dispatch case addition for `tunnel`)
  - scripts/install/parse-cli.sh (rewrite — adds whitelist entry, 2 CLI flags, env-var bindings, partner-flag validation, api-key prefix check)
  - scripts/install/show-banner.sh (adds tunnel-mode banner block + updates hybrid-mode CGNAT advisory message)
tech-stack:
  added:
    - cloudflared (Cloudflare Tunnel daemon) — installed from pkg.cloudflare.com Debian repo (signed-by gpg + apt source list)
    - `cloudflared service install <token>` — first-time systemd unit + daemon registration
    - Cloudflare Tunnel "outbound-only" connectivity model (no public IP / no port-forward / CGNAT-compatible)
    - Caddy `auto_https off` directive — disables Caddy's automatic ACME path entirely (CF edge handles TLS)
  patterns:
    - Sibling-helper file naming: mode-tunnel.sh follows mode-cloud.sh / mode-local-lan.sh / mode-hybrid.sh structure (top-of-file doc block, private `_*` helpers, public `install_mode_<name>` entry point).
    - Append-only edits to plan 104-02 + 104-08 shared files (parse-cli.sh, install.sh, show-banner.sh) — existing function signatures, exports, and tests preserved 1:1.
    - Token file write via printf+redirection (NEVER on argv) — same security idiom as plan 104-08 mode-hybrid.sh _write_cf_token_secret. One unavoidable argv exposure documented in source (cloudflared CLI shape).
    - Host-side bash test using grep-based static invariants (no Docker required for AC checks).
key-files:
  created:
    - scripts/install/mode-tunnel.sh (241 lines, executable bit not set — sourced not executed)
    - scripts/install/__tests__/test-mode-tunnel-args.sh (executable, 24 assertions)
    - .planning/phases/104-local-install-and-docker-uat/104-09-SUMMARY.md (this file)
  modified:
    - scripts/install.sh
    - scripts/install/parse-cli.sh
    - scripts/install/show-banner.sh
decisions:
  - D-104-RELAY-ZERO-DATA-PLANE realized at install-time for a 3rd path (after 104-04 hybrid + 104-08 user-owned-domain hybrid). When `--mode tunnel`, install.sh never references Server5 / livinity.io / 45.137.194.10x in any code or comment path — verified by host-side test grep (TEST 6).
  - D-104-NO-PROD-IMPACT preserved — cloud / local-lan / hybrid behavior unchanged. 104-08's 18 tests still pass 1:1.
  - D-104-DEFAULT-MODE preserved — `--mode hybrid` still defaults when `--mode` omitted. Tunnel is opt-in.
  - Token security: CF Tunnel token writes via `printf '%s\n' > file` + `chmod 0600` + dir 0700. CF Tunnel daemon reads from the systemd-managed config (not argv). ONE unavoidable argv exposure: the first-time `cloudflared service install <token>` call accepts the token positionally — scoped to that one install-time call, documented in source.
  - API key (`--api-key liv_k_...`) is ORTHOGONAL to tunnel mode. It's parsed in all modes (validated against Server5 marketplace schema `liv_k_*` prefix), but currently only mode-tunnel.sh persists it (Phase 104 scope ends here; other modes can wire `_write_api_key_secret_if_provided` in follow-ups).
  - cloudflared install: official pkg.cloudflare.com apt repo (signed-by + dearmored gpg) — NOT a direct .deb download. This is the recommended path per CF docs and gives apt-managed updates. (mode-cloud.sh uses a direct .deb because livos/install.sh:509 does for byte-equivalence — different invariant, different choice.)
  - Caddyfile in tunnel mode: minimal, `auto_https off`, `:80 { reverse_proxy 127.0.0.1:8080 }`. NO `pki` block, NO `tls internal`, NO `tls { dns cloudflare }`. The CF edge does TLS termination; Caddy serves plain HTTP locally.
  - Append-only contract for plans 104-02 + 104-08 files — no existing function signatures, exports, or tests were modified. All new logic is either a new file (mode-tunnel.sh), new function (`_*` helpers there), or a guarded branch (e.g. tunnel-case in install.sh dispatch).
metrics:
  duration: "~50min"
  completed: "2026-05-12T08:55:00.000Z"
  commits: 3
  tests_added: 24
  test_files: 1
---

# Phase 104 Plan 09: Cloudflare Tunnel Install Mode Hotfix Summary

A 4th install mode `--mode tunnel` for users who want LivOS reachable from the public internet WITHOUT a public IP, port-forward, or any inbound network exposure. Cloudflare Tunnel (cloudflared) dials outbound from the LivOS host to the CF edge; CF edge terminates TLS; cloudflared forwards to local Caddy:80 → livinityd:8080.

```bash
curl -fsSL https://livinity.io/install.sh | sudo bash -s -- \
    --mode tunnel \
    --domain bruceoz.com \
    --cf-tunnel-token <CF_TUNNEL_TOKEN> \
    --api-key liv_k_iCCxIa7vlFgbpOl-fPwd
```

→ Operator opens `https://bruce.bruceoz.com` from ANY device (iPhone on cellular, Mac behind apartment-ISP CGNAT, work network with strict firewall, doesn't matter) → CF edge → CF Tunnel → operator's Ubuntu box → green padlock (CF-managed cert), zero Server5 traffic.

## One-Liner

A new `--mode tunnel` install path adds Cloudflare-Tunnel-backed outbound-only connectivity (cloudflared apt install + systemd service registration + minimal HTTP-only Caddyfile) — bypassing public-IP / CGNAT / port-forward requirements entirely, with zero references to Server5 anywhere in the code path.

## What Shipped

### Task 1 — CLI flags + dispatch + banner (commit `55acaa5c`)

**`scripts/install/parse-cli.sh`** (rewrite):
- Added `tunnel` to `MODE_WHITELIST`
- Added `--cf-tunnel-token` and `--api-key` CLI flags + `LIVOS_CF_TUNNEL_TOKEN` / `LIVOS_API_KEY` env-var bindings
- Extended `--domain` validation: now accepted in both `hybrid` AND `tunnel` modes; rejected elsewhere
- New tunnel-mode partner-flag gate: `--mode tunnel` requires `--domain` AND `--cf-tunnel-token`; `--cf-tunnel-token` rejected when `--mode != tunnel`
- New api-key prefix check: `liv_k_*` required (matches Server5 marketplace schema)
- `--help` rewritten: lists 4 modes (was 3); adds tunnel-mode block, api-key block, tunnel example invocation; CGNAT advisory now points operators at `--mode tunnel` instead of "wait for v34"

**`scripts/install.sh`** (1 line + 1 comment):
- Dispatch case: `tunnel) source "$SCRIPT_DIR/mode-tunnel.sh"; install_mode_tunnel ;;`
- Comment update for the dispatch block referencing 104-09

**`scripts/install/show-banner.sh`** (append + edit):
- New `tunnel)` case in the mode-aware banner: post-install URL, TLS-at-CF-edge note, "no public IP / no Server5 traffic" reassurance
- Hybrid mode CGNAT advisory rewritten — was "wait for v34", now "Re-run with --mode tunnel (Plan 104-09) — Cloudflare Tunnel is outbound-only and works behind CGNAT"

Backward compat: all 18 of plan 104-08's host-side tests still PASS 1:1 after this commit.

### Task 2 — mode-tunnel.sh body (commit `0955eb55`)

**`scripts/install/mode-tunnel.sh`** (NEW, 241 lines):

Public entry `install_mode_tunnel()` calls six idempotent private helpers in order:

1. **`_install_cloudflared_for_tunnel`** — Idempotent install via pkg.cloudflare.com signed apt repo. Short-circuits when `cloudflared` already on PATH. Writes `/usr/share/keyrings/cloudflare-main.gpg` (mode 0644) + `/etc/apt/sources.list.d/cloudflared.list` (mode 0644).

2. **`_write_cf_tunnel_token_secret`** — `printf '%s\n' "$LIVOS_CF_TUNNEL_TOKEN" > /etc/livos/secrets/cf-tunnel-token` with dir 0700 + file 0600. Token NEVER lands on any tool's argv via env-var interpolation (verified by host-side test TEST 7). Also writes Redis key `livos:domain:cf_tunnel_token_secret_ref`.

3. **`_register_cloudflared_service`** — First-time: `cloudflared service install <token>` registers the systemd unit AND starts the daemon. Re-runs: short-circuits when service already enabled, restarts to pick up potentially-changed token. ONE unavoidable argv exposure documented in source — scoped to install-time, the system is being installed as root, the secret is at 0600 immediately above.

4. **`_configure_caddy_for_tunnel`** — Writes minimal Caddyfile: `{ auto_https off }` + `:80 { reverse_proxy 127.0.0.1:8080 }`. NO `pki`, NO `tls internal`, NO `tls { dns cloudflare }` — CF edge does TLS. `caddy validate` before reload. Idempotent atomic write via `.new` → `mv -f`.

5. **`_persist_tunnel_mode_redis`** — Writes `livos:domain:local_mode=tunnel` + `livos:domain:tunnel_domain=$LIVOS_DOMAIN` + `livos:domain:host_ip=$HOST_IP` via the shared `set_livos_redis_key` helper (deferred-file fallback when Redis is unreachable at install time — same pattern as plans 104-03/04/06).

6. **`_write_api_key_secret_if_provided`** — Optional. No-op when `LIVOS_API_KEY` unset. Otherwise: writes `/etc/livos/secrets/api-key` (0600) + Redis key `livos:account:api_key_path` pointing at it.

### Task 3 — host-side tests + SUMMARY + STATE/ROADMAP (this commit)

**`scripts/install/__tests__/test-mode-tunnel-args.sh`** (NEW, executable, 24 assertions):

| Test | Assertion | Plan AC |
|------|-----------|---------|
| 1 | `install.sh --help` shows `tunnel`, `--cf-tunnel-token`, `--api-key` (≥3 lines + tunnel example) | AC-104-09-1 |
| 2 | `--mode tunnel` without `--cf-tunnel-token` exits 64 with usage error | AC-104-09-2 |
| 3 | `--mode tunnel --cf-tunnel-token foo` without `--domain` exits 64; also `--mode hybrid --cf-tunnel-token` rejected | AC-104-09-3 |
| 4 | `--api-key sk-bad-prefix` exits 64 with `liv_k_`-required message | AC-104-09-4 |
| 5 | Full valid invocation (`--mode tunnel --domain X --cf-tunnel-token Y --api-key liv_k_Z`) passes parse_cli cleanly (exits at downstream root/OS gate, NOT 64) + token doesn't leak into output | AC-104-09-5 |
| 6 | `mode-tunnel.sh` contains ZERO `livinity.io` / `45.137.194.10x` / `nexus.livinity` / `relay.livinity` refs | D-104-RELAY-ZERO-DATA-PLANE |
| 7 | No `curl` / `cloudflared` invocation interpolates `${LIVOS_CF_TUNNEL_TOKEN}` or `${LIVOS_API_KEY}` onto argv | Security |
| 8 | `bash -n` clean on `install.sh`, `parse-cli.sh`, `mode-tunnel.sh`, `show-banner.sh` | Syntax |
| 9 | `LIVOS_CF_TUNNEL_TOKEN` env-var equivalent to `--cf-tunnel-token` CLI flag | Env-var binding |
| 10 | 104-08 hybrid `--domain` validation chain still gates (backward compat regression smoke) | D-104-NO-PROD-IMPACT |

Results: **24 PASS, 0 FAIL** on `bash scripts/install/__tests__/test-mode-tunnel-args.sh`.

Cross-check: **`bash scripts/install/__tests__/test-mode-hybrid-args.sh` still 18/18 PASS** — 104-08 invariants untouched. Combined test surface for tunnel-related work is now 42 assertions across both files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TEST 5 root-check assertion too strict for non-Ubuntu dev hosts**
- **Found during:** Task 3 (running test-mode-tunnel-args.sh)
- **Issue:** TEST 5 expected `must run as root|EUID` in error output after parse_cli passed. On Windows/Mac dev hosts (no `/etc/os-release`), install.sh's OS detection fires FIRST (exit 65) before the root check (exit 1), so the assertion failed.
- **Fix:** Broadened TEST 5's gate-matcher regex to also accept `Unsupported OS|requires Ubuntu`. Either downstream gate firing proves parse_cli passed cleanly through — which is the actual invariant being tested.
- **Files modified:** `scripts/install/__tests__/test-mode-tunnel-args.sh` (in-place inside Task 3 — same commit)
- **Commit:** (this commit)

### Auto-added Functionality

**1. [Rule 2 - Tests] TEST 10 backward-compat regression smoke for 104-08**
- **Rationale:** Plan listed 5 tests but 104-08 invariants are easy to accidentally break when modifying parse-cli.sh. Added a lightweight 10th assertion that re-runs the canonical 104-08 failure case (`--mode hybrid --domain X` without `--cf-token` should still gate). This catches accidental regression in this test file alone, in addition to the full 104-08 test file passing independently.
- **Files modified:** `scripts/install/__tests__/test-mode-tunnel-args.sh`
- **Commit:** (this commit)

**2. [Rule 2 - Tests] TEST 6 + TEST 7 negative-grep gates**
- **Rationale:** Plan listed Tests 1-5 as the canonical AC coverage, but the success-criteria block in the prompt explicitly required (a) D-104-RELAY-ZERO-DATA-PLANE: mode-tunnel.sh has no Server5 IPs / livinity.io refs, and (b) tokens never on argv. These are security/architectural invariants that warrant their own dedicated test assertions, not just "happens to be true in current source".
- **Files modified:** `scripts/install/__tests__/test-mode-tunnel-args.sh`
- **Commit:** (this commit)

No architectural changes (Rule 4) needed; no authentication gates encountered; no checkpoint:* tasks in this plan.

## Threat Surface Scan

No new network surface introduced. Tunnel mode REMOVES inbound network surface (no public IP needed; cloudflared dials outbound only). New files written to disk (`/etc/livos/secrets/cf-tunnel-token`, `/etc/livos/secrets/api-key`) follow the existing 104-08 secret-storage pattern (dir 0700, file 0600).

Tokens flow path:
- `LIVOS_CF_TUNNEL_TOKEN` env-var → `printf > /etc/livos/secrets/cf-tunnel-token` (mode 0600). One install-time argv exposure at `cloudflared service install <token>` documented + scoped + unavoidable per CF CLI shape.
- `LIVOS_API_KEY` env-var → `printf > /etc/livos/secrets/api-key` (mode 0600). NEVER on argv (no CLI tool invocation interpolates it).

## Sacred SHA Verification

`liv/packages/core/src/sdk-agent-runner.ts` git-hash-object value verified UNTOUCHED at `f3538e1d811992b782a9bb057d1b7f0a0189f95f` across all 3 plan-09 commits (pre-commit hook `.husky/pre-commit` + `scripts/check-sacred.sh` fired and passed on every commit).

## Self-Check: PASSED

- File `scripts/install/mode-tunnel.sh`: FOUND
- File `scripts/install/__tests__/test-mode-tunnel-args.sh`: FOUND
- File `scripts/install.sh` modified: confirmed (tunnel dispatch case)
- File `scripts/install/parse-cli.sh` modified: confirmed (whitelist + flags + gating)
- File `scripts/install/show-banner.sh` modified: confirmed (tunnel banner branch)
- Commit `55acaa5c`: FOUND in git log
- Commit `0955eb55`: FOUND in git log
- Tests: `bash scripts/install/__tests__/test-mode-tunnel-args.sh` → 24 PASS, 0 FAIL
- 104-08 backward-compat: `bash scripts/install/__tests__/test-mode-hybrid-args.sh` → 18 PASS, 0 FAIL
- Sacred SHA `f3538e1d…` matches `git hash-object liv/packages/core/src/sdk-agent-runner.ts`
- D-104-RELAY-ZERO-DATA-PLANE: grep on mode-tunnel.sh for forbidden Server5/livinity.io refs → 0 matches
