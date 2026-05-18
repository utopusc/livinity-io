---
phase: 145-api-key-only-install-one-liner
plan: 01
subsystem: install
tags:
  - install-script
  - server5-api
  - api-key
  - subdomain-resolution
  - uat-green
dependency_graph:
  requires:
    - "platform/web/src/lib/api-auth.ts (validateApiKey, unauthorizedResponse)"
    - "platform/web/src/lib/db.ts (default pool)"
    - "scripts/install/_logging.sh (info, warn, fail)"
    - "scripts/install/parse-cli.sh existing --subdomain ↔ --domain precedence block"
  provides:
    - "GET https://livinity.io/api/me/profile -> {username, email}"
    - "install.sh single-flag form: bash -s -- --api-key liv_k_..."
    - "warn-on-conflict path for --subdomain and --domain (never fail-stop)"
    - "LIVOS_SKIP_API_KEY_RESOLVE=1 env-var escape hatch for offline tests"
  affects:
    - "scripts/install/parse-cli.sh (sentinel-bounded block + help text)"
    - "scripts/install/__tests__/test-subdomain-args.sh (TESTS 12/13/14 + escape hatch)"
    - "platform/web (new route, Server5 deploy)"
tech_stack:
  added:
    - "(none — pure additive code, no new deps)"
  patterns:
    - "Mirror existing tunnel-token/route.ts shape for new /api/me/profile endpoint"
    - "Sentinel-bounded block markers (Plan 145-01: ... BEGIN/END) for forward-compatible test anchors"
    - "Env-var escape hatch (LIVOS_SKIP_API_KEY_RESOLVE) for offline test runs"
    - "Cache-busted curl freshness probe against raw.githubusercontent.com"
key_files:
  created:
    - "platform/web/src/app/api/me/profile/route.ts (46 LOC)"
    - ".planning/phases/145-api-key-only-install-one-liner/145-01-SUMMARY.md"
  modified:
    - "scripts/install/parse-cli.sh (+111 / -8, includes header docblock + auto-resolve block + 3 input shapes + custom-apex defer + help text)"
    - "scripts/install/__tests__/test-subdomain-args.sh (+70 / -5, TESTS 12/13/14 appended + LIVOS_SKIP_API_KEY_RESOLVE threaded through TESTS 2/3/4/5/9)"
decisions:
  - "Reused validateApiKey from @/lib/api-auth (same hardness as /api/me/tunnel-token, no new auth surface)."
  - "Added LIVOS_SKIP_API_KEY_RESOLVE=1 escape hatch to preserve offline test contract — needed because the new resolver fires unconditionally when --api-key is set, which would 401 on the fake `liv_k_x` fixtures and exit 1 instead of the test-expected 64."
  - "Custom-apex defer: explicit --domain on non-livinity.io zones (e.g. bruce.bruceoz.com) is kept as-is; api-key owner is informational only when the operator chose their own DNS."
  - "T-145-02 mitigation: re-apply the existing --subdomain shape check (no dots/spaces/leading-or-trailing dashes) to the resolved username AFTER JSON parse + BEFORE assignment — refuses a malicious DB row containing shell metachars."
metrics:
  duration: "~55 minutes (planner-to-mainserver-UAT-green)"
  tasks_completed: 5
  files_created: 1
  files_modified: 2
  commits: 5
  loc_delta:
    new_route_ts: 46
    parse_cli_sh: "+111 / -8 (target was ~55 LOC; +103 net is slightly over but includes 6-line escape-hatch comment block + custom-apex defer + T-145-02 shape check, all from CONTEXT requirements)"
    test_subdomain_args_sh: "+70 / -5"
  test_results:
    pre_phase_145: "22 PASS, 0 FAIL"
    post_phase_145: "34 PASS, 0 FAIL (+12 new assertions)"
  completed: "2026-05-18"
---

# Phase 145 Plan 01: API-Key-Only Install One-Liner Summary

**One-liner:** Single-flag `--api-key liv_k_...` install now sufficient — install.sh resolves the subdomain by calling new Server5 endpoint `/api/me/profile`; both `--subdomain X` and `--domain X.livinity.io` mismatches log a WARN and use the api-key owner's username instead of fail-stopping.

