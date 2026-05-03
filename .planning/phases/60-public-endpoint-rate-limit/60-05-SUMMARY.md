---
phase: 60-public-endpoint-rate-limit
plan: 05
subsystem: infra
tags: [smoke, integration, phase-gate, server5, caddy, rate-limit, tls, dns, sacred-sha-gate]

requires:
  - phase: 60-public-endpoint-rate-limit
    provides: "60-04 Wave 3 → live api.livinity.io perimeter (Caddy block + rate_limit zones + Anthropic-spec 429 + DNS A 45.137.194.102 + LE E8 cert + broker IP-guard removed at source). 60-03 Wave 2 → relay api.livinity.io dispatch + sendBrokerTunnelOffline 503 envelope. 60-02 Wave 1 → custom Caddy with caddy-ratelimit + cloudflare DNS modules."

provides:
  - "platform/relay/scripts/phase-60-smoke.sh — 7-section repeatable smoke battery (261 LOC, executable, syntax-valid bash) mapping ROADMAP Phase 60 success criteria; reusable for Phase 63 + future incident triage; LIV_SK_TOKEN-aware (SKIPs §3 Bearer when absent); SERVER5_SSH-aware §6 Caddy log filter check"
  - ".planning/phases/60-public-endpoint-rate-limit/60-SMOKE-RESULTS.md — verbatim per-check verdict table (16 rows) + ROADMAP success criteria mapping + status breakdown (70 × 429 + 30 × 503 of 100 blast) + sample 429 envelope + T-60-34 re-investigation (Caddy auto-redacts Authorization VALUE to 'REDACTED' — mitigation INTACT) + sacred file SHA gate row PASS"
  - "Empirical proof of Phase 60 perimeter: 70/100 × HTTP 429 from one source IP within 2 seconds with full 4-field Anthropic-spec body + Retry-After:59 header — rate-limit perimeter is LIVE and enforces correctly"
  - "Empirical proof of TLS chain: openssl s_client Verify return code 0 (ok), subject CN=api.livinity.io, LE E8 issuer (expires 2026-06-17 per 60-04 SUMMARY)"
  - "Empirical proof of DNS resolution: dig +short api.livinity.io @1.1.1.1 = 45.137.194.102 + @8.8.8.8 = 45.137.194.102"
  - "Empirical proof of regression-free deploy: livinity.io HTTP/2 200, apps.livinity.io HTTP/2 200, changelog.livinity.io HTTP/2 200, bruce.livinity.io HTTP/2 200 (per-user route still working)"
  - "Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at plan start, mid-Task-2, mid-Task-3, AND plan end — Phase 60 milestone gate PASS"

affects: [Phase 63 (mandatory live verification — will run this same smoke script with valid LIV_SK_TOKEN after `bash /opt/livos/update.sh` deploys IP-guard removal to Mini PC), Phase 61 (rate-limit headers — must coexist with Caddy edge 429 forwarded verbatim), future incident triage (smoke is operator-runnable independently)]

tech-stack:
  added: []  # No code/runtime additions; pure shell script + markdown results
  patterns:
    - "Pattern: separate-source-IP smoke battery to avoid self-lockout (RESEARCH.md Pitfall 8). Source IP = Server5 (45.137.194.102) — different from dev box (50.175.214.163), keeps dev box's rate-limit bucket clean."
    - "Pattern: dual-source SHA assertion. §7 sacred file SHA assertion runs locally on dev box (which has the git checkout) instead of on Server5 (no checkout). Server5 raw run reports 'missing'; dev-box re-run is the authoritative gate. Documented as environment-only and informational FAIL in results."
    - "Pattern: status-breakdown narrative for blast results. Document not just the 429 count but ALL response statuses (70 × 429 + 30 × 503) — the 503s are also informative (they prove the broker tunnel routing chain works when Mini PC admin tunnel is offline)."
    - "Pattern: T-mitigation re-investigation when smoke flags a strict-letter failure that doesn't violate the spirit. §6 grep counted 'authorization' header NAME hits in Caddy JSON logs (=100 after blast); follow-up jq inspection showed the VALUE is the literal string 'REDACTED' (Caddy default behavior). Letter-of-the-check: FAIL. Spirit-of-the-mitigation: PASS. Documented in results MD."

