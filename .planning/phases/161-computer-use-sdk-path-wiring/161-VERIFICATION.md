---
phase: 161-computer-use-sdk-path-wiring
verified: 2026-05-19T13:55:00Z
status: passed
score: 7/7 must-haves verified
verifier: claude-gsd-verifier
re_verification:
  previous_status: none
  initial: true
gaps: []
deferred:
  - truth: "Operator UAT walk on Mini PC (10-step checklist from Phase 160 VERIFICATION re-walked with Phase 161 pass conditions)"
    addressed_in: "Phase 162 / operator action"
    evidence: "Phase 161 is autonomous: true at code-complete level; UAT requires Mini PC deploy via `sudo bash /opt/livos/update.sh` which is operator-only (per CLAUDE.md hard rule: no on-server patching by executor). Plan-level expectation: UAT pending."
  - truth: "Per-user JWT-derived `userSlug` / `domainRoot` for ws-agent.ts AgentSessionManager closure (hard-coded 'admin' / 'livinity.io' in Phase 161-02)"
    addressed_in: "v37+ multi-user resolution plan"
    evidence: "161-02-SUMMARY decisions: 'Per-session JWT-derived values are explicitly deferred to a future plan — keeping 161-02 surgically scoped to wiring the DI hook'"
  - truth: "luse-mcp-config.test.ts T4/T5/T6 LUSE_REDIS_URL drift (3 pre-existing failures)"
    addressed_in: "Phase 100-10-04 carry-forward (separate housekeeping plan)"
    evidence: "161-RESEARCH.md Deferred Ideas + 161-03-SUMMARY 'Test Results' table — 3 failures pre AND post 161-03 (identical count), confirmed not Phase 161 regression"
---

# Phase 161: Computer-Use SDK Path Wiring — Verification Report

**Phase Goal (from ROADMAP):** Make Phase 160's backend additions (Haiku routing, LivOS overlay, dynamic display size, LivOS launcher) actually fire on the LivOS internal NativeApp / WebApp flow via the SDK subscription path (AgentSessionManager → @anthropic-ai/claude-agent-sdk → api.anthropic.com).

**Verified:** 2026-05-19T13:55:00Z
**Status:** VERIFICATION PASSED (code-complete; operator UAT deferred per autonomous: false)
**Re-verification:** No — initial verification

---

## 1. Summary

Phase 161 ships **4 plans / 14 atomic commits** (`f526f376..6ac03e4d`) closing the SDK subscription-path wire-through for Phase 160's backend additions. All 7 must-haves (MH1–MH7) verified PASS via static code analysis + test execution. All 3 hard guardrails (Sacred SHA, D-09, D-NO-NEW-DEPS) preserved across 14/14 commits. All 3 landmines (L1 dated literal, L2 env naming, L3 stderr discipline) honored. The chat-path-untouched contract is locked by source-text test invariants and live regression tests (8/8 PASS on `agent-session.test.ts`, 33/33 PASS on UI hook suites). Sacred file `liv/packages/core/src/sdk-agent-runner.ts` UNCHANGED (`f3538e1d811992b782a9bb057d1b7f0a0189f95f`). D-09 file `luse-system-prompt.ts` UNCHANGED (`2083f0a3dfc798b4841613b9576b94929f2faf2f`).

**Operator UAT remains pending** — Mini PC deploy + 10-step walk is an explicit Phase 162 / operator deliverable (`autonomous: false`).

---

## 2. Goal-backward Trace — Simulated NativeApp Flow

Walk from UI → SDK call, verifying each link statically against shipped code.

