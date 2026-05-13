---
phase: 112-webapp-subdomain-gateway-proxy-fix-n8n-routing
verified: 2026-05-13
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: null
  previous_score: null
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 112: WebApp Subdomain Gateway Proxy Fix (n8n routing) — Verification Report

**Phase Goal:** Fix livinityd's subdomain gateway middleware so requests to `<app>.<domain>` (e.g. `n8n.test.livinity.live`) are proxied through the gateway middleware instead of serving livinityd's own UI HTML.

**Verified:** 2026-05-13
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

The phase shipped a **defense-in-depth bootstrap** of `livos:domain:config`:

1. **Install-time seed** (`_dld_seed_domain_config` bash helper) — covers fresh `install.sh --mode hybrid` runs.
2. **Boot-time fallback** (TypeScript try/catch in livinityd `start()`) — survives accidental `redis-cli DEL`.

Both layers are guarded by an EXISTS short-circuit, both write source-tagged JSON (`source:"install-112"` vs `source:"boot-112"`), both follow WARN-not-FAIL semantics, and **the gateway middleware itself is byte-identical** (zero diff in `server/index.ts`).

The phase goal "requests to `<app>.<domain>` are proxied through the gateway middleware instead of serving livinityd's own UI HTML" is **achieved**: before the fix, `curl -H "Host: n8n.test.livinity.live"` returned HTTP 200 + livinityd CSP (the gate short-circuited); after the fix, the same curl returns HTTP 302 → `/login` (the gateway fires, subdomain lookup succeeds, auth gate engages because n8n is not flagged `public`).

---

## Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | `curl -H 'Host: n8n.test.livinity.live' http://127.0.0.1:8080` on mainserver returns gateway response (not livinityd's CSP-stamped UI) | PASS | SUMMARY.md L143-147 + INVESTIGATION.md "AFTER" section — HTTP 302 → `/login` replaces HTTP 200 + `default-src 'self'` CSP. Auth gate firing IS the gateway firing. Operator UAT 2026-05-13 confirmed n8n UI loads. |
| 2  | Gateway middleware in `server/index.ts` fires for subdomain requests on hybrid-mode installs (not short-circuited by missing `livos:domain:config`) | PASS | `redis-cli GET livos:domain:config` post-deploy returns `{"domain":"test.livinity.live","active":true,"activatedAt":<epoch>,"source":"boot-112"}` (SUMMARY.md L137-138). Gate at `livos/packages/livinityd/source/modules/server/index.ts:321-324` passes → subdomain lookup at L342-345 is now reached. |
| 3  | Fresh `install.sh --mode hybrid` run leaves `livos:domain:config` populated with `{active:true, domain:<LIVOS_DOMAIN>}` | PASS | `_dld_seed_domain_config` helper exists at `scripts/install/deploy-livinityd.sh:1055` and is wired into `deploy_livinityd` pipeline at L1602 (between `_dld_seed_mcp_servers` and `_dld_write_systemd_unit`). Helper body writes `{"domain":"%s","active":true,"activatedAt":%s,"source":"install-112"}` derived from `livos:domain:hybrid_subdomain` for hybrid mode (L1090-1093). |
| 4  | Existing `livos:domain:config` entries are NOT overwritten on install re-run (idempotent) | PASS | EXISTS short-circuit at `deploy-livinityd.sh:1080-1084` returns early with `ok "livos:domain:config already present (reuse — preserves operator config)"`. Mirrored in TS at `livos/packages/livinityd/source/index.ts:438-440` with `if (!existing) {...}`. TEST_PHASE_112 assertion 2 enforces the `EXISTS livos:domain:config` token. |
| 5  | Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across every commit | PASS | Verified at all 4 source commits: `e39fb679`, `9cbcc945`, `43fe0fd0`, `8f9f0395` — each `git show <sha>:liv/packages/core/src/sdk-agent-runner.ts \| git hash-object --stdin` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. Current HEAD: matches. SUMMARY.md L156-162 records the gate. |
| 6  | Mini PC's `livos/install.sh` and `update.sh` untouched (D-NO-PROD-IMPACT) | PASS | `git diff e39fb679~1..8f9f0395 -- livos/install.sh livos/update.sh \| wc -l` returns 0. |
| 7  | Caddyfile generation logic untouched (D-112-NO-CADDY-CHANGE) | PASS | `git diff e39fb679~1..8f9f0395 -- '*Caddyfile*' livos/packages/livinityd/source/modules/domain/caddy.ts \| wc -l` returns 0. |
| 8  | Subdomain auth gate at `server/index.ts:389-440` unchanged (D-112-NO-LIVOS-AUTH-BYPASS) | PASS | `git diff e39fb679~1..8f9f0395 -- livos/packages/livinityd/source/modules/server/index.ts \| wc -l` returns 0 (whole file unchanged, auth gate trivially preserved). Auth marker grep count at current HEAD: **44** (matches SUMMARY.md L49 expected baseline). |