key-files:
  created:
    - platform/relay/scripts/phase-60-smoke.sh
    - .planning/phases/60-public-endpoint-rate-limit/60-SMOKE-RESULTS.md
    - .planning/phases/60-public-endpoint-rate-limit/60-05-SUMMARY.md
  modified: []

key-decisions:
  - "Task 1 checkpoint auto-resolved per orchestrator yolo + 'user has authorized full autonomous execution': TOKEN_STATE=skip (no LIV_SK_TOKEN provided), SOURCE_IP=server5 (no separate VPS available; Mini PC SSH risky for fail2ban + can't run dig/jq from dev box), MINI_PC_DEPLOYED=no (60-04 SUMMARY confirmed deferred to Phase 63 update.sh per plan note). Persisted to /tmp/phase-60-05-checkpoint.txt."
  - "Source-IP strategy = server5 ssh (per checkpoint). Single-batch ssh ran the full smoke script on Server5 — Server5 has dig/jq/curl/openssl all installed; dev box (Windows git-bash) has only curl/openssl (missing dig/jq). Source IP for §4 blast = 45.137.194.102 (Server5 itself); rate-limit bucket on this key is independent of dev box's bucket — no self-lockout."
  - "§3 Bearer-authed = SKIP per checkpoint TOKEN_STATE=skip. Phase 63 closes this gap. The 30 × 503 in §4 (the requests that won the rate-limit lottery) prove the chain Caddy → relay → admin tunnel runs to completion (sendBrokerTunnelOffline 503 envelope returned from Wave 2 60-03 path), so the chain is verified up to broker — only the broker handler itself is untested live until Phase 63."
  - "§7 sacred SHA assertion split: Server5 raw run reported 'missing' (no git checkout there); dev-box re-run reported 4f868d318abff71f8c8bfbcf443b2393a553018b. Authoritative gate = dev-box value. Documented as environment artifact in results MD, NOT a real failure."
  - "T-60-34 re-investigation after §6 raw count flagged 100 'authorization' hits: jq inspection confirmed Caddy auto-redacts Authorization VALUE to 'REDACTED'; grep -ci 'Bearer ' = 0; grep -ci 'liv_sk' = 0. Mitigation INTACT. Smoke script's §6 check is too strict (counts JSON key name); future iteration could refine to grep for the actual leak patterns (Bearer\\s+\\S or liv_sk_)."
  - "Regression-relay (relay.livinity.io 503) is NOT a Phase 60 regression — pre-existing per Wave 0 60-DIAGNOSTIC-FIXTURE.md §Notes 4 ('relay.livinity.io returns 503 — informational; not blocking Phase 60. Out of scope; track separately.') and Wave 1 60-02-SUMMARY.md ('503 (pre) → 503 (post — UNCHANGED, pre-existing issue per Wave 0'). Documented as INFORMATIONAL FAIL in results MD."

requirements-completed: [FR-BROKER-B2-01, FR-BROKER-B2-02]

duration: ~12 min
completed: 2026-05-03
---

# Phase 60 Plan 05: Wave 4 — Smoke Battery + Phase 60 Gate Summary

**Two-task wave landed: (1) `platform/relay/scripts/phase-60-smoke.sh` (261 LOC, 7 sections, executable, syntax-valid) — repeatable smoke battery mapping ROADMAP Phase 60 success criteria; (2) smoke run from Server5 (per checkpoint SOURCE_IP=server5 — avoids dev-box self-lockout per RESEARCH.md Pitfall 8) producing `60-SMOKE-RESULTS.md` with 12 PASS / 1 SKIP / 2 informational-FAIL (relay.livinity.io 503 pre-existing per Wave 0; Server5 raw §7 missing because no git checkout there) — dev-box re-run §7 confirms sacred SHA byte-identical. Rate-limit perimeter EMPIRICALLY PROVEN: 70/100 × HTTP 429 with full 4-field Anthropic-spec body + Retry-After:59. TLS valid (LE E8). DNS correct from 2 resolvers. Existing wildcard traffic regression-free (livinity.io/apps/changelog/bruce all 200). T-60-34 re-investigation confirmed Caddy auto-redacts Authorization VALUE to 'REDACTED' — mitigation INTACT. Sacred file SHA byte-identical at plan start, Task 2 mid, Task 3 start, AND plan end — Phase 60 milestone gate PASS.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-03T05:38:00Z (sacred SHA assertion + plan/context reading)
- **Completed:** 2026-05-03T05:50:00Z (final SHA + SUMMARY)
- **Tasks:** 3 (Task 1 checkpoint auto-resolved per orchestrator yolo; Tasks 2/3 executed)
- **Atomic commits:** 2 task commits + 1 metadata commit (this SUMMARY) + 1 PHASE-SUMMARY commit
- **SSH invocations to Server5:** 1 scp (script upload) + 1 batched ssh (smoke run + transcript collection) + 1 follow-up ssh (T-60-34 jq inspection) + 1 follow-up ssh (relay.livinity.io 503 confirmation) = 4 total. Fail2ban-conservative; each invocation single-batched.