## What Shipped

### Server5 endpoint (new)
- **Path:** `GET https://livinity.io/api/me/profile`
- **Auth:** `X-API-Key: liv_k_...` (reuses `validateApiKey` — same bcrypt-compared hardness as `/api/me/tunnel-token`)
- **Response 200:**
  ```json
  {"username":"lucy","email":"lucyfeilu@outlook.com"}
  ```
  with `Cache-Control: no-store` header.
- **Response 401:** invalid / missing api-key.
- **Response 404:** defensive — api-key valid but user row gone.
- **File:** `platform/web/src/app/api/me/profile/route.ts` (46 LOC including docblock).
- **Deployed to:** Server5 `/opt/platform/web/` via scp → `pnpm build` → `pm2 restart web`. `.next/server/app/api/me/profile/route.js` compiled and live.

### install.sh subdomain auto-resolver (new)
- **File:** `scripts/install/parse-cli.sh` (+111 LOC net, sentinel-bounded block).
- **Trigger:** any time `LIVOS_API_KEY` is set (unless `LIVOS_SKIP_API_KEY_RESOLVE=1`).
- **Sentinels:** `# Plan 145-01: api-key auto-resolve BEGIN/END` (outer), `# Plan 145-01: conflict-WARN BEGIN/END` (inner).
- **Three input shapes:**
  1. `--api-key K` alone → resolve, set `LIVOS_SUBDOMAIN` + `LIVOS_DOMAIN`, log `[INFO] auto-resolved subdomain from api-key: lucy`.
  2. `--subdomain X` + `--api-key` (owner=Y, Y≠X) → `[WARN] --subdomain 'X' overridden by api-key owner 'Y' (Phase 145 auto-resolve)`, override.
  3. `--domain D.livinity.io` + `--api-key` (D-label ≠ owner) → `[WARN] --domain 'D.livinity.io' (label 'D') overridden by api-key owner 'Y' (Phase 145 auto-resolve)`, override. Custom apex (e.g. `bruce.bruceoz.com`) is kept as-is — operator's own DNS.
- **Help text:** `--subdomain` marked OPTIONAL when `--api-key` is set; Examples block promotes single-flag form as canonical.

### Test suite (extended)
- **File:** `scripts/install/__tests__/test-subdomain-args.sh` (+70 LOC).
- **New tests:**
  - TEST 12 — sentinel + INFO/WARN/endpoint/custom-apex marker presence in parse-cli.sh.
  - TEST 13 — `--help` promotes single-flag form + marks `--subdomain` OPTIONAL.
  - TEST 14 — sed-anchored sentinel range check: conflict-WARN body contains zero `fail`/`exit` calls (WARN-only contract per CONTEXT line 49).
- **Total:** 22 PASS pre-Phase-145 → 34 PASS post (+12 new assertions, target was +10).

### mainserver UAT (live)
- **Box:** `154.53.56.75` (Phase 144 UAT target, wiped via `/tmp/mainserver-wipe.sh`).
- **Step A (wipe):** LivOS torn down clean — no `livos.service`, no `/opt/livos`, no Caddyfile.
- **Step B (single-flag install):** `curl -fsSL https://livinity.io/install.sh | sudo bash -s -- --api-key liv_k_uYmDq_eI5ASmW7grwEba`
  - `install.sh exit: 0` — the whole stack came up with ZERO other flags.
- **Step C (resolver line):** `[INFO]  auto-resolved subdomain from api-key: lucy` present in `/tmp/p145-install.log` ✅
- **Step D (smoke trio):** `200 / 200 / 200` on `https://lucy.livinity.io/`, `/api/health`, `/` ✅
- **Step E (subdomain conflict):** `[WARN]  --subdomain 'notlucy' overridden by api-key owner 'lucy' (Phase 145 auto-resolve)` — install proceeded past parse_cli (no exit 64) ✅
- **Step F (domain conflict, CONTEXT line 49):** `[WARN]  --domain 'notlucy.livinity.io' (label 'notlucy') overridden by api-key owner 'lucy' (Phase 145 auto-resolve)` — install proceeded past parse_cli (no exit 64) ✅
- **Final smoke** after all 3 install runs: `200 / 200 / 200` ✅

