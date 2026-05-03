---
phase: 60-public-endpoint-rate-limit
verified: 2026-05-03T05:57:50Z
status: human_needed
score: 4/4 must-haves verified at Phase 60 perimeter layer (2/4 ROADMAP SCs PASS NOW + 2/4 chain-proven, full live verification owned by Phase 63 by design)
overrides_applied: 0
sacred_sha:
  expected: "4f868d318abff71f8c8bfbcf443b2393a553018b"
  actual: "4f868d318abff71f8c8bfbcf443b2393a553018b"
  match: true
phase_63_walker_readiness: ready
human_verification:
  - test: "Mint a liv_sk_* token via apiKeys.create (Phase 59 route) or Phase 62 UI"
    expected: "Plaintext token returned once with `liv_sk_` prefix"
    why_human: "Requires running tRPC mutation against Mini PC livinityd; out of scope for static verification"
  - test: "Run `bash /opt/livos/update.sh` on Mini PC (bruce@10.69.31.68)"
    expected: "broker IP-guard removal (commit a240f81f) deployed; livinityd restarts clean; loopback requests from relay no longer 503 due to container IP guard"
    why_human: "Requires SSH to Mini PC + sudo + service restart; live system mutation"
  - test: "Re-run `./platform/relay/scripts/phase-60-smoke.sh` with `LIV_SK_TOKEN=liv_sk_...` after Mini PC deploy"
    expected: "§3 Bearer-authed PASS — HTTP 200 + Anthropic-shape body; closes ROADMAP SC #1"
    why_human: "Live external HTTPS request with valid token; needs live broker"
  - test: "External SDK client probe (Bolt.diy / Open WebUI / Continue.dev) against https://api.livinity.io/v1/messages"
    expected: "Streamed Anthropic-shape response, no IP-guard rejection, no DNS-only-CDN error; closes ROADMAP SC #2"
    why_human: "Real SDK client behavior + UX validation; cannot be scripted via curl alone"
---

# Phase 60: B2 Public Endpoint + Rate-Limit Perimeter — Verification Report

**Phase Goal:** External clients can reach the broker over the open internet at `https://api.livinity.io` using their `liv_sk_*` Bearer token, without the request having to traverse Mini-PC-internal subdomain routing or container IP allowlists.

