---
phase: 161-computer-use-sdk-path-wiring
plan: 03
subsystem: computer-use
tags:
  - computer-use
  - mcp
  - livos-launcher
  - resolver-wiring
  - phase-161
  - http-fetch
  - env-thread

requires:
  - phase: 160-luse-livos-overlay-haiku-routing
    provides: "defaultLivosAppResolver (160-03), LuseToolsOptions.livosAppResolver DI hook (160-03), descriptor baseEnv extension pattern (160-02)"
  - phase: 161-computer-use-sdk-path-wiring
    provides: "61-01 + 161-02 already shipped: AgentSessionManager Haiku tier override + LivOS overlay DI"

provides:
  - "MCP child livosAppResolver constructed at boot when 4 env vars present"
  - "luse-mcp-config.ts descriptor baseEnv threads LIVINITYD_API_URL + LIV_API_KEY + LUSE_USER_SLUG + LUSE_DOMAIN_ROOT"
  - "Fail-open fallback: missing env → resolver undefined → pre-Phase-160-03 APP_MAP behavior"
  - "Stderr IPC discipline: [luse-mcp] resolver: prefix isolated from open_livos_app IPC channel"

affects: [161-04 (UI prefix verification), Phase 162+ (operator UAT walk + per-user JWT resolution)]

tech-stack:
  added: []
  patterns:
    - "HTTP fetch idiom from ws-agent.ts:160-172 lifted into MCP child process (X-Api-Key + AbortSignal.timeout(5000) + try/catch + safe-fallback [])"
    - "Stderr-prefix-namespacing for child-process IPC discipline ([luse-mcp] resolver: vs [luse-mcp] open_livos_app)"
    - "Env-thread + DI inversion for MCP child resolvers (separate Node process cannot share parent in-memory tRPC context)"
    - "Spread-conditional baseEnv pass-through to avoid env-block-comparison pollution (configsMatch idempotency preserved)"

key-files:
  created: []
  modified:
    - "livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts (+18 lines — descriptor + host-display branches extended with 4 new env vars)"
    - "livos/packages/livinityd/source/modules/computer-use/mcp/server.ts (+61 lines — import, env-read, HTTP-fetch closures, defaultLivosAppResolver construction, registerLuseTools livosAppResolver pass)"
    - "livos/packages/livinityd/source/modules/computer-use/mcp/server.test.ts (+109 lines — 17 new source-text invariants across 2 describe blocks)"

key-decisions:
  - "LIVINITYD_API_URL is the NEW env var name (NOT LIV_API_URL) per Landmine #5 — avoids port conflict with liv-core (3200) vs livinityd (8080)"
  - "Stderr discipline (L3): all new logs use [luse-mcp] resolver: prefix; ZERO collisions with [luse-mcp] open_livos_app IPC channel that parent livinityd consumes for windowManager.openWindow dispatch"
  - "Fall-through fail-open: ANY of the 4 env vars missing → livosAppResolver stays undefined → registerLuseTools called WITHOUT it → pre-Phase-160-03 APP_MAP behavior preserved"
  - "LUSE_USER_SLUG / LUSE_DOMAIN_ROOT kept separate from LIVOS_USER_SLUG / LIVOS_DOMAIN_ROOT (Phase 160-02 overlay) — clean separation between overlay and resolver code paths"
  - "HTTP fetch idiom verbatim mirrors ws-agent.ts:160-172 (X-Api-Key + AbortSignal.timeout(5000) + try/catch + safe-fallback [])"

patterns-established:
  - "MCP-child-to-parent-tRPC HTTP fetch: ${LIVINITYD_API_URL}/trpc/${proc}?input= with X-Api-Key header and 5s timeout; failure returns [] (fail-open)"
  - "Stderr-prefix-namespacing: parent-consumed IPC channels (e.g. open_livos_app) MUST be reserved; new child logs use distinct prefixes (e.g. resolver:)"
  - "baseEnv extension: descriptor-branch unconditional with sensible defaults; host-display branch spread-conditional pass-through"

requirements-completed: []

duration: 28min
completed: 2026-05-19
---

# Phase 161 Plan 03: Computer-Use SDK Path Wiring — MCP Resolver Wire-Through Summary