## Accomplishments

### Task 1 — Pre-flight checkpoint (auto-resolved)

Per orchestrator yolo + autonomous mode: combined approval auto-resolved as `approved skip-section-3 server5 mini-pc-deployed-no`. Persisted to `/tmp/phase-60-05-checkpoint.txt`:

```text
TOKEN_STATE=skip
SOURCE_IP=server5
MINI_PC_DEPLOYED=no
```

Rationale per orchestrator context:
- **TOKEN_STATE=skip**: no `liv_sk_*` test token surfaced in orchestrator context; Mini PC livinityd not yet update.sh-deployed → even if a token existed, broker would 401 due to IP-guard still active until Phase 63.
- **SOURCE_IP=server5**: dev box is Windows git-bash, missing `dig` + `jq` binaries; Mini PC SSH would risk fail2ban; Server5 has all 4 tools (dig/jq/curl/openssl); Server5's source IP is 45.137.194.102 (different from dev box's 50.175.214.163) — no self-lockout risk.
- **MINI_PC_DEPLOYED=no**: 60-04 SUMMARY explicitly stated "Mini PC IP-guard deploy DEFERRED" with rationale; orchestrator context confirmed.

### Task 2 — phase-60-smoke.sh (commit `d01f792a`)

- Created `platform/relay/scripts/phase-60-smoke.sh` (261 LOC, exec mode 0755, bash syntax-valid via `bash -n`).
- 7 sections mapping ROADMAP success criteria:
  - §1 DNS resolution (1.1.1.1 + 8.8.8.8) → criterion 4
  - §2 TLS validity (openssl s_client Verify code + subject CN) → criterion 4
  - §3 Bearer-authed request (LIV_SK_TOKEN env-var-gated, SKIP-aware) → criterion 1
  - §4 Rate-limit blast (100 concurrent + assert ≥1 × 429 + 4-field body + Retry-After) → criterion 3
  - §5 Existing wildcard regression (relay.livinity.io + livinity.io)
  - §6 Caddy log Authorization-header check (SERVER5_SSH-gated)
  - §7 Sacred file SHA gate (`git hash-object` against `4f868d31...`)
- Output: stdout + `$SMOKE_OUT` text + `$RESULT_MD` markdown table.
- Documented RESEARCH.md Pitfall 8 in script header (separate-source-IP for blast).
- Reusable for Phase 63 + future incident triage.

### Task 3 — Server5 smoke run + 60-SMOKE-RESULTS.md (commit `2002853f`)

**Single batched ssh invocation on Server5** ran the full smoke script:

```text
=== Section 1: DNS resolution ===
PASS DNS-1.1.1.1: 45.137.194.102
PASS DNS-8.8.8.8: 45.137.194.102

=== Section 2: TLS cert validity ===
PASS TLS-Verify: matched /Verify return code: 0 \(ok\)/
PASS TLS-Subject-CN: matched /api\.livinity\.io/

=== Section 3: Bearer-authed ===
SKIP Section 3: LIV_SK_TOKEN not provided

=== Section 4: Rate-limit blast (100 concurrent → expect ≥1 × 429) ===
429 count: 70 / 100
Sample 429 body: {"type":"error","error":{"type":"rate_limit_error","message":"Rate limit exceeded"},"request_id":"req_relay_be1452b7-96f9-4ef0-8b92-72d6b16d206f"}
Sample 429 headers: content-type: application/json; retry-after: 59
PASS 429-body-type-error: yes
PASS 429-body-rate_limit_error: yes
PASS 429-body-message: yes
PASS 429-body-request_id-prefix: yes
PASS 429-header-Retry-After: yes

=== Section 5: existing wildcard regression ===
relay.livinity.io: HTTP/2 503    <-- pre-existing per Wave 0 §Notes 4
livinity.io:       HTTP/2 200

=== Section 7: sacred file SHA gate ===
FAIL Sacred-file-SHA: got 'missing'    <-- Server5 has no git checkout (environment artifact)

=== TOTAL: 11 passed, 2 failed ===
```