**Verified:** 2026-05-03T05:57:50Z
**Status:** human_needed (perimeter PASSED; live Bearer round-trip and external SDK client tests are Phase 63's mandatory live verification — by design)
**Re-verification:** No — initial verification

## Goal Achievement

### ROADMAP Success Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | curl + Bearer → Anthropic-shape body | DEFERRED → Phase 63 | Chain Caddy → relay → admin tunnel verified live (60-05 §4: 30 × 503 sendBrokerTunnelOffline envelopes prove dispatch fires). Live Bearer test gated on `bash /opt/livos/update.sh` (broker IP-guard removal deployment) + valid `liv_sk_*` mint. |
| 2 | Open WebUI from outside Mini PC LAN | DEFERRED → Phase 63 | Same as #1 — perimeter chain proven, real SDK client validation owned by dedicated Phase 63 mandatory live verification per ROADMAP design. |
| 3 | Rate-limit blast → 429 + Anthropic-spec body + Retry-After | PASS | 60-SMOKE-RESULTS.md §4: 70/100 × 429 from Server5 in <2s; full 4-field Anthropic body (`type:"error"`, `error.type:"rate_limit_error"`, message, `request_id` matches `^req_relay_`); `Retry-After: 59` header. Verified live now: `curl -sI https://api.livinity.io/v1/messages` → HTTP/1.1 503 with `Via: 1.1 Caddy` (chain alive). |
| 4 | Valid TLS cert | PASS | DNS verified live: `nslookup api.livinity.io 1.1.1.1` → 45.137.194.102 (matches Server5 ground truth). LE E8 cert pre-issued (expires 2026-06-17 per 60-04). curl via `schannel` SSL/TLS connection negotiated successfully — no cert warnings. |

**Score:** 2/4 PASS NOW + 2/4 chain-proven and DEFERRED to Phase 63 by ROADMAP design.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `platform/relay/Caddyfile` | `api.livinity.io` block with `rate_limit`, `flush_interval -1`, Anthropic-spec 429 handle_errors, log directive | VERIFIED | Lines 21-51: zone bearer (60/1m) + zone ip (30/1m); reverse_proxy `flush_interval -1`; handle_errors 429 with full Anthropic 4-field body + `req_relay_` request_id; log file `/var/log/caddy/api.livinity.io.log` json format |
| `livos/packages/livinityd/source/modules/livinity-broker/router.ts` | No `containerSourceIpGuard` import or call | VERIFIED | grep returns ZERO function call/import; only doc comment at line 236 explaining removal |
| `livos/packages/livinityd/source/modules/livinity-broker/auth.ts` | Function not exported | VERIFIED | Only `resolveAndAuthorizeUserId` exported; line 24 doc comment confirms removal |
| `platform/relay/src/admin-tunnel.ts` | Phase 60 Wave 2 deliverable | VERIFIED | File exists per PHASE-SUMMARY (deployed to Server5) |
| `platform/relay/scripts/phase-60-smoke.sh` | Re-runnable smoke battery | VERIFIED | 261 LOC, present at expected path |
| `nexus/packages/core/src/sdk-agent-runner.ts` (sacred file) | SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` | VERIFIED | Live `git hash-object` returned exact match — D-30-07 preserved |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| Internet client | api.livinity.io | DNS A record | WIRED | `nslookup api.livinity.io 1.1.1.1` → 45.137.194.102 (Server5) |
| api.livinity.io | Caddy | TLS termination | WIRED | LE E8 cert; live curl HTTP/1.1 with `Via: 1.1 Caddy` |
| Caddy | rate-limit perimeter | caddy-ratelimit module | WIRED | 60-05 §4: 70/100 × 429 with Retry-After:59 |
| Caddy | relay localhost:4000 | reverse_proxy w/ `flush_interval -1` | WIRED | 60-05 §4: 30 × 503 reach relay (proves chain) |
| relay | admin tunnel | findAdminTunnel (Phase 60 Wave 2) | WIRED | 11/11 vitest GREEN; live 503 envelope proves dispatch |
| broker source | external Bearer traffic | IP-guard removed | WIRED (source-only) | grep confirms zero `containerSourceIpGuard` calls; deploy via update.sh DEFERRED to Phase 63 |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| FR-BROKER-B2-01 | Public endpoint api.livinity.io reachable; container IP guard removed; Bearer auth replaces | SATISFIED (perimeter) / NEEDS PHASE 63 LIVE TEST | DNS+TLS+routing live; IP-guard removed at source; Mini PC deploy is Phase 63's first action |
| FR-BROKER-B2-02 | Rate-limit perimeter at Server5; 429s in Anthropic-compat shape | SATISFIED | 60-SMOKE-RESULTS.md §4 — 70 × 429 + 4-field body + Retry-After:59 |

### Anti-Patterns Found

None. Sacred file untouched (16 sample points across 5 plans + 1 verifier re-check); no stub returns; no TODOs added; deferred items are explicitly documented and assigned to a downstream phase that exists in the roadmap (Phase 63).

### Phase 63 Walker Readiness

**Verdict:** READY — Phase 63 walker has a complete, executable plan to close ROADMAP SCs #1 + #2.

Prerequisites for Phase 63:

1. **Mint `liv_sk_*` token** — Phase 59 route `apiKeys.create` is in place per PHASE-SUMMARY hand-off; Phase 62 UI also produces tokens. No blockers.
2. **Deploy broker IP-guard removal** — `bash /opt/livos/update.sh` on Mini PC. Source already committed (60-04 commit `a240f81f`). update.sh is the documented standard deploy path per MEMORY.md. **Watch-out:** the pre-existing `liv-memory.service` restart loop (MEMORY.md drift note) is unrelated but should not block this update — it affects `memory` package, not livinityd or broker.
3. **Re-run smoke** — `./platform/relay/scripts/phase-60-smoke.sh` with `LIV_SK_TOKEN` set. Script already accepts the env var; no script changes needed.
4. **External SDK client probes** — Bolt.diy / Open WebUI / Continue.dev VERIFY-V30-01..08 traceability already documented.

**No blocking gaps for Phase 63 entry.**

### Gaps Summary

There are no actionable gaps in Phase 60's scope. The 2/4 DEFERRED ROADMAP SCs are by design: Phase 63 is the dedicated mandatory live verification phase for the v30.0 milestone. Phase 60 owns the perimeter (Caddy + DNS + TLS + rate-limit + relay routing + broker source-side IP-guard removal); Phase 63 owns the live end-to-end Bearer round-trip and external SDK client validation.

### Recommended Follow-up

1. Phase 63 must execute the 4 human_verification items above, in order.
2. Hygiene (non-blocking, any phase): D-30-09 item 3 (rebuild docs in `platform/relay/README.md` for the custom Caddy build steps); refine smoke §6 to grep `Bearer\s+\S` / `liv_sk_` instead of the JSON key name `authorization`; track relay.livinity.io 503 (pre-existing wildcard SNI issue, NOT a Phase 60 regression).
3. Pre-deploy reminder for Phase 63 walker: also check the `update.sh` pnpm-store quirk per MEMORY.md (multiple `@nexus+core*` dirs) and the Mini PC PG password drift (DATABASE_URL truth lives in `/opt/livos/.env`, not the legacy `LivPostgres2024!` constant).

---

*Verified: 2026-05-03T05:57:50Z*
*Verifier: Claude (gsd-verifier)*
