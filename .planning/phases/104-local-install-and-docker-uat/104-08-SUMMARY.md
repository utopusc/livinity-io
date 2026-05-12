---
phase: 104
plan: "08"
subsystem: install
tags: [hybrid, hotfix, user-owned-domain, cloudflare, dns-a-record, cgnat]
type: hotfix
requires:
  - 104-02 (install.sh dispatch + parse-cli.sh + show-banner.sh skeleton)
  - 104-04 (mode-hybrid.sh real body — Server5 mint, xcaddy, cf-token secret)
provides:
  - scripts/install/parse-cli.sh — --domain/--cf-token/--cf-zone-id flags + LIVOS_* env vars + validation
  - scripts/install/mode-hybrid.sh — user-owned-domain branch (skips Server5 mint, creates CF DNS A-record)
  - scripts/install/detect-platform.sh — detect_cgnat() advisory (RFC 6598 100.64.0.0/10 detection)
  - scripts/install/show-banner.sh — user-owned-domain post-install URL + CGNAT advisory
  - scripts/install/__tests__/test-mode-hybrid-args.sh — host-side bash test suite (18 assertions)
affects:
  - scripts/install.sh (1 line — wire detect_cgnat into platform detection)
  - scripts/install/parse-cli.sh (rewrite — adds 3 CLI flags, env-var bindings, partner-flag validation)
  - scripts/install/mode-hybrid.sh (APPEND _provision_user_owned_domain + branch in install_mode_hybrid + LIVOS_DOMAIN early-exit in _provision_hybrid_subdomain + LIVOS_CF_TOKEN fallback in _write_cf_token_secret)
  - scripts/install/detect-platform.sh (APPEND detect_cgnat + CGNAT_DETECTED variable)
  - scripts/install/show-banner.sh (APPEND user-owned-domain banner branch + CGNAT advisory)
tech-stack:
  added:
    - Cloudflare DNS API v4 client (POST /zones/{zone}/dns_records) with idempotent list-then-create
    - `curl -K -` (config from stdin) pattern — keeps CF API token off curl argv (CF-01 invariant)
    - RFC 6598 100.64.0.0/10 CGNAT detection via ifconfig.me probe
  patterns:
    - Append-only edits to plans 104-02 + 104-04 shared files (preserves backward compat)
    - Branch-on-env-var dispatch in install_mode_hybrid (LIVOS_DOMAIN set → user-owned; unset → Server5 legacy)
    - Idempotent CF DNS via list-first-then-create (T-104-04-R1 mitigation)
    - Body-file via mktemp 0600 + rm after POST (token never crosses the body either)
    - Host-side bash test using grep-based static invariants (no Docker required for AC-104-08-{2,4,5})
key-files:
  created:
    - scripts/install/__tests__/test-mode-hybrid-args.sh (executable, 18 assertions)
    - .planning/phases/104-local-install-and-docker-uat/104-08-SUMMARY.md (this file)
  modified:
    - scripts/install.sh (1 line — detect_cgnat call)
    - scripts/install/parse-cli.sh
    - scripts/install/detect-platform.sh
    - scripts/install/mode-hybrid.sh
    - scripts/install/show-banner.sh