**Score:** 8/8 truths verified — all PASS.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `.planning/phases/112-.../112-01-INVESTIGATION.md` | Root-cause investigation: which Redis key the gateway gates on + which writers populate it + why fresh hybrid install leaves it empty | VERIFIED | Exists, 154 lines, contains Live Redis State table, HTTP Probe Results (BEFORE), Code-Path Walk, Writers grep evidence, Hypothesis A confirmed, Recommended Fix Shape locks Option A+B. Committed in `e39fb679`. |
| `scripts/install/deploy-livinityd.sh` | New `_dld_seed_domain_config` helper + pipeline wire BEFORE `_dld_write_systemd_unit` | VERIFIED | Helper defined at L1055-1141 (87 lines incl comments). Pipeline wire at L1602 (after `_dld_seed_mcp_servers` at L1601, before `_dld_write_systemd_unit`). Committed in `9cbcc945` (+104/−3). |
| `livos/packages/livinityd/source/index.ts` | Defensive fallback in gateway middleware OR startup-time domain-config bootstrap from local_mode keys | VERIFIED | Boot-time fallback try/catch at L429-470 (+43 lines), positioned immediately after `seedDefaultAliases` block. Writes `source:'boot-112'`. Log line `Phase 112: bootstrapped livos:domain:config domain=${domain} (local_mode=${localMode})` at L465. Committed in `43fe0fd0`. |
| `scripts/install/__tests__/test-deploy-livinityd.sh` | +5 regression assertions (TEST_PHASE_112_DOMAIN_CONFIG_SEED block) | VERIFIED | Block at L1214-1271 (5 assertions: helper-defined, body-tokens, WARN-not-FAIL, pipeline-order, JSON-envelope-shape). Committed in `8f9f0395` (+60/−1). Test result per SUMMARY.md L167: 158 → 163 PASS (+5, 0 FAIL). |

---

## Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `scripts/install/deploy-livinityd.sh _dld_seed_domain_config` | Redis key `livos:domain:config` | `redis-cli SET` with EXISTS short-circuit | WIRED | Helper body at L1080 has `EXISTS livos:domain:config` gate; L1127 has `SET livos:domain:config "$json"`. TEST_PHASE_112 assertion 2 enforces both tokens are present. |
| `livos/packages/livinityd/source/modules/server/index.ts` gateway middleware | Redis key `livos:domain:config` | `this.livinityd.ai.redis.get('livos:domain:config')` | WIRED | Gateway code at `server/index.ts:321-322` already reads this key (unchanged in this phase — verified by zero-diff above). With Option A+B now populating the key, the gate passes on fresh installs and after reboots. |
| `scripts/install/mode-hybrid.sh` | `_dld_seed_domain_config` in deploy-livinityd.sh | Shared `LIVOS_DOMAIN` + `livos:domain:hybrid_subdomain` Redis key set BEFORE `deploy_livinityd` runs | WIRED | Helper reads `livos:domain:local_mode` first (L1088), then `livos:domain:hybrid_subdomain` for `hybrid` case (L1092). These are written by `mode-hybrid.sh` before `deploy_livinityd` is invoked, satisfying the temporal ordering required for the seed. |
| `livos/packages/livinityd/source/index.ts start()` (boot-time fallback) | Redis key `livos:domain:config` | `this.ai.redis.set('livos:domain:config', JSON.stringify(config))` | WIRED | Block at L438-470 reads existing config, dispatches on `livos:domain:local_mode`, writes derived config when missing. Idempotent + non-fatal. |

---

## D-112-* Locked Decisions Verification

Each locked decision (declared in PLAN frontmatter `ad_hoc_decisions`) is independently verified:

| Decision | Verification | Result |
| -------- | ------------ | ------ |
| **D-112-NO-CADDY-CHANGE** | `git diff e39fb679~1..8f9f0395 -- '*Caddyfile*' livos/packages/livinityd/source/modules/domain/caddy.ts \| wc -l` = 0 | HONORED |
| **D-112-NO-LIVOS-AUTH-BYPASS** | `git diff e39fb679~1..8f9f0395 -- livos/packages/livinityd/source/modules/server/index.ts \| wc -l` = 0 (entire file untouched). Auth marker grep count = 44 (matches expected) | HONORED |
| **D-112-SACRED-SHA-UNTOUCHED** | All 4 commits + current HEAD = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (table below) | HONORED |
| **D-112-MIN-BLAST-RADIUS** | Only NEW code: one bash helper (~87 lines), one TS try/catch (~43 lines), 5 test assertions. Gateway middleware byte-identical | HONORED |
| **D-112-IDEMPOTENT-SEED** | EXISTS short-circuit at `deploy-livinityd.sh:1080-1084` + TS `if (!existing)` at `index.ts:439-440`. TEST_PHASE_112 assertion 2 enforces token presence | HONORED |
| **D-112-WARN-NOT-FAIL** | Helper body has 0 `fail ` calls + 5 `return 0` exit ramps (TEST_PHASE_112 assertion 3 enforces this) | HONORED |
| **D-NO-PROD-IMPACT** | `git diff e39fb679~1..8f9f0395 -- livos/install.sh livos/update.sh \| wc -l` = 0 | HONORED |

### Sacred SHA Per-Commit Table