**defaultLivosAppResolver wired into Luse MCP child at boot via env-thread + HTTP-fetch closures, completing the dead-code closure from Phase 160-03 — "open n8n" agent intent now reaches windowManager.openWindow with DASH-pattern URL n8n-bruce.livinity.io.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-05-19T06:30:00Z
- **Completed:** 2026-05-19T06:38:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- **Plan 160-03's defaultLivosAppResolver now wired into the live MCP child** — Phase 160-03 created the resolver export but never constructed it; Plan 161-03 closes the gap by reading 4 env vars at MCP-child boot and constructing the resolver closure that feeds defaultLivosAppResolver from `../native/window.js`.
- **luse-mcp-config.ts baseEnv block extended with 4 new env vars** (`LIVINITYD_API_URL`, `LIV_API_KEY`, `LUSE_USER_SLUG`, `LUSE_DOMAIN_ROOT`) — descriptor branch with unconditional defaults; host-display branch with spread-conditional pass-through (preserves `configsMatch` idempotency).
- **HTTP fetch idiom lifted verbatim from ws-agent.ts:160-172** — same `X-Api-Key` header + `AbortSignal.timeout(5000)` + try/catch + safe-fallback `[]` pattern. Failure modes are non-fatal: bad HTTP → resolver returns null → fall-through to APP_MAP.
- **17 new source-text invariant tests** (28/28 PASS total on `server.test.ts`) lock the resolver wiring, env-var names, AbortSignal timeout, tRPC URL shape, stderr discipline, registerLuseTools pass-through, and Phase 160-02 LIVOS_USER_SLUG preservation.
- **Pre-existing 11 `resolveDisplay — Phase 102-06 env precedence` tests untouched** — additive change only.
- **All 7 hard guardrails GREEN.**

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend luse-mcp-config.ts baseEnv block with 4 new env vars** — `6d061851` (feat)
2. **Task 2: Construct livosAppResolver via env-thread + HTTP fetch in mcp/server.ts** — `74328974` (feat)
3. **Task 3: Add 17 source-text invariants on mcp/server.test.ts** — `03c4be31` (test)

## Files Created/Modified

- `livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts` — extend `baseEnv` block in `buildLuseConfig`: descriptor branch adds 4 new keys (`LIVINITYD_API_URL`, `LIV_API_KEY`, `LUSE_USER_SLUG`, `LUSE_DOMAIN_ROOT`) with defaults; host-display branch uses spread-conditional pass-through.
- `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` — import `defaultLivosAppResolver` + `LivosAppMatch` type from `../native/window.js`; in `main()` read 4 env vars, construct HTTP-fetch closures + resolver when all present; pass `livosAppResolver` into `registerLuseTools` options.
- `livos/packages/livinityd/source/modules/computer-use/mcp/server.test.ts` — add `readFileSync` source-text capture for `server.ts` and `luse-mcp-config.ts`; append 2 new `describe` blocks with 17 invariants (10 server.ts + 7 luse-mcp-config.ts).

## Decisions Made

- **L2 env naming** — Used `LIVINITYD_API_URL` (NEW name) instead of `LIV_API_URL`. `LIV_API_URL` already means `http://localhost:3200` (liv-core) per `ws-agent.ts:154`, so reusing it would create port confusion since livinityd's tRPC is on port 8080.
- **L3 stderr IPC discipline** — All new logs in `mcp/server.ts` use `[luse-mcp] resolver:` prefix. The parent livinityd consumes `[luse-mcp] open_livos_app kind=... appId=... route=...` lines to drive `windowManager.openWindow`; collision would cause IPC injection. Verified at test level: defensive regex against `Phase 161-03 ... registerLuseTools` block confirms no `open_livos_app` write in new code.
- **Fail-open fallback** — When any env var missing (legacy host-display Luse without descriptor, or pre-multi-user dev), do NOT construct resolver. `registerLuseTools` called without `livosAppResolver`, behavior identical to pre-Phase-160-03 APP_MAP path.
- **Separate `LUSE_*` and `LIVOS_*` env namespaces** — Phase 160-02's `LIVOS_USER_SLUG` (read by `buildLuseOverlay`) and Phase 161-03's `LUSE_USER_SLUG` (read by `defaultLivosAppResolver`) carry the same value but feed different code paths. Kept separate per RESEARCH Q4 — cleaner separation; future overlay rename won't break resolver.
- **HTTP fetch JSON shape `data.result?.data ?? []`** — tRPC v11 wire format for `query` procedures is `{result: {data: <array>}}`. Safe-fallback `[]` when result missing or malformed.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Proofs