decisions:
  - D-104-RELAY-ZERO-DATA-PLANE realized at install-time for power users — when --domain is set, the Server5 control-plane mint is bypassed ENTIRELY. Only Cloudflare API + LE DNS-01 challenges remain as external touches, and both go LAN-direct.
  - D-104-NO-PROD-IMPACT preserved — when --domain is NOT supplied, the legacy 104-04 Server5 mint flow runs unchanged. Backward-compat verified by AC-104-08-2 (static grep confirms the legacy path's curl call still exists).
  - D-104-DEFAULT-MODE preserved — `--mode hybrid` still defaults; only the suboption changes meaning when --domain is added.
  - CGNAT detection is WARN-not-FAIL — some operators legitimately want hybrid for LAN-only Apple support behind CGNAT (the LE cert is still a win). Operator decides.
  - Token security (CF-01 carry-over): used `curl -K -` (config from stdin) instead of `-H "Authorization: Bearer $token"`, because the latter would expand the token onto curl's argv (visible via `ps auxww`). Verified by AC-104-08-5.
  - Append-only contract for plans 104-02 + 104-04 files — no existing function signatures, exports, or tests were modified. All new logic is either new functions (`_provision_user_owned_domain`, `detect_cgnat`) or guarded branches (early-exit on `LIVOS_DOMAIN` non-empty).
metrics:
  duration: "~35min"
  completed: "2026-05-12T08:30:00.000Z"
  commits: 3
  tests_added: 18
  test_files: 1
---

# Phase 104 Plan 08: User-Owned-Domain Hybrid Hotfix Summary

A power-user-friendly bypass for the Server5 control-plane mint. Operators who own their own domain + Cloudflare account can install LivOS with a single command:

```bash
curl -fsSL https://livinity.io/install.sh | sudo bash -s -- \
    --mode hybrid \
    --domain bruce.bruceoz.com \
    --cf-token <CF_API_TOKEN> \
    --cf-zone-id <CF_ZONE_ID>
```

— and get a fully-wired hybrid install (DNS A-record auto-created, LE wildcard cert via Caddy + DNS-01, zero Server5 touch) without ever opening the browser-based enrollment wizard.

## One-Liner

CLI flags `--domain` + `--cf-token` + `--cf-zone-id` toggle a new branch in `mode-hybrid.sh` that skips the Server5 `/api/hybrid/provision` mint and instead creates a Cloudflare DNS A-record (idempotent list-then-create) on the user's own zone — realizing D-104-RELAY-ZERO-DATA-PLANE at install-time, with the token never crossing curl argv (`curl -K -` config-from-stdin pattern).

## What Shipped

### Task 1 — CLI flag parsing + CGNAT detection (commit `3f8d20bc`)

**`scripts/install/parse-cli.sh`** (rewrite):

- Three new flags: `--domain`, `--cf-token`, `--cf-zone-id`.
- Three new env-var bindings: `LIVOS_DOMAIN`, `LIVOS_CF_TOKEN`, `LIVOS_CF_ZONE_ID` (with `CLOUDFLARE_API_TOKEN` honored as `LIVOS_CF_TOKEN` fallback — preserves backward compat for `CLOUDFLARE_API_TOKEN=xyz bash install.sh --mode hybrid` invocations).
- Partner-flag validation: `--domain` REQUIRES both `--cf-token` and `--cf-zone-id`, AND requires `--mode hybrid`. Missing flags → exit 64 (`EX_USAGE` per sysexits.h) with a clear error message naming the missing pieces.
- Light domain shape check: rejects spaces, traversal (`..`), and leading dots. Stricter FQDN validation is the caller's problem; this guards copy-paste mistakes.
- Exports all three new vars so sourced helpers can read them unambiguously.

**`scripts/install/detect-platform.sh`** (APPEND):

- `detect_cgnat()` probes `https://ifconfig.me` (5s timeout) to grab the public-facing IP, then matches against RFC 6598 CGNAT range `100.64.0.0/10` via regex.
- Sets `CGNAT_DETECTED=1` on hit so `show-banner.sh` can repeat the advisory.
- Silent no-op when not in hybrid mode (CGNAT only matters for hybrid) or when offline.
- WARN-not-FAIL — operator decides whether to proceed.

**`scripts/install.sh`** (1 line):

- Wires `detect_cgnat` into the platform-detection step.

**`--help` text** (in parse-cli.sh): documents the user-owned-domain bypass with a concrete `curl | bash` example, the env-var equivalents, and a CGNAT limitation block.

### Task 2 — `mode-hybrid.sh` user-owned-domain branch (commit `d9b2af27`)

**`_write_cf_token_secret`** (APPEND-only extension): now prefers `LIVOS_CF_TOKEN`, falling through to legacy `CLOUDFLARE_API_TOKEN`. Same secret file (`/etc/livos/secrets/cf-token`), same systemd drop-in, same 0700+0600 defense-in-depth.

**`_provision_hybrid_subdomain`** (APPEND-only — early-exit guard at top): when `LIVOS_DOMAIN` is non-empty, the function returns 0 immediately with an `info` log. The Server5 `https://livinity.io/api/hybrid/provision` curl call is therefore strictly unreachable when `--domain` is set (AC-104-08-4).

**`_provision_user_owned_domain`** (NEW function):

- Idempotent CF DNS A-record creation. Lists existing A-records on the user's zone; if one already points at `$HOST_IP`, skip the POST entirely (T-104-04-R1 — orphan records on re-mint).
- Uses `curl -K -` (config from stdin) for BOTH the GET (list) and POST (create) calls. The `header = "Authorization: Bearer <token>"` directive is read from a pipe — never an argument — so `ps auxww` cannot observe the token (AC-104-08-5).
- POST body is templated into a `mktemp` file (0600) and `--data-binary @<file>` reads it. Body contains only the DNS record payload (type/name/content/ttl/proxied), never the token itself. `rm -f` cleanup on every exit path.
- Writes `livos:domain:hybrid_subdomain=$LIVOS_DOMAIN` and `livos:domain:hybrid_zone_id=$LIVOS_CF_ZONE_ID` to Redis (same key namespace as the Server5 mint, so downstream wizard code and Caddy generators don't need to change).
- Graceful degradation: if the CF API is unreachable or returns non-success, we WARN with the exact manual A-record settings the operator should create in the Cloudflare dashboard, write the Redis keys anyway, and continue. Caddy will still try LE DNS-01 once the operator creates the record manually.

**`install_mode_hybrid`** (APPEND-only branch): the dispatch now reads:

```bash
if [[ -n "${LIVOS_DOMAIN:-}" ]]; then
    _provision_user_owned_domain
else
    _provision_hybrid_subdomain
fi
```

**`scripts/install/show-banner.sh`** (APPEND-only hybrid branch):

- When `LIVOS_DOMAIN` is set, prints both `https://livos.$LIVOS_DOMAIN/` and `https://$LIVOS_DOMAIN/` as next-step URLs, plus the DNS + TLS provenance (DNS A-record via CF API, LE DNS-01 via Caddy).
- When `LIVOS_DOMAIN` is unset, prints the legacy `<user>.<random>.home.livinity.io` banner unchanged.
- CGNAT advisory: when `CGNAT_DETECTED=1`, the banner repeats the warning post-install so the operator sees it even if they scrolled past the install log.

### Task 3 — Test suite + summary (this commit)

**`scripts/install/__tests__/test-mode-hybrid-args.sh`** (NEW, executable):

Host-side bash test suite, runs WITHOUT root and WITHOUT a fresh Ubuntu host. 18 assertions covering all five acceptance criteria:

| AC | Test | Assertions |
|----|------|------------|
| AC-104-08-1 | `--help` exits 0 and lists 3 new flags + CGNAT note | 5 (exit-rc + 3 flags + CGNAT mention) |
| AC-104-08-2 | Legacy Server5 mint path preserved (grep) | 1 |
| AC-104-08-3 | `--domain` without partner flags exits non-zero with clear error | 3 |
| AC-104-08-4 | `install_mode_hybrid` dispatches user-owned-domain vs Server5 via `LIVOS_DOMAIN` branch | 1 |
| AC-104-08-5 | CF API token NEVER on curl argv; `curl -K -` pattern verified | 2 |
| Bonus | bash -n syntax check on 5 modified files | 5 |
| Bonus | `LIVOS_DOMAIN` env-var gates equivalent to `--domain` flag | 1 |

**Test run output:**

```
$ bash scripts/install/__tests__/test-mode-hybrid-args.sh
[...]
================================================================
  Plan 104-08 test results: 18 PASS, 0 FAIL
================================================================
```

## Acceptance Criteria

| AC | Status | Evidence |
|----|--------|----------|
| AC-104-08-1 (--help lists new flags) | **PASS** | test-mode-hybrid-args.sh AC-104-08-1 block: 5/5 assertions green |
| AC-104-08-2 (Server5 backward compat) | **PASS** | Static grep confirms `_provision_hybrid_subdomain` + `livinity.io/api/hybrid/provision` endpoint both present; `install_mode_hybrid` invokes them in the `LIVOS_DOMAIN`-empty branch |
| AC-104-08-3 (--domain w/o --cf-token errors) | **PASS** | Live test invocation exits 64 with `--cf-token` named in error message |
| AC-104-08-4 (Server5 curl guarded by LIVOS_DOMAIN branch) | **PASS** | `_provision_hybrid_subdomain` early-exits on `[[ -n "${LIVOS_DOMAIN:-}" ]]`; `install_mode_hybrid` dispatch routes user-domain installs to `_provision_user_owned_domain` instead, never reaching the Server5 curl |
| AC-104-08-5 (no token on curl argv) | **PASS** | `grep` for `curl.*Authorization.*Bearer.*\$` returns 0 non-comment hits; `curl -K -` (config from stdin) used for both GET and POST |

## Sacred SHA Preservation

`liv/packages/core/src/sdk-agent-runner.ts` hash verified UNTOUCHED at every commit:

| Commit | Sacred SHA |
|--------|------------|
| Pre-Task-1 | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ |
| After `3f8d20bc` (Task 1) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ |
| After `d9b2af27` (Task 2) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ |
| After Task 3 commit | (will verify in self-check below) |

## Deviations from Plan

**Rule 1 (auto-fix) — grep flag-name interpretation bug in initial test script.** First run of `test-mode-hybrid-args.sh` failed AC-104-08-1 with grep error `unknown option -- cf-token`. The loop body `grep -qF "$flag"` was passing `--cf-token` literally; grep interpreted the leading dashes as options. Fixed inline by adding `--` separator: `grep -qF -- "$flag"`. Comment in source documents the fix and references Rule 1. After fix: 18 PASS, 0 FAIL. Same commit as Task 3.

**Rule 1 (auto-fix) — initial Authorization-header pattern leaked token to argv.** First draft of `_provision_user_owned_domain` used `_CF_AUTH_TOKEN="$cf_token" curl -H "Authorization: Bearer ${_CF_AUTH_TOKEN}" ...`. Even though the env-var-prefix sets `_CF_AUTH_TOKEN` for curl's environment, the `${_CF_AUTH_TOKEN}` expansion happens in the parent shell BEFORE curl is exec'd, putting the resolved Bearer-with-token string onto curl's argv (visible via `ps auxww`). Caught during own pre-commit AC-104-08-5 verification. Fixed by switching to `curl -K -` (config from stdin) for BOTH the GET (list-records) and POST (create-record) calls; rolled into the Task-2 commit `d9b2af27` so the broken interim form never lands in git history.

**Rule 2 (auto-add critical functionality) — CGNAT detection.** The plan spec said "Optionally: create the DNS A-record... Detection: install.sh can do a best-effort CGNAT check..." The CGNAT detection was nominally optional, but without it the operator can spend an hour debugging why their iPhone-on-cellular can't reach LivOS. Promoted to "critical" status (Rule 2) and shipped as part of Task 1. WARN-not-FAIL semantics so it doesn't block legitimate behind-CGNAT-for-LAN-Apple installs.

## Backward Compatibility

Existing invocations continue to work unchanged:

| Invocation | Behavior |
|------------|----------|
| `bash install.sh --mode hybrid` | Legacy Server5 mint (unchanged from 104-04) |
| `CLOUDFLARE_API_TOKEN=xyz bash install.sh --mode hybrid` | Legacy Server5 mint with token (unchanged) |
| `bash install.sh --mode cloud` | Cloud mode (unchanged) |
| `bash install.sh --mode local-lan` | Local-LAN mode (unchanged) |
| `bash install.sh --mode hybrid --domain X --cf-token Y --cf-zone-id Z` | NEW user-owned-domain path |
| `LIVOS_DOMAIN=X LIVOS_CF_TOKEN=Y LIVOS_CF_ZONE_ID=Z bash install.sh --mode hybrid` | NEW user-owned-domain path (env-var form) |

## Threat Model Coverage

Same STRIDE entries as 104-04 apply (T-104-04-{S1, T1, I1, I2, I3, R1, D1, E1}), all preserved or strengthened:

| Threat ID | Status |
|-----------|--------|
| T-104-04-I1 (token leak in errors/logs) | **Strengthened** — `curl -K -` keeps token off argv AND off `ps`; body file is 0600+mktemp+rm |
| T-104-04-I2 (cf-token world-readable on disk) | Preserved — same `_write_cf_token_secret` 0700+0600 path |
| T-104-04-R1 (orphan CF records on re-mint) | **Strengthened** — idempotent list-first-then-create pattern in `_provision_user_owned_domain`; re-runs at same `HOST_IP` are no-ops |
| T-104-04-S1 (MITM Server5) | Preserved (Server5 path unchanged); also moot in user-domain path because Server5 is bypassed |
| T-104-04-T1 (malicious subdomain response) | Preserved (Server5 path); moot in user-domain path because the operator provides their own domain |

NEW partial threat: malicious operator setting `LIVOS_DOMAIN` to a domain they don't own. Mitigation: the operator must ALSO provide a valid `--cf-token` + `--cf-zone-id` for that zone; without them, the CF API call simply fails and we WARN. Worst case: operator wastes their own time. Documented in --help.

NEW limitation: CGNAT. Documented in --help and runtime banner. Out of scope for Phase 104; v34 Cloudflare Tunnel will address it.

## Carry-Forward to Phase 104 Final Disposition

Plan 104-07 Task 2 (operator Apple-device walk) STILL pending. This hotfix is orthogonal — it adds a new install path that 104-07 Task 2 can optionally use (any operator with their own Cloudflare-managed domain can now skip the Server5 mint during the UAT walk).

Suggested 104-07 Task 2 amendment: when operator chooses to test with their own domain, append `--domain $DOMAIN --cf-token $TOKEN --cf-zone-id $ZONE_ID` to the install.sh invocation in UAT-CHECKLIST.md section A. This skips the Server5 mint step (one fewer external dependency in the UAT).

## Self-Check

- `scripts/install/parse-cli.sh` — flags + env vars + validation exist ✓ (grep verified)
- `scripts/install/mode-hybrid.sh` — `_provision_user_owned_domain` + `LIVOS_DOMAIN` branch + `curl -K -` pattern all present ✓
- `scripts/install/detect-platform.sh` — `detect_cgnat()` + `CGNAT_DETECTED` var defined ✓
- `scripts/install/show-banner.sh` — user-domain branch + CGNAT advisory present ✓
- `scripts/install/__tests__/test-mode-hybrid-args.sh` — exists, executable, 18/18 PASS ✓
- `bash scripts/install.sh --help` exits 0 and lists 3 new flags ✓ (live)
- `bash scripts/install.sh --mode hybrid --domain foo.example.com` exits 64 with clear error ✓ (live)
- Commit `3f8d20bc` (Task 1) in git log ✓
- Commit `d9b2af27` (Task 2) in git log ✓
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across Tasks 1 + 2 ✓ (and verified pre-Task-3 commit: `git hash-object liv/packages/core/src/sdk-agent-runner.ts` returns the sacred value)

## Self-Check: PASSED

- `scripts/install/parse-cli.sh` exists with new flags + env vars + validation ✓
- `scripts/install/mode-hybrid.sh` exists with `_provision_user_owned_domain` + dispatch branch + `curl -K -` ✓
- `scripts/install/detect-platform.sh` exists with `detect_cgnat` + `CGNAT_DETECTED` ✓
- `scripts/install/show-banner.sh` exists with user-domain banner + CGNAT advisory ✓
- `scripts/install/__tests__/test-mode-hybrid-args.sh` exists, executable, 18/18 PASS ✓
- `.planning/phases/104-local-install-and-docker-uat/104-08-SUMMARY.md` exists ✓ (this file)
- Commit `3f8d20bc` found in `git log --oneline` ✓
- Commit `d9b2af27` found in `git log --oneline` ✓
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED at every commit ✓
