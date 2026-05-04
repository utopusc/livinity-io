# 60-SMOKE-RESULTS - Phase 60 Wave 4

**Captured:** 2026-05-03T05:43:24Z (Server5 §1-§6) + 2026-05-03T05:45:00Z (dev-box §7 sacred-SHA)
**Source IP for blast (§4):** 45.137.194.102 (Server5 — `server5` strategy per checkpoint)
**Source IP for assembly (§7):** 50.175.214.163 (dev box — git hash-object operation)
**Token state (per /tmp/phase-60-05-checkpoint.txt):** TOKEN_STATE=skip, SOURCE_IP=server5, MINI_PC_DEPLOYED=no

## Summary

- Pass: **12** (post sacred-SHA correction)
- Fail: **0 actionable** — see "Notes on FAILs reported by raw smoke" below
- Skip: 1 (§3 Bearer-authed — no LIV_SK_TOKEN provided per checkpoint; deferred to Phase 63)

## Verdict per Check

| Check | Status | Detail |
|-------|--------|--------|
| DNS-1.1.1.1 | PASS | 45.137.194.102 |
| DNS-8.8.8.8 | PASS | 45.137.194.102 |
| TLS-Verify | PASS | matched /Verify return code: 0 \(ok\)/ |
| TLS-Subject-CN | PASS | matched /api\.livinity\.io/ |
| Bearer-authed | SKIP | LIV_SK_TOKEN not set (per checkpoint TOKEN_STATE=skip; Phase 63 will close) |
| RateLimit-429-count | PASS | **70 x 429** out of 100 requests (the other 30 = HTTP 503 from broker tunnel offline before reaching the rate-limiter — both confirm the chain works) |
| 429-body-type-error | PASS | yes (`type: "error"`) |
| 429-body-rate_limit_error | PASS | yes (`error.type: "rate_limit_error"`) |
| 429-body-message | PASS | yes (`error.message: "Rate limit exceeded"`) |
| 429-body-request_id-prefix | PASS | yes (`request_id: "req_relay_..."`) |
| 429-header-Retry-After | PASS | yes (`Retry-After: 59`) |
| Regression-relay | INFORMATIONAL FAIL — **NOT a Phase 60 regression** | `relay.livinity.io HTTP/2 503` — **pre-existing** since Wave 0 (60-DIAGNOSTIC-FIXTURE.md §Notes 4: "relay.livinity.io returns 503 — informational; not blocking Phase 60. Likely a separate wildcard SNI / cert / on_demand_tls/ask issue. Out of scope for Phase 60; track separately."). Confirmed during Wave 1 60-02-SUMMARY.md "503 (pre) -> 503 (post — UNCHANGED, pre-existing issue per Wave 0)". |
| Regression-bare | PASS | `livinity.io HTTP/2 200` |
| **Regression-apps** (extra) | PASS | `apps.livinity.io HTTP/2 200` |
| **Regression-changelog** (extra) | PASS | `changelog.livinity.io HTTP/2 200` |
| **Regression-per-user-bruce** (extra) | PASS | `bruce.livinity.io HTTP/2 200` |
| Sacred-file-SHA (Server5 raw run) | INFORMATIONAL FAIL — environment-only | Server5 has no git checkout of livinity-io, so `git hash-object` returned "missing". This is an environment artifact of running on Server5, not a real failure. **Re-run on dev box (next row) is the authoritative gate.** |
| **Sacred-file-SHA (dev-box re-run)** | **PASS** | `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical to D-30-07 baseline |

## Sample 429 envelope (verbatim)

```json
{
  "type": "error",
  "error": {
    "type": "rate_limit_error",
    "message": "Rate limit exceeded"
  },
  "request_id": "req_relay_be1452b7-96f9-4ef0-8b92-72d6b16d206f"
}
```

Headers (filtered):

```
content-type: application/json
retry-after: 59
```

All 4 Anthropic-spec fields present + Retry-After header — **success criterion 3 fully satisfied**.

## Status breakdown of the 100-request blast

| Status | Count | Meaning |
|--------|-------|---------|
| 429 | 70 | Caddy edge rate-limit perimeter rejected (PASS — perimeter active) |
| 503 | 30 | Reached Caddy, rate-limit allowed, hit relay → admin tunnel offline → Wave 2 60-03 sendBrokerTunnelOffline 503 envelope (chain works to broker; harmless because `MINI_PC_DEPLOYED=no` means no admin tunnel was active) |

Both outcomes confirm the routing chain. Once Mini PC `bash /opt/livos/update.sh` runs (Phase 63), the 503s become 200s (with valid Bearer) or 401s (with invalid Bearer) — perimeter behavior unchanged.

## ROADMAP Phase 60 Success Criteria Mapping

| # | Criterion | Smoke Section | Result |
|---|-----------|---------------|--------|
| 1 | curl + Bearer → Anthropic-shape | §3 | **DEFERRED** to Phase 63 — no LIV_SK_TOKEN at smoke time + Mini PC livinityd not yet update.sh-deployed (broker IP-guard removal source-side committed in 60-04 commit `a240f81f`, deploy waits for Phase 63 update.sh per plan note "this commit is local"). Chain Caddy → relay → tunnel verified working (30 × 503 in §4 prove relay dispatch fires + sendBrokerTunnelOffline returns Anthropic-spec 503 envelope; Wave 2 60-03 path confirmed live). |
| 2 | Open WebUI from outside Mini PC LAN | §3 + Phase 63 | **DEFERRED** — same as #1. Chain layers below the SDK client are PROVEN; full end-to-end live test with external SDK clients (Bolt.diy / Open WebUI / Continue.dev) is Phase 63's job per phase boundary. |
| 3 | Rate-limit blast → 429 + 4-field body + Retry-After | §4 | **PASS** — 70/100 × 429 with full Anthropic-spec body (4 fields) + Retry-After:59. Perimeter perfectly enforced. |
| 4 | Valid TLS cert | §1 + §2 | **PASS** — Let's Encrypt E8 cert, subject CN=api.livinity.io, openssl Verify return code: 0 (ok). DNS resolves correctly from 1.1.1.1 + 8.8.8.8. |

**Verdict:** 2/4 PASS NOW + 2/4 PHASE-60-CHAIN-PROVEN, full live verification deferred to Phase 63 (which is the dedicated mandatory live verification phase per ROADMAP). Phase 60 perimeter (Caddy → 429 + TLS + DNS) fully satisfied at the layer Phase 60 is responsible for.

## T-60-34 Caddy log Authorization-header check (re-investigation)

**Smoke §6 raw count:** `grep -ic "authorization" /var/log/caddy/api.livinity.io.log` = 100 (after blast)

**This is NOT a leak.** Investigation:

```text
$ grep -i "authorization" /var/log/caddy/api.livinity.io.log | head -1 | jq .
{
  ...
  "request": {
    "headers": {
      "Authorization": ["REDACTED"],     <-- the literal string "REDACTED"
      ...
    }
  }
}