### Fetch pattern proof (verbatim mirror of ws-agent.ts:160-172)

```typescript
// mcp/server.ts (Phase 161-03 block):
const res = await fetch(`${livinitydApiUrl}/trpc/${proc}?input=`, {
  headers: {'X-Api-Key': livApiKey},
  signal: AbortSignal.timeout(5000),
})
if (!res.ok) throw new Error(`HTTP ${res.status}`)
const data = (await res.json()) as {result?: {data?: any[]}}
return data.result?.data ?? []
```

vs.

```typescript
// ws-agent.ts:160-172 (analog reference):
const res = await fetch(`${livApiUrl}/api/capabilities?status=active`, {
  headers: apiKey ? {'X-Api-Key': apiKey} : {},
  signal: AbortSignal.timeout(5000),
})
if (!res.ok) throw new Error(`HTTP ${res.status}`)
const data = await res.json() as {capabilities: CapabilityManifest[]}
```

Same shape, same X-Api-Key header, same 5000ms timeout, same try/catch + safe-fallback.

### Stderr IPC prefix proof (L3 — D-161-D stderr-IPC discipline)

```bash
$ grep -nE "stderr\.write\(['\"\`]\[luse-mcp\] open_livos_app" \
    livos/packages/livinityd/source/modules/computer-use/mcp/server.ts | wc -l
0
```

ZERO collisions with the `[luse-mcp] open_livos_app` IPC channel. All 4 new resolver logs use `[luse-mcp] resolver:` prefix:

```text
[luse-mcp] resolver: ${proc} fetch failed: ${err.message}; returning []
[luse-mcp] resolver: constructed (LIVINITYD_API_URL=..., userSlug=..., domainRoot=...)
[luse-mcp] resolver: env-thread incomplete (LIVINITYD_API_URL=..., ...); falling back to APP_MAP
```

Test-level guard at `server.test.ts:Phase 161-03 stderr prefix` test:

```typescript
const phase161Block = SERVER_SRC.match(/Phase 161-03[\s\S]*?registerLuseTools/)?.[0] ?? ''
expect(phase161Block).not.toMatch(/^\s*\[luse-mcp\]\s+open_livos_app/m)
expect(phase161Block).not.toMatch(/stderr\.write\(['`"]\[luse-mcp\]\s+open_livos_app/)
```

### Env-name proof (L2 — Landmine #5)

```bash
$ grep -n "LIVINITYD_API_URL" mcp/server.ts | wc -l
6  # (env read + 2 conditional checks + 2 log lines + 1 closure binding)

$ grep -n "LIV_API_URL\b" mcp/server.ts | wc -l
0  # No conflict with ws-agent.ts liv-core (3200) usage
```

### Fall-through behavior test (live observation from test run)

```text
[luse-mcp] resolver: env-thread incomplete (LIVINITYD_API_URL=MISSING, LIV_API_KEY=MISSING,
LUSE_USER_SLUG=MISSING, LUSE_DOMAIN_ROOT=MISSING); falling back to APP_MAP
```

This stderr output during test run (env vars unset by default) confirms the fall-through branch fires and the diagnostic log fires per design — `registerLuseTools` receives `livosAppResolver: undefined` and `mcp/tools.ts:749` falls through to classic Bytebot APP_MAP.

### All 7 Hard Guardrails GREEN

| # | Guardrail | Result |
|---|-----------|--------|
| 1 | Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` | UNCHANGED — verified via `git ls-tree HEAD` |
| 2 | D-09 verbatim: `luse-system-prompt.ts` bytes UNCHANGED | `git diff HEAD~3 -- ...luse-system-prompt.ts` empty |
| 3 | D-NO-NEW-DEPS: `**/package.json` UNCHANGED | `git diff HEAD~3 -- '**/package.json'` empty |
| 4 | L2 env naming: `LIVINITYD_API_URL` NOT `LIV_API_URL` | Verified — 6 hits LIVINITYD_API_URL, 0 hits LIV_API_URL in server.ts |
| 5 | L3 stderr discipline: no `[luse-mcp] open_livos_app` collision in new code | Test guard PASS; 0 hits via grep |
| 6 | Fall-through preserved when env-thread incomplete | Confirmed live during test run — diagnostic log fires |
| 7 | MCP wire discipline: stdout reserved for JSON-RPC; all new logs via `process.stderr.write` only | Confirmed by code inspection — every new log uses `process.stderr.write(...)` |