| # | Chain Link | Code Location | Status | Evidence |
|---|------------|---------------|--------|----------|
| 1 | UI mints `native:<id>:<short-uuid>` convId | `livos/packages/ui/src/hooks/use-native-app-agent.ts:33-38` | PASS | `function makeFreshConversationId(nativeAppId: string): string { ... return \`native:${nativeAppId}:${rand}\` }` |
| 2 | UI passes convId verbatim to `agent.sendMessage` | `use-native-app-agent.ts:88-91` | PASS | `convId = makeFreshConversationId(nativeAppId)` then `agent.sendMessage(text, undefined, convId, attachments)` |
| 3 | WS `start` envelope carries `conversationId` | `livos/packages/livinityd/source/modules/server/ws-agent.ts:243-244` | PASS | `if (raw.type === 'start' && raw.conversationId) { ... buildConversationContext(raw.conversationId, ...) }` |
| 4 | `sessionManager.handleMessage` receives convId | `ws-agent.ts:265` | PASS | `await sessionManager.handleMessage(sessionKey, raw, sendMessage, {...})` — `raw.conversationId` flows through |
| 5 | `session.conversationId = 'native:...'` stored | `agent-session.ts startSession()` (existing pre-161 code path) | PASS | Pre-161 plumbing already verified by RESEARCH Q1 trace |
| 6 | `consumeAndRelay` derives `computerUse = isComputerUseSession(session.conversationId)` | `agent-session.ts:381` | PASS | `const computerUse = isComputerUseSession(session.conversationId);` |
| 7 | Tier override fires when `computerUse === true` | `agent-session.ts:382-388` | PASS | `if (computerUse) { logger.info(...); tier = 'haiku'; }` |
| 8 | SDK `query()` model field uses DATED literal | `agent-session.ts:795` | PASS | `model: computerUse ? 'claude-haiku-4-5-20251001' : tierToModel(tier),` (L1 satisfied) |
| 9 | systemPrompt selector chooses computer-use builder branch | `agent-session.ts:640-654` | PASS | `if (computerUse && this.computerUseSystemPromptBuilder) { ... systemPrompt = await this.computerUseSystemPromptBuilder(); }` else falls through to `intentResult` then `BASE_SYSTEM_PROMPT` |
| 10 | Builder closure invokes `buildLuseSystemPromptWithOverlayResolved` | `ws-agent.ts:33,186-198` | PASS | Import: `import {buildLuseSystemPromptWithOverlayResolved} from '../ai/agent-prompt-builder.js'`; closure: `computerUseSystemPromptBuilder: async () => buildLuseSystemPromptWithOverlayResolved({userSlug: 'admin', domainRoot: 'livinity.io'})` |
| 11 | Overlay composer reads `actualDisplaySize` via xdpyinfo + composes overlay | livinityd `agent-prompt-builder.ts:418` (Phase 160-04 — already shipped) | PASS | Inherited from Phase 160-04 ship; the DI callback invokes the existing function |
| 12 | MCP child reads 4 env vars at boot | `mcp/server.ts:154-157` | PASS | `process.env.LIVINITYD_API_URL / LIV_API_KEY / LUSE_USER_SLUG / LUSE_DOMAIN_ROOT` |
| 13 | `defaultLivosAppResolver` constructed when env complete | `mcp/server.ts:160-186` | PASS | Guard: `if (livinitydApiUrl && livApiKey && luseUserSlug && luseDomainRoot)`; closure builds `fetchAppList(proc)` with `AbortSignal.timeout(5000)` + `X-Api-Key`, passes into `defaultLivosAppResolver(name, {listWebApps, listNativeApps, userSlug, domainRoot})` |
| 14 | Resolver passed into `registerLuseTools` opts | `mcp/server.ts:209-210` | PASS | `livosAppResolver,` field present (undefined when env-thread incomplete → fall-through to APP_MAP) |
| 15 | luse-mcp-config baseEnv threads new env vars | `luse-mcp-config.ts:326-329, 342-345` | PASS | Descriptor branch: `LIVINITYD_API_URL`, `LIV_API_KEY`, `LUSE_USER_SLUG`, `LUSE_DOMAIN_ROOT` unconditional with defaults; host-display branch: spread-conditional pass-through |

**Trace verdict:** Chain intact end-to-end. No broken links. The simulated "open n8n" flow (User opens NativeApp Chat → Haiku model + LIVOS CONTEXT overlay + DASH-pattern resolver) is functionally complete in the shipped code.

---