$ grep -ci "Bearer "  /var/log/caddy/api.livinity.io.log -> 0
$ grep -ci "liv_sk"   /var/log/caddy/api.livinity.io.log -> 0
```

**Caddy auto-redacts the Authorization header VALUE** to the literal string `"REDACTED"` in JSON access logs. The 100 hits in the grep count are matches on the header NAME ("Authorization") in the JSON key — not the actual token. Zero `Bearer ` prefixes or `liv_sk_` substrings appear in the log file. **T-60-34 mitigation is INTACT** — the smoke script's §6 assertion is too strict (counts the JSON key name, not the value). Future iteration of the smoke script could refine §6 to grep for `Bearer\s+\S` or `liv_sk_` to assert no tokens leak; today's check passes the spirit (zero token values logged) but fails the letter (header name appears in JSON keys).

## Sacred file SHA — Phase 60 milestone gate

```text
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

Expected: `4f868d318abff71f8c8bfbcf443b2393a553018b`

**MATCH** — byte-identical to D-30-07 baseline. Phase 60 milestone gate **PASS**.

Sacred file SHA verified at:
- 60-01 plan start, mid, end (Wave 0)
- 60-02 plan start, mid, end (Wave 1)
- 60-03 plan start, mid, end (Wave 2)
- 60-04 plan start, mid, end (Wave 3)
- **60-05 (this plan) plan start, Task 2 mid, Task 3 start, Task 3 end (this row)**

All sample points across all 5 plans of Phase 60: byte-identical `4f868d31`.

## Smoke battery re-runnable verification

```bash
# From any host with dig/curl/openssl/jq:
LIV_SK_TOKEN=liv_sk_xxx ./platform/relay/scripts/phase-60-smoke.sh

# Or no token (skips §3, runs §1/§2/§4/§5/§7):
./platform/relay/scripts/phase-60-smoke.sh
```

Reusable for Phase 63 live verification + future incident triage.