**Status breakdown of 100-request blast:**

| Status | Count | Meaning |
|--------|-------|---------|
| 429 | 70 | Caddy edge rate-limit perimeter rejected (perimeter active) |
| 503 | 30 | Reached Caddy → relay → admin tunnel offline → Wave 2 sendBrokerTunnelOffline (chain works to broker; expected because MINI_PC_DEPLOYED=no) |

Both outcomes confirm the chain. Once Mini PC update.sh deploys (Phase 63), 503s become 200/401/etc — perimeter behavior unchanged.

**Dev-box re-runs for Server5-environment artifacts:**

- §7 sacred SHA on dev box: `4f868d318abff71f8c8bfbcf443b2393a553018b` ✓ (authoritative)
- §6 deeper inspection: `grep -ci "Bearer "` on `/var/log/caddy/api.livinity.io.log` = 0; `grep -ci "liv_sk"` = 0; jq dump shows `Authorization: ["REDACTED"]` (Caddy auto-redacts the VALUE). T-60-34 mitigation INTACT.

**Extra regression probes** (beyond plan):
- apps.livinity.io HTTP/2 200 ✓
- changelog.livinity.io HTTP/2 200 ✓
- bruce.livinity.io HTTP/2 200 ✓ (per-user route still working post-Phase-60)

## Task Commits

1. **Task 1 — checkpoint:human-verify** — auto-resolved per orchestrator yolo + autonomous; persisted `/tmp/phase-60-05-checkpoint.txt`. No commit.
2. **Task 2 — phase-60-smoke.sh** — `d01f792a` (`feat(60-05): add phase-60-smoke.sh - Wave 4 smoke battery (DNS + TLS + Bearer + rate-limit + regression + sacred SHA)`)
3. **Task 3 — 60-SMOKE-RESULTS.md** — `2002853f` (`docs(60-05): wave 4 smoke battery results - Phase 60 gate`)

Plan metadata commit + PHASE-SUMMARY commit pending after this SUMMARY write.

## Files Created/Modified

### In-tree (committed)

- `platform/relay/scripts/phase-60-smoke.sh` — NEW (261 LOC, exec mode 0755)
- `.planning/phases/60-public-endpoint-rate-limit/60-SMOKE-RESULTS.md` — NEW (133 LOC verdict table + ROADMAP mapping + sacred SHA gate row)
- `.planning/phases/60-public-endpoint-rate-limit/60-05-SUMMARY.md` — NEW (this file)

### Out-of-tree (Server5)

- `/tmp/phase-60-smoke.sh` — NEW (uploaded via scp; ephemeral)
- `/tmp/smoke-out/smoke.txt`, `/tmp/smoke-out/60-SMOKE-RESULTS.md` — NEW (smoke transcripts; ephemeral)
- `/tmp/phase-60-blast/r-{1..100}.{body,headers,status}` — NEW (per-request artifacts; ephemeral)

### Out-of-tree (operational state)

- `/tmp/phase-60-05-checkpoint.txt` — NEW on dev box (Task 1 resolution; ephemeral)

## ROADMAP Phase 60 Success Criteria — Final Verdict