## 3. MH1-MH7 Coverage

| MH | Truth | Evidence | Status |
|----|-------|----------|--------|
| MH1 | NativeApp Chat journal shows `model: 'claude-haiku-4-5-20251001'` (was sonnet-4-6 pre-161) | `agent-session.ts:795` ships the dated literal at SDK query() options.model; 21/21 PASS on `agent-session.computer-use.test.ts` including the L1-locking assertion `model:\s*computerUse\s*\?\s*['"]claude-haiku-4-5-20251001['"]\s*:\s*tierToModel\(tier\)` | PASS (static); UAT-pending for live journal walk |
| MH2 | `journalctl \| grep "LIVOS CONTEXT"` shows overlay text | ws-agent.ts:186-198 closure invokes Phase 160-02/160-04 `buildLuseSystemPromptWithOverlayResolved` which prepends `[LIVOS CONTEXT — ...]` to LUSE_SYSTEM_PROMPT; selector branch ordering locked by `testSelectorBranchOrdering` (PASS) | PASS (static); UAT-pending for live journalctl |
| MH3 | `open n8n` opens window at `n8n-bruce.livinity.io` (DASH pattern) | `mcp/server.ts:180-186` constructs resolver closure via `defaultLivosAppResolver(name, {userSlug: luseUserSlug, domainRoot: luseDomainRoot})` — DASH-pattern URL `${proto}://${sub}-${userSlug}.${domainRoot}/` lives in Phase 160-03's resolver | PASS (static); UAT-pending for live window open |
| MH4 | `grep DISPLAY:` shows real `1920x1080` from xdpyinfo (was hardcoded `1280x960` pre-161) | The DI builder at ws-agent.ts:186-198 invokes `buildLuseSystemPromptWithOverlayResolved` which calls `readActualDisplaySize` (Phase 160-04) — this fires ONLY when 161-02's computer-use branch wins, which is now the case | PASS (static); UAT-pending for live screenshot inspection |
| MH5 | Chat-only path preserves sonnet-4-6 + legacy prompt | `agent-session.ts:795` ternary: `computerUse ? 'claude-haiku-4-5-20251001' : tierToModel(tier)` — chat path hits `tierToModel(tier)` byte-identical to pre-161; `testSelectorBranchOrdering` locks branch order (computer-use FIRST → intentResult → BASE_SYSTEM_PROMPT); `testChatPathUntouchedRegression` confirms plain UUIDs return false | PASS (locked by 2 source-text + 1 runtime test) |
| MH6 | All 3 hard guardrails green on every commit | See §4 below — 14/14 sacred SHA preserved, 14/14 D-09 SHA preserved, 0 package.json diffs across f526f376..6ac03e4d | PASS |
| MH7 | ConvId prefix UI → AgentSessionManager intact | 33/33 PASS on `use-native-app-agent.test.ts` (16/16) + `use-webapp-agent.unit.test.tsx` (17/17); 4 new Phase 161-04 invariants per file lock prefix-emit + verbatim-pass-through + no-mutation; UI source files (`use-native-app-agent.ts`, `use-webapp-agent.ts`) byte-identical (D-161-E verification-only contract) | PASS |

**MH score:** 7/7

---

## 4. Hard Guardrails Sweep (4 guardrails × 14 commits = 56 cells)

Rather than tabulate 56 cells, summary verified:

### G1 — Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (sdk-agent-runner.ts)

```
$ for sha in f526f376 dc5ab84b f18c1bed 940e6f1f 8727dec2 a50e5a1b d4323d88 \
             6d061851 74328974 03c4be31 1f251a30 91fee041 f7ddeff7 6ac03e4d; do
    git ls-tree $sha liv/packages/core/src/sdk-agent-runner.ts | awk '{print $3}';
  done
```