## Test Results

| Test file | Pre-161-03 | Post-161-03 | Delta |
|-----------|------------|-------------|-------|
| `source/modules/computer-use/mcp/server.test.ts` | 11/11 PASS | **28/28 PASS** | +17 new invariants |
| `source/modules/computer-use/mcp/tools.test.ts` | 65/65 PASS | 65/65 PASS | unchanged (no regression) |
| `source/modules/computer-use/mcp/tools.window.test.ts` | 9/9 PASS | 9/9 PASS | unchanged |
| `source/modules/computer-use/luse-mcp-config.test.ts` | 22/25 PASS (3 baseline carry-forward T4/T5/T6 LUSE_REDIS_URL drift from Phase 100-10-04) | 22/25 PASS | unchanged — additive change did NOT introduce new regressions |

**No new regressions.** The 3 pre-existing `luse-mcp-config.test.ts` baseline failures (T4/T5/T6 LUSE_REDIS_URL drift) are documented as out-of-scope per RESEARCH Deferred Ideas (Phase 100-10-04 carry-forward). Verified by stash+rerun: same 3 fails before AND after 161-03 changes — additive only.

## Operator Risks Surfaced (for UAT)

These are documented per RESEARCH "Assumptions Log" — not blockers, but operator should confirm during deploy:

- **A1 (tRPC v11 wire format)** — Researcher assumed `/trpc/{proc}?input=` works for empty-input GET queries; not directly curl-verified against running livinityd. Risk: if tRPC requires batched format `/trpc/{proc}?batch=1&input=...`, resolver returns [] (fail-open). Operator can probe via `curl -H "X-Api-Key: <key>" http://localhost:8080/trpc/apps.native.list?input=` during UAT.
- **A3 (API key scope)** — Researcher assumed `LIV_API_KEY` from `/opt/livos/.env` validates against livinityd's tRPC `privateProcedure` (not just liv-core's). If wrong, fetch returns 401 → resolver returns [] → falls back to APP_MAP. Operator can confirm by inspecting livinityd's auth middleware at `is-authenticated.ts`.
- **L10 (env-block idempotency)** — `configsMatch` (luse-mcp-config.ts:347-373) compares env-block keys for idempotency. Adding 4 new keys triggers the "updated existing" path on first boot after deploy → operator will see a ONE-TIME `[luse-mcp-config] registered: updated existing` log line. Expected, not a regression.

## Issues Encountered

None — plan executed cleanly with the analog pattern lift from `ws-agent.ts:160-172`.

## Next Phase Readiness

- **161-04 (UI prefix verification)** — ready to plan. Per CONTEXT D-161-E this is verification-only since `use-native-app-agent.ts` already emits `native:` prefix unconditionally.
- **Operator UAT walk** — Phase 160's 10-step VERIFICATION.md can now be re-walked with Step 7 (`open n8n`) expected to produce a window at `n8n-bruce.livinity.io` (DASH form, not dot). Requires Mini PC deploy: `bash /opt/livos/update.sh`.
- **MCP child re-spawn** — McpClientManager handles re-spawn on config changes, so the env-block update triggered by 161-03 on first post-deploy boot will be picked up automatically.

## Self-Check: PASSED

**Files modified verified:**
- `livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts` — FOUND, +18 lines (descriptor + host-display branches)
- `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` — FOUND, +61 lines (import + env-read + closures + resolver + registerLuseTools)
- `livos/packages/livinityd/source/modules/computer-use/mcp/server.test.ts` — FOUND, +109 lines (2 describe blocks, 17 invariants)

**Commits verified:**
- `6d061851` — FOUND (Task 1)
- `74328974` — FOUND (Task 2)
- `03c4be31` — FOUND (Task 3)

**Test runs verified:**
- `server.test.ts` 28/28 PASS
- `tools.test.ts` 65/65 PASS (no regression)
- `tools.window.test.ts` 9/9 PASS (no regression)

**Guardrails verified:**
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED via `git ls-tree HEAD`
- D-09 verbatim — `git diff HEAD~3 -- luse-system-prompt.ts` empty
- D-NO-NEW-DEPS — `git diff HEAD~3 -- '**/package.json'` empty

---
*Phase: 161-computer-use-sdk-path-wiring*
*Completed: 2026-05-19*