| # | Criterion | Verdict | Detail |
|---|-----------|---------|--------|
| 1 | curl + Bearer → Anthropic-shape | DEFERRED to Phase 63 | TOKEN_STATE=skip + MINI_PC_DEPLOYED=no per checkpoint. Chain Caddy → relay → admin tunnel verified live (30 × 503 sendBrokerTunnelOffline envelopes prove dispatch fires). Phase 63 will run smoke with valid token after `bash /opt/livos/update.sh`. |
| 2 | Open WebUI from outside Mini PC LAN | DEFERRED to Phase 63 | Same as #1 — Phase 63 is the dedicated mandatory live verification phase. |
| 3 | Rate-limit blast → 429 + 4-field body + Retry-After | **PASS** | 70/100 × 429, all 4 Anthropic-spec body fields verified via jq, Retry-After: 59 header confirmed. |
| 4 | Valid TLS cert | **PASS** | LE E8 cert, openssl Verify=0, DNS resolves correctly from 2 resolvers. |

**Phase 60 perimeter (the layer Phase 60 owns) is FULLY SATISFIED.** Live end-to-end verification with real SDK clients (the part that requires Mini PC livinityd update.sh deploy) is Phase 63's job per ROADMAP.

## Sacred SHA at end (Phase 60 milestone gate)

```text
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

**MATCH** — byte-identical to D-30-07 baseline. Verified at 4 sample points across plan:
- Plan start (after STATE.md / context reading)
- Mid-plan (after Task 2 smoke script written)
- Task 3 start (after checkpoint resolution)
- Plan end (after Task 3 commit + this SUMMARY)

## Decisions Made

1. **Task 1 checkpoint auto-resolved**: TOKEN_STATE=skip, SOURCE_IP=server5, MINI_PC_DEPLOYED=no. Persisted to `/tmp/phase-60-05-checkpoint.txt`.
2. **Source IP = Server5 (per checkpoint).** dev box missing `dig` and `jq`; Server5 has all needed tools and is functionally a separate IP for the per-IP rate-limit zone.
3. **§3 Bearer = SKIP** per plan + checkpoint; Phase 63 will close.
4. **§7 sacred SHA = dev-box re-run is authoritative** (Server5 has no git checkout; raw §7 row reports 'missing' — environment-only).
5. **§6 T-60-34 mitigation = INTACT despite literal grep count of 100.** Caddy auto-redacts Authorization VALUE to 'REDACTED'. Future smoke iteration could refine §6 to grep for `Bearer\s+\S` or `liv_sk_` patterns instead of just the header NAME.
6. **Regression-relay 503 is NOT a Phase 60 regression** — pre-existing per Wave 0 §Notes 4 + Wave 1 confirmation; documented as informational FAIL with cross-references.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] dev box missing dig + jq**

- **Found during:** Task 3 step 2 (deciding source-IP strategy)
- **Issue:** Smoke script requires `dig`, `curl`, `openssl`, `jq`. Dev box (Windows git-bash) has only `curl` + `openssl`; `dig` and `jq` are missing per `which dig jq`. Cannot run smoke locally.
- **Fix:** Used checkpoint's `server5` strategy. Server5 has all 4 tools (`/usr/bin/{dig,jq,curl,openssl}`). scp script up + run via single batched ssh. Works as designed.
- **Files modified:** None (operational only)
- **Verification:** Script ran cleanly on Server5 with all assertion sections firing.
- **Committed in:** Documented in this SUMMARY; no separate fix commit (operational only).

**2. [Rule 3 — Blocking] Sacred SHA §7 returns 'missing' on Server5**

- **Found during:** Task 3 step 3 (reading SMOKE-RESULTS.md returned by Server5)
- **Issue:** §7 runs `git hash-object nexus/packages/core/src/sdk-agent-runner.ts`, which requires a git checkout. Server5 has no checkout of `livinity-io` (relay is rsync-deployed, no `.git`). Result: "missing", which the script treats as FAIL.
- **Fix:** Re-ran §7 on dev box (which has the git checkout) — returned `4f868d318abff71f8c8bfbcf443b2393a553018b` ✓. Documented in 60-SMOKE-RESULTS.md as a separate row "Sacred-file-SHA (dev-box re-run) PASS — authoritative gate" alongside the Server5 raw row marked "INFORMATIONAL FAIL — environment-only".
- **Files modified:** `60-SMOKE-RESULTS.md` (the assembled markdown reflects both rows transparently)
- **Verification:** dev-box `git hash-object` matches D-30-07 baseline.
- **Committed in:** `2002853f` (Task 3 commit body documents the split).

**3. [Rule 1 — Bug] §6 Caddy log Authorization check is too strict (false-positive)**

- **Found during:** Task 3 step 3 (post-smoke transcript inspection)
- **Issue:** §6 raw output (in the Server5 transcript appendix) showed `grep -ic "authorization" /var/log/caddy/api.livinity.io.log = 100`, which the smoke would have FAILed if SERVER5_SSH was set. But this is a false positive — the 100 hits are matches on the JSON KEY NAME ("Authorization"), not the VALUE. Caddy auto-redacts the value to the literal string "REDACTED" by default.
- **Fix:** Re-investigated via `jq` and verified: `grep -ci "Bearer "` = 0 + `grep -ci "liv_sk"` = 0 + jq dump shows `Authorization: ["REDACTED"]`. Documented in 60-SMOKE-RESULTS.md as "T-60-34 re-investigation: mitigation INTACT". Future smoke iteration could refine §6 to grep for actual leak patterns (`Bearer\s+\S` or `liv_sk_`); not done in this plan to keep §6 conservative + script byte-identical.
- **Files modified:** `60-SMOKE-RESULTS.md` (T-60-34 re-investigation section); script unchanged.
- **Verification:** No leakage of Bearer values in any Caddy log file.
- **Committed in:** `2002853f` (results MD documents the re-investigation).

---

**Total deviations:** 3 auto-fixed (2 environment Rule 3 — Windows tooling absence + Server5 no-git-checkout; 1 Rule 1 false-positive — script's §6 too-strict assertion). All deviations are environment / tooling artifacts, NOT plan substance. Plan logic, smoke section structure, ROADMAP success criteria mapping, sacred file gate strictness all match plan verbatim.

## Issues Encountered

- **Pre-existing: relay.livinity.io HTTP/2 503** — confirmed pre-existing per Wave 0 60-DIAGNOSTIC-FIXTURE.md §Notes 4 and Wave 1 60-02-SUMMARY.md "503 (pre) → 503 (post — UNCHANGED)". NOT a Phase 60 regression. Tracked separately for whatever phase wants to fix the wildcard SNI / cert / on_demand_tls/ask issue.
- **Caddy bucket carry-over after blast:** post-blast `curl -sI https://api.livinity.io` was still returning 429 (Retry-After: 10) for several seconds. Expected and harmless — bucket clears within 60 seconds.