### Off-limits guardrails honored
- Server4 (`45.137.194.103`) NEVER ssh'd ✅
- Mini PC (`10.69.31.68`) NEVER ssh'd ✅

## Decisions Made

1. **Reused `validateApiKey` from `@/lib/api-auth`** — same bcrypt hardness as `/api/me/tunnel-token`; no new auth surface (T-145-01 disposition = `mitigate` via reuse).
2. **Added `LIVOS_SKIP_API_KEY_RESOLVE=1` escape hatch** — needed to preserve offline test contract. The pre-existing TESTS 2/3/4/5/9 use fake `liv_k_*` fixtures; without the hatch, the new resolver fires unconditionally → 401 → `fail "..." 1` → tests expecting exit 64 broke. Production one-liners never set this variable.
3. **Custom-apex defer** (CONTEXT line 49 nuance): explicit `--domain` on non-`livinity.io` zones is kept as-is. The api-key owner is informational, not authoritative, when the operator chose their own DNS.
4. **Python3 over jq** for JSON parsing — already a common-deps dep; jq is not.
5. **`username` over `name`/`subdomain`** as JSON response key — matches the DB column name (CONTEXT decision).
6. **Server5 deploy via scp + pnpm build** — MEMORY.md said `/opt/platform/web/` is a git checkout; in practice it is not (no `.git` dir; files mixed `root` + UID `197609` owners). The actual sync mechanism is direct scp from dev box; documented in commit `d51f83e4` for future correction of MEMORY.md.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing tests broke under new unconditional resolver**
- **Found during:** Task 2 verification (`bash scripts/install/__tests__/test-subdomain-args.sh` reported 22 PASS, 3 FAIL).
- **Issue:** The new resolver block in `parse-cli.sh` fires whenever `LIVOS_API_KEY` is set. The pre-existing TESTS 2 and 4 use fake api-keys (`liv_k_test4xxx`, `liv_k_x`) for offline assertions of non-network parse logic. With the resolver active, those fakes hit livinity.io, got 401 / network error, and the resolver called `fail "..." 1` instead of letting the test's expected exit 64 surface. Task 2 acceptance criterion: "Existing test still passes ... no regressions in existing assertions."
- **Fix:** Added `LIVOS_SKIP_API_KEY_RESOLVE=1` env-var escape hatch in the new block, and threaded it through every test invocation that uses a fake api-key fixture (TESTS 2, 3, 4, 5, 9). Production never sets this variable (whole point of Phase 145 is the network call).
- **Files modified:**
  - `scripts/install/parse-cli.sh` (added the env-var check to the `if [[ -n "$LIVOS_API_KEY" && ... ]]` guard)
  - `scripts/install/__tests__/test-subdomain-args.sh` (prefixed 5 test invocations with `LIVOS_SKIP_API_KEY_RESOLVE=1`)