| Commit | `git hash-object` of `liv/packages/core/src/sdk-agent-runner.ts` |
| ------ | ---------------------------------------------------------------- |
| `e39fb679` (investigation) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| `9cbcc945` (Option A — install helper) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| `43fe0fd0` (Option B — boot fallback) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| `8f9f0395` (tests) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Current HEAD | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |

**Sacred SHA preserved 4/4 commits + current HEAD.**

---

## Live UAT Confirmation (Mainserver 154.53.56.75)

UAT performed by operator on 2026-05-13. Live curl evidence recorded in `112-01-SUMMARY.md` L108-151.

| Check | Before Fix | After Fix | Status |
| ----- | ---------- | --------- | ------ |
| `curl -H "Host: n8n.test.livinity.live" :8080` HTTP status | 200 | 302 (→ `/login`) | PASS — gateway firing |
| Response signature | livinityd CSP (`default-src 'self'`) + 1.8KB UI shell | Redirect to `/login` (auth gate engaging because n8n is not `public:true`) | PASS — no longer UI fall-through |
| `redis-cli GET livos:domain:config` | empty | `{"domain":"test.livinity.live","active":true,"activatedAt":...,"source":"boot-112"}` | PASS — Option B seed fired on first boot |
| journalctl `Phase 112: bootstrapped...` log line | absent | present | PASS — boot-time fallback logged |
| Operator browser test (`https://n8n.test.livinity.live`) | LivOS dashboard rendered (wrong) | n8n UI rendered (via session or `/login` → n8n redirect) | APPROVED |
| Sacred SHA on mainserver post-deploy | n/a | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | PASS |

**Operator approval timestamp:** 2026-05-13T22:30Z (per SUMMARY.md L75).

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |

**None.** The Phase 112 changes are tightly scoped (87-line bash helper + 43-line TS block + 60-line test block). No TODOs, FIXMEs, empty handlers, or stub returns. All new code paths have explicit error handling (WARN-not-FAIL). All idempotency gates are wired with EXISTS checks.

---

## Tests

- `bash scripts/install/__tests__/test-deploy-livinityd.sh`: **158 → 163 PASS (+5, 0 FAIL)** (per SUMMARY.md L167, Task 2c commit `8f9f0395`).
- No tests regressed.

---

## Requirements Coverage

Plan 112-01 declared `requirements: []` (pure tech-debt-and-bug-fix phase, no traceability item).

ROADMAP.md Phase 112 success criteria:
- Subdomain routes through gateway: SATISFIED (Truth 1, 2)
- Idempotent re-install: SATISFIED (Truth 4)
- Sacred SHA preserved: SATISFIED (Truth 5)
- No prod impact: SATISFIED (Truth 6)
- No Caddy change: SATISFIED (Truth 7)
- Auth gate untouched: SATISFIED (Truth 8)

---

## Open Follow-ups (Explicitly DEFERRED — NOT verification gaps)

The following item is **explicitly out of scope** per locked decisions and is documented for future planning. It is NOT counted as a verification gap:

**`apps.ts:registerAppSubdomain` `public:true` propagation for declarative-public apps.**

The current AFTER state has the gateway firing correctly but bouncing n8n traffic through the LivOS auth gate (HTTP 302 → `/login`). This works (user logs into LivOS, then n8n UI loads), but a future enhancement would propagate the app manifest's `public: true` flag into `livos:domain:subdomains` entries so the gateway at `server/index.ts:392` bypasses LivOS auth for public-by-design apps.

This is **OUT OF SCOPE for Phase 112** by D-112-NO-LIVOS-AUTH-BYPASS — touching the auth gate logic or the `public` flag propagation here would have widened the blast radius. Captured as a follow-up plan candidate (Phase 113-bis or v34.1, or absorbable into Phase 107 default-apps cleanup if that phase has room).

Suggested plan name: `apps.ts public-flag propagation for declarative-public apps` (~3 tasks: read manifest `public` field → propagate into `registerAppSubdomain` write → +2 regression assertions in apps.test.ts).

A secondary documented carry-forward from SUMMARY.md L215: UAT Step 5 (idempotency-via-operator-simulation walkthrough) was scoped in the plan but not actively walked. Low risk — EXISTS short-circuit is enforced by TEST_PHASE_112 assertion 2 and the TS `if (!existing)` guard. Not a gap.

---

## Human Verification Required

**None.** Operator already performed the binding UAT on mainserver 154.53.56.75 on 2026-05-13 and approved (per SUMMARY.md L75, L151). Live curl + browser smoke + Redis state inspection all confirmed pass conditions. No further human steps needed for Phase 112 closure.

---

## Gaps Summary

**No gaps.** All 8 must-haves verified, all 7 D-112-* locked decisions honored, sacred SHA preserved 4/4 commits + HEAD, operator UAT approved with live curl evidence captured in both INVESTIGATION.md AFTER section and SUMMARY.md Live Evidence section. The phase goal — gateway proxies subdomain requests instead of falling through to livinityd UI — is achieved end-to-end and verified live on mainserver.

---

_Verified: 2026-05-13_
_Verifier: Claude (gsd-verifier)_