## D-NO-NEW-DEPS Audit

**No new deps added.** Plan is pure shell script + markdown only. **GREEN.**

## D-NO-SERVER4 Audit

Server4 NOT touched. All Server5 ops targeted `45.137.194.102`. **GREEN.**

## D-LIVINITYD-IS-ROOT Audit

NOT TOUCHED — plan only adds smoke script + writes results MD; livinityd source code unchanged. **GREEN.**

## Threat Flags

| Threat ID | Status |
|-----------|--------|
| T-60-40 (Smoke script logs LIV_SK_TOKEN) | MITIGATED — script reads token from env var; never echos it; only sends in `Authorization: Bearer` header. Sample 429 body in results MD shows no token leak (because §3 was skipped — but even with §3 active, the header value never echoes to stdout). |
| T-60-41 (Self-lockout from blast) | MITIGATED — checkpoint SOURCE_IP=server5 chosen; dev box source IP (50.175.214.163) untouched. Blast on Server5's 127.0.0.1 = 45.137.194.102 zone bucket; cleared within 60s. |
| T-60-42 (Smoke script as executable could be modified) | ACCEPTED — operator visually inspects before running; standard repo trust model. |
| T-60-43 (Caddy log capture in §6 includes user data) | MITIGATED — §6 only counts occurrences of "authorization"; does NOT exfiltrate body or headers. Re-investigation confirmed Caddy auto-redacts the VALUE to "REDACTED". |
| T-60-44 (Sacred file changed during smoke run) | MITIGATED — SHA assertion at start AND end of Task 3; final assertion is the phase gate. 4 sample points across plan all match. |

## Rollback Path

Smoke script is a NEW file; results MD is a NEW file; no Server5 production state was modified by this plan. To rollback:

```bash
# Local repo
git revert 2002853f d01f792a

# Server5 has nothing to rollback — /tmp/phase-60-smoke.sh + /tmp/smoke-out/* are ephemeral
```

Recovery time: instant.

## Next Phase Readiness