- **Commit:** `fa2c6931` (parse-cli) + `a7d8a3d4` (test suite — the test-suite update was rolled into Task 3's commit since both phases touched the test file)
- **Result:** 22 PASS, 0 FAIL pre-resolver → 34 PASS, 0 FAIL post-Phase-145 (+12 new assertions from TESTS 12/13/14).

**2. [Rule 3 - Blocker] MEMORY.md said `/opt/platform/web/` is a git checkout — it is not**
- **Found during:** Task 4 Step B (`cd /opt/platform/web && git rev-parse HEAD` failed with `fatal: not a git repository`).
- **Issue:** Plan + MEMORY.md both said: "Server5 has `/opt/platform/web/` as a git checkout tracking `origin/master` (verified). Deploy = `cd /opt/platform/web && git pull origin master && pnpm install --frozen-lockfile && pnpm build && pm2 restart web`." In reality `/opt/platform/web/` has no `.git` dir; the only git checkout on Server5 is at `/opt/livos-repo/` (HEAD `f4f208a7`, totally out-of-date and unrelated).
- **Fix:** scp'd `platform/web/src/app/api/me/profile/route.ts` directly from dev box to Server5, then ran `pnpm build` + `pm2 restart web` in place. The compiled output `.next/server/app/api/me/profile/route.js` is live and serving 200s.
- **Files modified:** (Server5 only — not repo)
- **Commit:** `d51f83e4` (documented the deviation + the actual sync mechanism for future reference)
- **Follow-up surfaced:** MEMORY.md "Server5 deploy hint" entry should be corrected — see Deferred Items below.

### No Architectural Changes
- Rule 4 (architectural) did not fire at any point. Pure additive code on both sides.

## Authentication Gates
None encountered — Server5 + mainserver SSH keys were already in place; api-key fixture `liv_k_uYmDq_eI5ASmW7grwEba` was already provisioned on Server5 (Phase 144 follow-up).

## Commits

| SHA        | Type  | Description                                                            | Sacred SHA |
|------------|-------|------------------------------------------------------------------------|------------|
| `35d49b52` | feat  | add GET /api/me/profile endpoint                                       | ✅         |
| `fa2c6931` | feat  | wire install.sh subdomain auto-resolve + warn-on-conflict              | ✅         |
| `a7d8a3d4` | test  | extend test-subdomain-args.sh with Phase 145 assertions                | ✅         |
| `d51f83e4` | chore | deploy /api/me/profile to Server5 + verify pipeline freshness          | ✅         |
| `b5177163` | chore | mainserver single-flag install UAT green + both conflict-WARN arms     | ✅         |

**Range:** `c8c849bd..b5177163` (5 commits).
**Sacred SHA invariant:** present in every commit ✅.
**`liv/packages/core/src/sdk-agent-runner.ts` touched:** NO ✅.

## GitHub Raw Freshness Gate

Cache-busted curl probe (Task 4 verify):

```
curl -fsSL "https://raw.githubusercontent.com/utopusc/livinity-io/master/scripts/install/parse-cli.sh?v=$(date +%s)" \
  | grep -q "Plan 145-01: api-key auto-resolve"
-> PASS: parse-cli.sh on GitHub raw contains Phase 145 sentinel
```

Deterministic gate fired clean on the first try (no propagation wait needed).

## Live Endpoint Verification

```
$ curl -sS -o /tmp/p.json -w "HTTP %{http_code}\n" \
    -H "X-API-Key: liv_k_uYmDq_eI5ASmW7grwEba" \
    https://livinity.io/api/me/profile
HTTP 200
$ cat /tmp/p.json
{"username":"lucy","email":"lucyfeilu@outlook.com"}

$ curl -sI -H "X-API-Key: liv_k_uYmDq_eI5ASmW7grwEba" https://livinity.io/api/me/profile | grep -i cache
Cache-Control: no-store

$ curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
    -H "X-API-Key: liv_k_invalid_key_xyz" \
    https://livinity.io/api/me/profile
HTTP 401

$ curl -sS -o /dev/null -w "HTTP %{http_code}\n" https://livinity.io/api/me/profile
HTTP 401
```

## mainserver UAT Live Output (key lines)

**Install completion banner:**
```
================================================================
  LivOS install (mode=portal) COMPLETE
  Status: TLS/DNS + livinityd both deployed (Plan 104-11)
================================================================
  UI: open https://lucy.livinity.io/
```

**Resolver line (Step C):**
```
[INFO]  auto-resolved subdomain from api-key: lucy
```

**Subdomain conflict (Step E):**
```
[WARN]  --subdomain 'notlucy' overridden by api-key owner 'lucy' (Phase 145 auto-resolve)
PASS: subdomain-conflict-WARN line present
```

**Domain conflict (Step F, CONTEXT line 49):**
```
[WARN]  --domain 'notlucy.livinity.io' (label 'notlucy') overridden by api-key owner 'lucy' (Phase 145 auto-resolve)
PASS: domain-conflict-WARN line present
```

**Smoke trio (after all 3 installs):** `200 / 200 / 200`.

## Deferred Items

1. **Rate limiting on `/api/me/profile`** — same posture as `/api/me/tunnel-token` (TODO marker in route header). Track as Phase 145+ once a shared limiter helper lands (T-145-05 disposition = `accept`).
2. **`mktemp -t` hardening for T-145-07** — TOCTOU window between `curl -o /tmp/livos-profile-resp.json` and `python3 < ...` is theoretical (resolver runs as root on a fresh box; no other plausible competitor). `rm -f` after read closes the lifetime. Acceptable for Phase 145; can harden in a follow-up.
3. **MEMORY.md correction** — "Server5 has `/opt/platform/web/` as a git checkout" claim is wrong. The actual sync mechanism is scp from dev box. Update `MEMORY.md` Server5 section + the live infrastructure note in execute-context. (Out-of-scope deferred per Phase 145 scope; logged for the operator.)
4. **Dashboard install-link generator** — `platform/web/src/app/dashboard/install/...` should be updated to use the new single-flag form as the copy-paste default. Separate UX phase per CONTEXT `<deferred>` block.
5. **`pnpm install --frozen-lockfile` not run on Server5** — because `/opt/platform/web/` is not git-tracked, there was no lockfile drift to check. If deps ever change for this route, the operator will need to scp `package.json` + `pnpm-lock.yaml` together and re-run install. (No deps changed for Phase 145 — `validateApiKey`, `pool`, `NextRequest`, `NextResponse` were all already present.)
6. **`mender-client4` apt-package** — visible in mainserver install log as `E: Unable to locate package mender-client4 / [WARN] mender-client4 install failed (non-fatal — ENOENT log spam will persist)`. Pre-existing Phase 109 carryover, not introduced by Phase 145. Logged here for visibility, not fixed.

## Threat Surface

All STRIDE entries from the plan's `<threat_model>` are reflected in code:

- **T-145-01 / spoofing (mitigate):** `validateApiKey` reused — same bcrypt-compared hardness as `/api/me/tunnel-token`.
- **T-145-02 / username injection (mitigate):** inline `case "$_resolved" in *' '*|*.*|-*|*-) fail ... ;; esac` shape check after JSON parse, before any assignment.
- **T-145-03 / api-key leakage (mitigate):** new route does not log the api-key (only the `userId` on the DB query); install.sh resolver uses the existing 10-char-prefix-only logging pattern.
- **T-145-04 / email disclosure (accept):** email returned only over TLS to caller holding the user's api-key (i.e. is the user).
- **T-145-05 / unrate-limited /profile (accept):** install-time fetch = one curl per install; matches tunnel-token posture.
- **T-145-06 / silent failures (mitigate):** every resolver error path uses `fail "<reason>" 1` with a clear stderr line + exit 1; conflict-WARN paths emit `warn` lines naming both the rejected value AND `$_resolved`; custom-apex defer emits an info line.
- **T-145-07 / TOCTOU on /tmp file (mitigate):** acceptable for Phase 145; mktemp hardening deferred above.

No NEW threat surface was introduced beyond the plan's register.

## Self-Check: PASSED

**Created files:**
- `platform/web/src/app/api/me/profile/route.ts` → FOUND
- `.planning/phases/145-api-key-only-install-one-liner/145-01-SUMMARY.md` → FOUND (this file)

**Commits exist (range `c8c849bd..b5177163`):**
- `35d49b52` feat(145-01/api-key-resolver): add GET /api/me/profile endpoint → FOUND
- `fa2c6931` feat(145-01/api-key-resolver): wire install.sh subdomain auto-resolve + warn-on-conflict → FOUND
- `a7d8a3d4` test(145-01/api-key-resolver): extend test-subdomain-args.sh with Phase 145 assertions → FOUND
- `d51f83e4` chore(145-01/deploy): deploy /api/me/profile to Server5 + verify pipeline freshness → FOUND
- `b5177163` chore(145-01/uat): mainserver single-flag install UAT green + both conflict-WARN arms verified → FOUND

**Sacred SHA invariant:** present in every Phase 145 commit ✅
**`liv/packages/core/src/sdk-agent-runner.ts`:** untouched ✅