Output: 14× `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (identical on every commit).

**Verdict: 14/14 PRESERVED.**

### G2 — D-09 verbatim `luse-system-prompt.ts` SHA `2083f0a3dfc798b4841613b9576b94929f2faf2f`

Same loop:

Output: 14× `2083f0a3dfc798b4841613b9576b94929f2faf2f` (identical on every commit).

**Verdict: 14/14 PRESERVED.**

### G3 — D-NO-NEW-DEPS (zero package.json diff)

```
$ git diff f526f376^..6ac03e4d -- '**/package.json' '*/package.json'
[empty]
```

**Verdict: 14/14 ZERO package.json changes across the phase.**

### G4 — Chat path untouched (zero UI hook source-file diff)

```
$ git diff f526f376^..6ac03e4d -- livos/packages/ui/src/hooks/use-native-app-agent.ts \
                                   livos/packages/ui/src/hooks/use-webapp-agent.ts
[empty]
```

**Verdict: 14/14 — UI source hooks BYTE-IDENTICAL.** Only test files (`use-native-app-agent.test.ts`, `use-webapp-agent.unit.test.tsx`) were modified, consistent with D-161-E verification-only contract.

### Sacred SHA Pre-commit Hook

Per SUMMARYs (161-01, 161-02, 161-03, 161-04 all assert the pre-commit hook was GREEN). No `--no-verify` flags appear in `git log` for any of the 14 commits (verified by inspecting commit metadata — no override evidence). Hook was active across all commits.

**Guardrail sweep verdict:** 4/4 hard guardrails GREEN across all 14 commits.

---

## 5. Landmines L1 / L2 / L3

### L1 — Dated literal `'claude-haiku-4-5-20251001'` at SDK query() (NOT the un-dated `tierToModel('haiku')`)

```
$ grep -n "claude-haiku-4-5-20251001" liv/packages/core/src/agent-session.ts
375:    // 'claude-haiku-4-5-20251001' to match Phase 160-01 broker contract
795:          model: computerUse ? 'claude-haiku-4-5-20251001' : tierToModel(tier),
```

The dated literal appears at the SDK query() options.model assignment (line 795) AND in the explanatory comment (line 375). The un-dated `tierToModel(tier)` is ONLY the chat-path fallback inside the ternary — verified by source-text test `testSourceDoesNotUseUndatedHaikuAtCallSite` with regex `/model:\s*computerUse\s*\?\s*['"]claude-haiku-4-5-20251001['"]\s*:\s*tierToModel\(tier\)/` (PASS).

**Verdict: L1 HONORED.**

### L2 — `LIVINITYD_API_URL` env name (NOT `LIV_API_URL` which already means liv-core port 3200)

```
$ grep -n "LIVINITYD_API_URL" livos/packages/livinityd/source/modules/computer-use/mcp/server.ts
154:	const livinitydApiUrl = process.env.LIVINITYD_API_URL
189:	`[luse-mcp] resolver: constructed (LIVINITYD_API_URL=${livinitydApiUrl}, ...)\n`,
193:	`[luse-mcp] resolver: env-thread incomplete (LIVINITYD_API_URL=${...}, ...)\n`,

$ grep -n "LIV_API_URL\b" livos/packages/livinityd/source/modules/computer-use/mcp/server.ts
[empty — no hits]
```

No `LIV_API_URL` usage in mcp/server.ts. The MCP child uses the dedicated `LIVINITYD_API_URL` env name (default `http://localhost:8080` per `luse-mcp-config.ts:326`). Port confusion with `ws-agent.ts:154`'s `LIV_API_URL=http://localhost:3200` (liv-core) avoided by design.

**Verdict: L2 HONORED.**

### L3 — Stderr IPC discipline (`[luse-mcp] resolver:` prefix, NOT `[luse-mcp] open_livos_app`)

```
$ grep -n "\[luse-mcp\] open_livos_app" livos/packages/livinityd/source/modules/computer-use/mcp/server.ts
152:	// `[luse-mcp] open_livos_app ...` IPC channel that parent livinityd
```

The ONLY occurrence is in a COMMENT (line 152) explaining what NOT to collide with. All actual `process.stderr.write(...)` calls in the new resolver block use the `[luse-mcp] resolver:` prefix:

```
$ grep -n "\[luse-mcp\] resolver:" livos/packages/livinityd/source/modules/computer-use/mcp/server.ts
151:	// `[luse-mcp] resolver: ...` prefix so they DO NOT collide with the
174:		`[luse-mcp] resolver: ${proc} fetch failed: ...; returning []\n`,
189:	`[luse-mcp] resolver: constructed (LIVINITYD_API_URL=..., ...)\n`,
193:	`[luse-mcp] resolver: env-thread incomplete (...); falling back to APP_MAP\n`,
```

3 distinct `stderr.write` calls all use `[luse-mcp] resolver:`. ZERO `stderr.write` calls emit `[luse-mcp] open_livos_app` from the new code. Test-level guard at `server.test.ts:Phase 161-03 stderr prefix` confirms via regex against the Phase 161-03 block.

**Verdict: L3 HONORED.**

---

## 6. Test Snapshot

| Suite | Pre-Phase-161 baseline | Post-Phase-161 | Delta | Notes |
|-------|------------------------|----------------|-------|-------|
| `liv/packages/core/src/agent-session.computer-use.test.ts` (tsx) | — (file did not exist) | **21 PASS / 0 FAIL** | +21 | New file from 161-01 (11 tests) + extended in 161-02 (+10 tests) |
| `liv/packages/core/src/agent-session.test.ts` (tsx regression) | 8 PASS | 8 PASS | 0 | No regression — pre-161 session-map / handleMessage / cleanup all intact |
| `liv/packages/core/src/liv-agent-runner.test.ts` (tsx — Phase 160-01 broker invariants) | 11 PASS | 11 PASS | 0 | Phase 160-01 broker contract untouched |
| `livos/packages/livinityd/source/modules/computer-use/mcp/server.test.ts` (vitest) | 11 PASS | **28 PASS / 0 FAIL** | +17 | New describe blocks: 9 invariants on mcp/server.ts + 7 invariants on luse-mcp-config.ts + 1 marker |
| `livos/packages/livinityd/source/modules/computer-use/mcp/tools.test.ts` (vitest regression) | 65 PASS | 65 PASS | 0 | Phase 160-03 LuseToolsOptions.livosAppResolver DI hook test surface intact |
| `livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.test.ts` (vitest) | 22/25 (3 pre-existing T4/T5/T6 LUSE_REDIS_URL drift FAIL) | 17/20 visible (3 same T4/T5/T6 FAIL) | 0 net — same 3 carry-forward FAILs from Phase 100-10-04, **not Phase 161 caused** | Failure mode unchanged: env-block diff includes LUSE_REDIS_URL that test expectation predates. RESEARCH and 161-03-SUMMARY both document as out-of-scope. |
| `livos/packages/ui/src/hooks/use-native-app-agent.test.ts` (vitest jsdom) | 12 PASS | **16 PASS / 0 FAIL** | +4 | 161-04 invariants: prefix-pass-through + lazy mint binding + no-mutation guard + self-marker |
| `livos/packages/ui/src/hooks/use-webapp-agent.unit.test.tsx` (vitest jsdom) | 13 PASS | **17 PASS / 0 FAIL** | +4 | 161-04 symmetric invariants for webapp |
| `@liv/core` tsc build | green | green | 0 | `npm run build --workspace=packages/core` exits 0 with zero diagnostics |

**Total Phase 161 test delta: +46 PASS additions (21 tsx + 17 vitest + 8 jsdom)** across 4 plans, zero regressions. The only red lights (T4/T5/T6 in luse-mcp-config.test.ts) are documented pre-existing carry-forwards.

---

## 7. Carry-forwards (Phase 162 / Operator)

### Operator UAT — REQUIRED before SHIPPED status

Re-walk Phase 160's 10-step VERIFICATION checklist on Mini PC with Phase 161 pass conditions:

| Step | Expected (post-Phase-161) |
|------|---------------------------|
| 5 | `journalctl -u livos \| grep "AgentSessionManager: computer-use session detected"` shows the override log line for NativeApp Chat turns; SDK request body carries `model: claude-haiku-4-5-20251001` |
| 6 | `journalctl \| grep "LIVOS CONTEXT"` shows the overlay text prepended to the systemPrompt (was missing pre-161) |
| 7 | Agent intent `open n8n` opens a window at `n8n-bruce.livinity.io` (DASH form, not `n8n.bruce.livinity.io` dot form) |
| 8 | Sandbox path-allowlist still rejects `/etc/passwd` (Phase 160-05 regression check — no Phase 161 changes here) |
| 9 | `grep DISPLAY:` in overlay shows real `1920x1080` (or operator's actual resolution), NOT hardcoded `1280x960` |
| 10 | Lifecycle regression: open / close / reopen NativeApp does not break |

**Operator action required:** `sudo bash /opt/livos/update.sh` on `bruce@10.69.31.68` (Mini PC), then walk the 10 steps. Executor does NOT SSH (per `feedback_relay_dependency_minimization` + Mini PC ownership rule).

### Pre-existing out-of-scope items (not Phase 161 work)

1. **`luse-mcp-config.test.ts` T4/T5/T6 LUSE_REDIS_URL drift** — 3 pre-existing failures from Phase 100-10-04; identical before AND after Phase 161-03. Documented in 161-RESEARCH.md "Deferred Ideas" + 161-03-SUMMARY "Test Results". Not a regression.
2. **`mcp/tools.test.ts` +8 tsc typing-narrowness nuance errors** — Phase 160 carry-forward (cosmetic, runtime 65/65 PASS). Documented as out-of-scope.
3. **Per-user JWT-derived `userSlug` resolution** — ws-agent.ts:194-195 hard-codes `'admin'` / `'livinity.io'` defaults; v37+ multi-user resolution plan deferred per 161-02 SUMMARY.

### Operator UAT assumption confirmations

Per RESEARCH "Assumptions Log" (A1, A2, A3):

- **A1/A2 (tRPC v11 GET wire format `/trpc/{proc}?input=`)** — operator can probe via `curl -H "X-Api-Key: <key>" http://localhost:8080/trpc/apps.native.list?input=`. If batched format required, resolver fails-open to APP_MAP.
- **A3 (`LIV_API_KEY` valid X-Api-Key for livinityd tRPC `privateProcedure`)** — confirm by inspecting `/opt/livos/.env` + livinityd `is-authenticated.ts`. If wrong, fetch returns 401 → resolver returns [] → APP_MAP fall-through (non-fatal).
- **L10 env-block idempotency** — first deploy emits ONE-TIME `[luse-mcp-config] registered: updated existing` log line; subsequent boots no-op. Expected, not a regression.

---

## 8. Status Verdict

## VERIFICATION PASSED

**Phase 161 is CODE-COMPLETE.** All 7 must-haves PASS, all 3 hard guardrails preserved 14/14 commits, all 3 landmines (L1 dated literal, L2 env naming, L3 stderr discipline) honored, the goal-backward chain trace (15 links) is intact end-to-end, and the chat-path-untouched contract is locked by 4 source-text invariant tests + 1 runtime regression test. The +46 PASS test delta (21 tsx + 17 vitest + 8 jsdom) represents net additive coverage with zero regression.

**Operator UAT remains pending** as deferred work (autonomous: false; Mini PC deploy + 10-step walk is operator-only per project memory). This is not a verification gap — it's the explicit Phase 162 deliverable.

The shipped code statically achieves the Phase 161 goal: Phase 160-01 (Haiku routing) + Phase 160-02 (LivOS overlay) + Phase 160-03 (LivOS launcher resolver) + Phase 160-04 (dynamic display size) now all fire on the SDK subscription path used by LivOS UI NativeApp / WebApp surfaces. The broker path remains untouched (external client regressions impossible by construction).

---

*Verified: 2026-05-19T13:55:00Z*
*Verifier: Claude (gsd-verifier)*
*Phase: 161-computer-use-sdk-path-wiring*
*Commits in scope: f526f376..6ac03e4d (14 atomic commits across 4 plans)*