- **Phase 60 CLOSE-READY.** All 4 ROADMAP success criteria are either PASS now (#3, #4) or PHASE-60-CHAIN-PROVEN with deferred live test in Phase 63 (#1, #2). The Phase 60 perimeter (the layer Phase 60 owns: DNS + TLS + edge rate-limit + relay dispatch + IP-guard removal at source) is empirically verified.
- **Phase 63 live verification:** will reuse `platform/relay/scripts/phase-60-smoke.sh` with valid `LIV_SK_TOKEN` after `bash /opt/livos/update.sh` deploys IP-guard removal to Mini PC. Expected smoke verdict: §3 PASS (200 + Anthropic-shape body) — closing #1 and #2.
- **Phase 61 (Rate-Limit Headers):** must coexist with Caddy edge 429. Phase 60's edge layer emits its own 429 with Retry-After:59 (Anthropic-spec). Phase 61's job is to forward Anthropic upstream rate-limit headers verbatim through the broker → relay → Caddy chain. Phase 60's edge 429 takes precedence; Phase 61 fills in the broker-side header forwarding for non-edge-throttled requests.
- **Phase 62 (Settings UI — API Keys + Usage tabs):** parallel; doesn't depend on Phase 60. Phase 62's API key creation flow will produce valid `liv_sk_*` tokens that Phase 63 can use to close #1 + #2.

## User Setup Required

- **For Phase 63 live verification:** run `bash /opt/livos/update.sh` on Mini PC (`bruce@10.69.31.68`) to deploy 60-04's broker IP-guard removal. Until then, the chain works to the broker but the broker rejects loopback requests from the relay (which arrive over the LivOS tunnel from Server5).
- **For optional Section 3 verification before Phase 63:** create a `liv_sk_*` test API key via Phase 59 / Phase 62 routes; export `LIV_SK_TOKEN=liv_sk_...`; re-run `./platform/relay/scripts/phase-60-smoke.sh` from any host with dig/curl/openssl/jq.

---

## Self-Check: PASSED

- [x] `.planning/phases/60-public-endpoint-rate-limit/60-05-SUMMARY.md` exists (this file)
- [x] `.planning/phases/60-public-endpoint-rate-limit/60-SMOKE-RESULTS.md` exists (verified — `test -s` PASS)
- [x] `platform/relay/scripts/phase-60-smoke.sh` exists, executable (mode 0755), syntax-valid (`bash -n` exit 0)
- [x] All 2 task commits exist in git log: `d01f792a` (smoke script) + `2002853f` (smoke results)
- [x] §1 DNS-1.1.1.1 + DNS-8.8.8.8 PASS (both 45.137.194.102)
- [x] §2 TLS-Verify + TLS-Subject-CN PASS
- [x] §3 Bearer-authed SKIP per checkpoint (token absent + Mini PC not deployed); Phase 63 will close
- [x] §4 RateLimit-429-count PASS (70 × 429 / 100)
- [x] §4 4-field Anthropic body assertions ALL PASS (type + error.type + message + request_id_prefix)
- [x] §4 Retry-After header PASS
- [x] §5 livinity.io HTTP/2 200 (PASS); relay.livinity.io 503 (pre-existing per Wave 0 §Notes 4, NOT a regression)
- [x] §5 extras: apps.livinity.io / changelog.livinity.io / bruce.livinity.io all HTTP/2 200
- [x] §6 T-60-34 mitigation INTACT (Caddy auto-redacts Authorization VALUE; zero Bearer/liv_sk leaks)
- [x] §7 Sacred-file-SHA dev-box re-run = `4f868d318abff71f8c8bfbcf443b2393a553018b` (PASS — Phase 60 milestone gate)
- [x] Sacred file SHA byte-identical at plan start, Task 2 mid, Task 3 start, plan end
- [x] D-NO-NEW-DEPS preserved (no deps added)
- [x] D-NO-SERVER4 preserved (Server5 only)
- [x] Single-batch ssh discipline (4 ssh ops total — fail2ban-conservative)
- [x] FR-BROKER-B2-01 + FR-BROKER-B2-02 verified end-to-end at the layer Phase 60 owns

---

*Phase: 60-public-endpoint-rate-limit*
*Completed: 2026-05-03*
