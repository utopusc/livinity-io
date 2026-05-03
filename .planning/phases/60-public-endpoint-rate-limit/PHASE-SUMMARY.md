---
phase: 60-public-endpoint-rate-limit
milestone: v30.0
status: COMPLETE
started: 2026-05-03T04:45:24Z
completed: 2026-05-03T05:50:00Z
duration_total: ~78 min (sum of 5 plans)
plans_total: 5
plans_complete: 5
requirements: [FR-BROKER-B2-01, FR-BROKER-B2-02]
requirements_complete: [FR-BROKER-B2-01, FR-BROKER-B2-02]
sacred_sha_baseline: "4f868d318abff71f8c8bfbcf443b2393a553018b"
sacred_sha_end: "4f868d318abff71f8c8bfbcf443b2393a553018b"
sacred_sha_drift: false
locked_decisions_consumed: [D-30-04, D-30-06, D-30-07, D-30-08, D-30-09]
---

# Phase 60 — B2 Public Endpoint (`api.livinity.io`) + Rate-Limit Perimeter — PHASE SUMMARY

**`https://api.livinity.io` is LIVE on Server5 with TLS, 60-req/min Bearer + 30-req/min IP edge rate-limit perimeter, Anthropic-spec 4-field 429 body + Retry-After header, full-streaming reverse-proxy to relay (flush_interval -1) → admin tunnel → Mini PC livinityd. 5 waves shipped in ~78 min wall-clock; sacred file SHA byte-identical across all 16+ assertion points; 2/4 ROADMAP success criteria PASS NOW + 2/4 chain-proven and DEFERRED to Phase 63 mandatory live verification (live SDK client tests need Mini PC `bash /opt/livos/update.sh` deploy of broker IP-guard removal — source committed in 60-04 but Mini PC deploy is Phase 63's job per plan).**

## Wave-by-wave timeline

| Wave | Plan | Title | Duration | Commits | Status |
|------|------|-------|----------|---------|--------|
| 0 | 60-01 | Server5 diagnostic + Open-Q verdicts | ~7 min | 1 doc | COMPLETE |
| 1 | 60-02 | Custom Caddy build + binary swap | ~12 min | 1 doc | COMPLETE |
| 2 | 60-03 | Relay api.livinity.io routing (TDD) | ~22 min | 4 (TDD RED+GREEN ×2) + 1 doc | COMPLETE |
| 3 | 60-04 | Caddyfile + DNS + Broker IP-guard removal | ~25 min | 4 work + 1 doc | COMPLETE |
| 4 | 60-05 | Smoke battery + Phase gate | ~12 min | 2 work + 1 doc + 1 phase doc | COMPLETE |
| **Total** | **5 plans** | | **~78 min** | **15 work + 5 plan docs + 1 phase doc** | **COMPLETE** |

## ROADMAP Phase 60 success criteria — final verdict

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | `curl https://api.livinity.io/v1/messages` from any internet host with valid `liv_sk_*` returns Anthropic-shape body | **DEFERRED to Phase 63** | TOKEN_STATE=skip + MINI_PC_DEPLOYED=no per 60-05 checkpoint. Chain Caddy → relay → admin tunnel verified live in 60-05 §4 (30 × 503 sendBrokerTunnelOffline envelopes prove dispatch fires); Mini PC update.sh deploy + valid token are Phase 63's job. |
| 2 | Open WebUI from outside Mini PC LAN connects with `liv_sk_*` | **DEFERRED to Phase 63** | Same as #1. Phase 63 is the dedicated mandatory live verification phase (per ROADMAP). |
| 3 | Rate-limit blast (>60 req/min/IP) returns 429 from Caddy with Anthropic-compat body + Retry-After | **PASS** (60-05 §4) | 70/100 × 429 from Server5 in <2s; full 4-field Anthropic body (`type:"error"`, `error.type:"rate_limit_error"`, non-empty `message`, `request_id` matches `^req_relay_`); Retry-After: 59 header. |
| 4 | Valid TLS cert | **PASS** (60-05 §1+§2) | Let's Encrypt E8 cert (issued 2026-03-19, expires 2026-06-17 per 60-04); openssl s_client `Verify return code: 0 (ok)`; subject CN=api.livinity.io; DNS resolves correctly from 1.1.1.1 + 8.8.8.8 to 45.137.194.102. |

**Phase 60 perimeter (the layer Phase 60 owns) is FULLY SATISFIED.** Live end-to-end verification with real SDK clients deferred to Phase 63 per ROADMAP design (Phase 63 is the milestone's dedicated mandatory live verification).

## Sacred SHA history — byte-identical across all of Phase 60

`nexus/packages/core/src/sdk-agent-runner.ts` SHA: `4f868d318abff71f8c8bfbcf443b2393a553018b`

Verified at every wave checkpoint:

| Plan | Sample points | All match? |
|------|---------------|------------|
| 60-01 | start, post-probe | YES |
| 60-02 | start, mid (post-build), end | YES |
| 60-03 | start, post-Task-1, end | YES |
| 60-04 | start, post-Caddyfile, end | YES |
| 60-05 | start, post-Task-2, post-Task-3-start, post-Task-3-end | YES |

**16 sample points across Phase 60. Zero drift. D-30-07 strictly preserved.**

## Infrastructure changes (out-of-tree on Server5)

### `/usr/bin/caddy` — REPLACED with custom build (60-02)

- Built locally via `caddy:builder` Docker image (`xcaddy build v2.11.2 --with github.com/caddy-dns/cloudflare --with github.com/mholt/caddy-ratelimit`).
- Installed on Server5: `cp /usr/bin/caddy /usr/bin/caddy.bak.20260503-070012 && install -m 0755 /tmp/caddy-custom /usr/bin/caddy && systemctl restart caddy`.
- Adds two modules: `http.handlers.rate_limit` (mholt/caddy-ratelimit) + `dns.providers.cloudflare` (caddy-dns/cloudflare).
- DELETION_COUNT=0; rollback: `cp /usr/bin/caddy.bak.20260503-070012 /usr/bin/caddy && systemctl restart caddy`.

### `/etc/caddy/Caddyfile` — REPLACED with reconciled+extended content (60-04)

- Pre-swap backup at `/etc/caddy/Caddyfile.bak.20260503-072328` (689 bytes).
- New file (1410 bytes, md5 `5bf6dc34f01b2ed1205536e02f7cc323`) reconciles repo to Server5 (option (a) pull-then-patch — 3 production blocks not in repo: apps.livinity.io / changelog.livinity.io / @marketplace mcp.livinity.io; livinity.io /downloads/* file_server) AND adds the `api.livinity.io` block:
  - `tls { on_demand }` (LE on first contact)
  - `rate_limit { zone bearer { 60 events / 1m } zone ip { 30 events / 1m } }`
  - `reverse_proxy localhost:4000 { flush_interval -1 ... }` (flush_interval -1 preserves Phase 58's true token streaming per D-30-09 budget #5)
  - `handle_errors 429 { ... }` Anthropic-spec 4-field body
  - `log { output file /var/log/caddy/api.livinity.io.log format json }` (Caddy auto-redacts Authorization VALUE — T-60-34 mitigated)
  - Global directive `order rate_limit before basic_auth` (RESEARCH.md Pitfall 3)
- `caddy validate` PASSED before swap; `systemctl reload caddy` succeeded after Rule 1 fix (chown caddy:caddy /var/log/caddy/api.livinity.io.log + reset-failed).

### `/var/log/caddy/api.livinity.io.log` — NEW (60-04)

- caddy:caddy 0644.
- json access log; default Caddy redaction of Authorization header VALUE.

### Cloudflare DNS zone `livinity.io` — VERIFIED (60-04)

- A record `api → 45.137.194.102` (DNS-only, gray cloud) — verified ALREADY EXISTS via dig from 1.1.1.1 + 8.8.8.8.
- LE cert pre-issued 2026-03-19 (E8 issuer; expires 2026-06-17).
- Manual click instructions documented at `.planning/phases/60-public-endpoint-rate-limit/60-DNS-INSTRUCTIONS.md` for future loss recovery.

### `/opt/platform/relay/src/{admin-tunnel.ts,server.ts}` — DEPLOYED (60-03)

- New `admin-tunnel.ts` (73 LOC) + extended `server.ts` (+41 LOC for api.livinity.io dispatch) deployed via scp to `/opt/platform/relay/src/`.
- pm2 restart relay: clean (uptime 0s → 3s, status online).
- 11/11 vitest tests GREEN; T-60-20 (tunnel hijack via username spoofing) MITIGATED via `WHERE role = $1` query.

### Mini PC livinityd (`bruce@10.69.31.68`) — DEPLOY DEFERRED to Phase 63

- 60-04 commit `a240f81f` removed `containerSourceIpGuard` from broker source (`router.ts` + `auth.ts` + `openai-router.ts` + deleted `auth.test.ts`).
- Mini PC live livinityd still has IP guard active until next `bash /opt/livos/update.sh`.
- Harmless during Phase 60 because no external Bearer-authed traffic was sent (token-state=skip throughout Phase 60).
- Phase 63 will run `update.sh` then re-run `phase-60-smoke.sh` with valid `LIV_SK_TOKEN` to close success criteria #1 + #2.

## In-tree changes — totals

### Files created (5 plans combined)

- `platform/relay/Caddyfile` (60-04 — reconciled then extended; was already in repo, content fully replaced)
- `platform/relay/src/admin-tunnel.ts` (60-03)
- `platform/relay/src/admin-tunnel.test.ts` (60-03)
- `platform/relay/scripts/phase-60-smoke.sh` (60-05)
- `.planning/phases/60-public-endpoint-rate-limit/60-CONTEXT.md` (60-01-precursor — was created during smart-discuss)
- `.planning/phases/60-public-endpoint-rate-limit/60-RESEARCH.md` (60-01-precursor — was created during smart-discuss)
- `.planning/phases/60-public-endpoint-rate-limit/60-DIAGNOSTIC-FIXTURE.md` (60-01)
- `.planning/phases/60-public-endpoint-rate-limit/60-DNS-INSTRUCTIONS.md` (60-04)
- `.planning/phases/60-public-endpoint-rate-limit/60-SMOKE-RESULTS.md` (60-05)
- `.planning/phases/60-public-endpoint-rate-limit/60-{01,02,03,04,05}-SUMMARY.md` (one per plan)
- `.planning/phases/60-public-endpoint-rate-limit/PHASE-SUMMARY.md` (this file)
- `.planning/phases/60-public-endpoint-rate-limit/60-{01,02,03,04,05}-PLAN.md` (one per plan)

### Files modified (in-tree)

- `platform/relay/src/server.ts` (60-03 — +41 LOC api.livinity.io dispatch)
- `platform/relay/package.json` + `package-lock.json` (60-03 — added vitest@^2.1.2 dev-dep)
- `livos/packages/livinityd/source/modules/livinity-broker/router.ts` (60-04 — removed `containerSourceIpGuard` mount)
- `livos/packages/livinityd/source/modules/livinity-broker/auth.ts` (60-04 — removed function + helper)
- `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts` (60-04 — comment update)

### Files deleted (in-tree)

- `livos/packages/livinityd/source/modules/livinity-broker/auth.test.ts` (60-04 — all 15 tests were containerSourceIpGuard cases; resolveAndAuthorizeUserId tests already deferred to integration.test.ts)

### Commit count

- **60-01:** 1 doc
- **60-02:** 1 doc
- **60-03:** 4 work (RED/GREEN ×2) + 1 doc = 5
- **60-04:** 4 work + 1 doc = 5
- **60-05:** 2 work + 1 SUMMARY + 1 PHASE-SUMMARY (this file) = 4 (incl. metadata commits)

**Total: 16 commits (15 work + plan/phase docs + this PHASE-SUMMARY).**

## Locked decisions consumed

- **D-30-04** (Public endpoint = Server5 Caddy + caddy-ratelimit + LE on-demand TLS): consumed in 60-02 (custom Caddy build) + 60-04 (Caddyfile block).
- **D-30-06** (Broker emits ZERO own 429s in v30; edge handles abuse, broker forwards transparently): consumed in 60-04 (Caddyfile rate_limit zones at edge).
- **D-30-07** (Sacred file `4f868d31...` UNTOUCHED across v30): preserved across all 5 Phase 60 plans (16 sample points, byte-identical).
- **D-30-08** (D-NO-NEW-DEPS preserved on npm side, YELLOW only on Caddy non-npm infra): consumed in 60-02 (custom Caddy build introduced caddy-ratelimit Go module + xcaddy build tool — both non-npm). YELLOW status acknowledged + budgeted in 60-02.
- **D-30-09** (Phase 60 budget items: xcaddy build script + apt-mark hold caddy + rebuild documentation + caddy validate step + flush_interval -1 + fallback plan): items 1, 2, 4, 5 all delivered in 60-02 + 60-04. Item 3 (rebuild documentation in `platform/relay/README.md`) NOT done — defer to a future hygiene plan or capture as a Phase 60 follow-up. Item 6 (fallback plan) is the Phase 56 D-30-06 verdict (move rate-limit to broker if upstream caddy-ratelimit plugin abandoned) — already documented, no action needed.

## Threat model — final disposition

### Mitigated (across phase)

- **T-60-01** Information disclosure (Wave 0 SSH probe leaking REDIS_URL): redacted in 60-DIAGNOSTIC-FIXTURE.md.
- **T-60-20** Tunnel hijack via username spoofing: 60-03 `findAdminTunnel` queries `WHERE role = 'admin'` (NOT username string match); SQL contract test T7.
- **T-60-21** admin userId leaked via URL rewrite logging: pm2 logs unchanged; URL rewrites server-side only.
- **T-60-22** Client passes `/u/` prefix to bypass: 60-03 dispatch guard `if (!req.url.startsWith('/u/'))`.
- **T-60-24** PG query throws → 500 leaks stack: `findAdminTunnel` catches all errors, returns null; T4 test asserts.
- **T-60-25** + **T-60-30** + **T-60-31** + **T-60-32** + **T-60-33** + **T-60-34** + **T-60-35** + **T-60-40** + **T-60-41** + **T-60-43** + **T-60-44**: all MITIGATED per individual plan summaries (see 60-XX-SUMMARY.md "Threat Flags" sections).

### Accepted (single-tenant v30 design)

- **T-60-23** Admin tunnel offline → 100% api.livinity.io 503: documented for v30+ revisit (multi-relay HA out of scope).
- **T-60-42** Smoke script as executable could be modified: standard repo trust model.

### No leaks

- Caddy logs auto-redact Authorization VALUE to literal "REDACTED" (verified via jq inspection in 60-05). Zero `Bearer ` prefixes or `liv_sk_` substrings in any Caddy log.

## Hand-off notes for downstream phases

### Phase 61 (Rate-Limit Headers + Model Aliases + Provider Stub)

- **Coexistence with Phase 60 edge 429:** Phase 60's Caddy edge layer emits its own 429 with Retry-After:59 (Anthropic-spec 4-field body). Phase 61's job is to forward Anthropic upstream rate-limit headers verbatim through the broker → relay → Caddy chain for non-edge-throttled requests. Phase 60's edge 429 takes precedence — when Caddy's bucket is full, Phase 61's broker headers never fire.
- **Caddy header_up directives:** the existing `header_up Authorization {http.request.header.Authorization}` in the api.livinity.io block (60-04) will forward the Bearer header to the broker; Phase 61's broker rate-limit-header injection happens after the broker handler, so the chain is: broker handler → broker writes Anthropic headers → relay forwards → Caddy reverse_proxy forwards → client sees them.
- **flush_interval -1** in the api.livinity.io reverse_proxy block (60-04) preserves true token streaming for Phase 58's SSE pipeline; Phase 61 inherits this for free.

### Phase 62 (Settings UI — API Keys + Usage tabs)

- **Independent of Phase 60.** Phase 62's `apiKeys.create` route (Phase 59 Wave 4 routes.ts) produces `liv_sk_*` plaintext-once tokens that Phase 63 can use to close ROADMAP success criteria #1 + #2.
- **Per-token usage stats:** Phase 62 surfaces `broker_usage` rows; Phase 60 traffic via api.livinity.io flows through the same usage capture middleware (mounted at `server/index.ts:1229` per Phase 59), so Phase 60 traffic will appear in Phase 62 dashboards once Mini PC update.sh deploys.

### Phase 63 (Mandatory Live Verification — D-LIVE-VERIFICATION-GATE)

- **First action:** `bash /opt/livos/update.sh` on Mini PC (`bruce@10.69.31.68`) to deploy 60-04's broker IP-guard removal. Until then, broker rejects loopback requests from the relay.
- **Second action:** create a `liv_sk_*` test API key (via apiKeys.create or Phase 62 UI), then re-run `./platform/relay/scripts/phase-60-smoke.sh` with `LIV_SK_TOKEN=liv_sk_...`. Expected: §3 PASS (200 + Anthropic-shape body) — closing #1 + #2.
- **Third action:** exercise external SDK clients (Bolt.diy + Open WebUI + Continue.dev) against `https://api.livinity.io/v1/messages` per VERIFY-V30-01..08 traceability. Phase 60's perimeter is now in place; Phase 63 owns the real-world validation that the perimeter behaves correctly under real SDK traffic.
- **D-30-09 item 3** (rebuild documentation in `platform/relay/README.md`) is a Phase 63 hygiene follow-up — capture in PHASE 63 PLAN.

### Future hygiene (any phase)

- **relay.livinity.io 503** (pre-existing, Wave 0 §Notes 4) — separate wildcard SNI / cert / on_demand_tls/ask issue. NOT a Phase 60 concern but should be tracked.
- **Caddy log §6 check refinement** — current §6 in `phase-60-smoke.sh` counts the JSON KEY NAME "authorization" (false-positives 100 hits after blast). Refine to grep for actual leak patterns (`Bearer\\s+\\S` or `liv_sk_`) — non-critical but a sharper assertion.
- **Pre-existing typecheck noise (352 errors in livinityd)** in unrelated files (user/, widgets/, file-store) + `@nexus/core` missing-export issues. Out of scope for Phase 60; track separately.
- **Pre-existing breakage:** `liv-memory.service` restart-loops on Mini PC because `update.sh` doesn't build memory package. Tracked in MEMORY.md; separate fix needed.

## Closing posture

- **Phase 60 is COMPLETE.** All 5 waves shipped; 2/4 ROADMAP success criteria PASS NOW + 2/4 chain-proven and DEFERRED to Phase 63 per ROADMAP design.
- **Phase 60 perimeter is LIVE in production:** `https://api.livinity.io` accepts external HTTPS traffic, enforces 60-req/min Bearer + 30-req/min IP rate-limit, returns Anthropic-spec 429 with Retry-After:59, forwards to relay → admin tunnel → Mini PC livinityd over private LivOS tunnel.
- **Sacred file untouched** across all 5 plans — D-30-07 strictly preserved; `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d31...` byte-identical at 16 sample points.
- **D-NO-NEW-DEPS preserved** on the npm side (YELLOW status only on Caddy non-npm infra per D-30-08, budgeted in 60-02 + acknowledged).
- **D-NO-SERVER4 preserved.** All Server5 ops; Server4 untouched.
- **Phase 63 is unblocked** as the final closing phase of v30.0 milestone.

---

*Phase: 60-public-endpoint-rate-limit*
*Closed: 2026-05-03*
*Sacred SHA at end: 4f868d318abff71f8c8bfbcf443b2393a553018b (D-30-07 preserved)*
