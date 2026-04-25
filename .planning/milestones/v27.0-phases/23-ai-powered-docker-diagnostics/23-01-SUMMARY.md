---
phase: 23-ai-powered-docker-diagnostics
plan: 01
subsystem: docker
tags: [kimi, ai-diagnostics, docker, trpc, redis, react, vitest]

# Dependency graph
requires:
  - phase: 17-docker-quick-wins
    provides: stack/secret/redeploy patterns + Kimi tool surface (nexus brain)
  - phase: 19-compose-graph-vuln-scan
    provides: getCachedScan + VulnScanResult shape (consumed by AID-04)
  - phase: 22-multi-host-docker
    provides: envIdField pattern + getDockerClient(envId) for diagnoseContainer
provides:
  - One-shot Kimi completion endpoint (nexus POST /api/kimi/chat)
  - ai-diagnostics module (callKimi, redactSecrets, 3 task drivers + parsers)
  - 3 admin tRPC mutations (docker.diagnoseContainer, generateComposeFromPrompt, explainVulnerabilities) wired into httpOnlyPaths
  - useAiDiagnostics React hook bundling all 3 mutations
  - UI surfaces (AI Diagnose button on container detail, AI tab in DeployStackForm, Explain CVEs button on ScanResultPanel)
affects: [phase-23-plan-02, future-ai-features, kimi-prompt-tuning]

# Tech tracking
tech-stack:
  added: []  # All deps already present (js-yaml, ioredis, fetch, vitest)
  patterns:
    - "Kimi-completion bridge: livinityd fetches POST /api/kimi/chat with X-API-Key, no agent loop, no streaming"
    - "Pre-flight secret redaction with KEY=value + JSON-shaped regex, idempotent"
    - "Task-specific drivers each wrap callKimi() with distinct system prompts + Redis-cached results (TTL 300s)"
    - "Compose response parsing: prefer fenced ```yaml/```yml block, heuristic fallback with warnings array"

key-files:
  created:
    - "nexus/packages/core/src/api.ts (modified — endpoint added)"
    - "livos/packages/livinityd/source/modules/docker/ai-diagnostics.ts"
    - "livos/packages/livinityd/source/modules/docker/ai-diagnostics.unit.test.ts"
    - "livos/packages/ui/src/hooks/use-ai-diagnostics.ts"
  modified:
    - "livos/packages/livinityd/source/modules/docker/routes.ts"
    - "livos/packages/livinityd/source/modules/server/trpc/common.ts"
    - "livos/packages/ui/src/routes/server-control/container-detail-sheet.tsx"
    - "livos/packages/ui/src/routes/server-control/index.tsx"

key-decisions:
  - "POST /api/kimi/chat is a one-shot endpoint (no tools / no streaming / no agent loop) — wraps brain.chat directly with 60s Promise.race timeout"
  - "callKimi() is stateless — does not import @nexus/core; livinityd talks to nexus over HTTP with X-API-Key, identical pattern to ai/routes.ts:getKimiStatus"
  - "Secret redaction uses two regexes (env-style KEY=value + JSON-style \"key\":\"value\") with a shared SECRET_KEY_PATTERN so coverage is symmetric across log formats"
  - "Cache key for diagnose: nexus:ai:diag:<containerId>:<sha256(last2KB-of-redacted-logs).slice(0,16)> — invalidates as soon as new logs accumulate"
  - "Cache key for CVE explain: nexus:ai:diag:cve:<sha256(imageRef|sortedTop5Ids).slice(0,16)> — keyed on imageRef + the actual CVE set, not just the digest, so different scans of the same image with different fix data get different keys"
  - "Compose generation NOT cached — every prompt is unique by intent; caching would never hit"
  - "Top-5 CVE selection filters CRITICAL/HIGH only, sorted by CVSS desc — short-circuit returns synthetic 'no critical/high' result without hitting Kimi (cost optimization)"
  - "All 3 mutations registered in httpOnlyPaths — Kimi calls take 30-60s and would silently hang on disconnected WS clients per Phase 18 documented gotcha"
  - "tRPC mutations map [no-scan-result] → PRECONDITION_FAILED (more semantic than NOT_FOUND for 'scan first then explain')"
  - "AI compose tab uses Tabs primitive extension (yaml | git | ai) instead of a separate dialog — Plan 21-02 already established Tabs as the source-of-stack pattern"
  - "Explain CVEs button is hidden when CRITICAL+HIGH=0 — no Kimi spend on clean scans"
  - "Re-run/Re-try buttons reset mutation state via resetDiagnosis()/resetExplanation() before firing again — matches React Query v5 pattern"
  - "Two commits for Task 2 (RED test + GREEN feat) per TDD protocol; other 4 tasks single commits"

patterns-established:
  - "One-shot Kimi completion via /api/kimi/chat: any future task that needs a non-agentic LLM call (summarization, intent extraction, plain-English transformations) should use this endpoint rather than spinning up an agent loop"
  - "Bracketed-error mapping convention extended: [ai-timeout]/[ai-unavailable]/[ai-error]/[ai-bad-response]/[no-scan-result] → routes.ts maps to TRPCError codes"
  - "Pre-flight secret redaction utility: redactSecrets() in ai-diagnostics.ts is reusable for any future AI input that includes user data — Plan 23-02 (proactive watch + AI Chat container diagnostics) should import it"
  - "Sub-component co-location: AiComposeTab + DiagnosticPanel live in the parent file alongside their parent containers (DeployStackForm / InfoTab) — matches existing ScanResultPanel/RedeployStackDialog convention"

requirements-completed: [AID-01, AID-03, AID-04]

# Metrics
duration: 10min
completed: 2026-04-25
---

# Phase 23 Plan 01: AI-Powered Docker Diagnostics (Reactive) Summary

**Reactive AI diagnostics shipped via one-shot Kimi-completion bridge: container log/stats analyzer, natural-language compose generator, and CVE plain-English explainer — all routed through a new POST /api/kimi/chat endpoint and cached in Redis.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-25T03:27:32Z
- **Completed:** 2026-04-25T03:37:38Z
- **Tasks:** 5 (Task 2 split into RED+GREEN per TDD protocol → 6 commits)
- **Files modified:** 8 (3 created, 5 modified)

## Accomplishments

- **AID-01:** Container detail "AI Diagnose" button → Kimi returns plain-English `{Likely Cause, Suggested Action, Confidence}` from last 200 log lines + stats + image info; secrets pre-flight redacted
- **AID-03:** Stack create "Generate from prompt" tab → natural-language description → valid compose YAML in preview → "Use this YAML" button copies into composeYaml + flips tab to YAML
- **AID-04:** Trivy scan panel "Explain CVEs" button → Kimi returns plain-English `{Explanation, Upgrade path}` for top-5 CRITICAL/HIGH CVEs, with concrete image:tag recommendation
- **Bridge:** New `POST /api/kimi/chat` one-shot endpoint on nexus-core wraps `brain.chat()` with 60s timeout (no tools, no streaming, no agent loop)
- **Cache:** Redis-backed 5-min TTL for diagnose + CVE-explain (compose intentionally uncached)
- **Tests:** 15/15 unit tests pass for redactSecrets, payload builder, and 2 response parsers

## Task Commits

1. **Task 1: Add /api/kimi/chat endpoint to nexus-core** — `cf455dc4` (feat)
2. **Task 2: Create ai-diagnostics module with TDD** — `2d96d1df` (test, RED) + `34fbf563` (feat, GREEN)
3. **Task 3: Wire 3 tRPC mutations + httpOnlyPaths** — `e928aeff` (feat)
4. **Task 4: Create useAiDiagnostics hook** — `14471729` (feat)
5. **Task 5: Wire UI (AI Diagnose / AI compose tab / Explain CVEs)** — `5f0200cb` (feat)

## Files Created/Modified

**Created:**
- `livos/packages/livinityd/source/modules/docker/ai-diagnostics.ts` (610 lines) — Kimi bridge + 3 task drivers + secret redaction + 4 parsers
- `livos/packages/livinityd/source/modules/docker/ai-diagnostics.unit.test.ts` (253 lines) — 15 tests across 4 describe blocks
- `livos/packages/ui/src/hooks/use-ai-diagnostics.ts` (36 lines) — React hook bundling 3 mutations

**Modified:**
- `nexus/packages/core/src/api.ts` (+76 lines) — `app.post('/api/kimi/chat', …)` after `/api/kimi/logout`
- `livos/packages/livinityd/source/modules/docker/routes.ts` (+106 lines) — 3 admin mutations after `getCachedScan`
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` (+5 lines) — 3 entries under `// Phase 23 — AI diagnostics mutations` comment
- `livos/packages/ui/src/routes/server-control/container-detail-sheet.tsx` (+136 lines) — `AI Diagnostics` section + `DiagnosticPanel` sub-component in `InfoTab`
- `livos/packages/ui/src/routes/server-control/index.tsx` (+212 lines) — `AiComposeTab` sub-component before `DeployStackForm`, third `'ai'` tab inside the existing Tabs, `Explain CVEs` button + result blocks in `ScanResultPanel`

## Final API Shape

### `POST /api/kimi/chat` (nexus, LIV_API_KEY-guarded)

**Request body:**
```json
{
  "systemPrompt": "string (required, non-empty)",
  "userPrompt": "string (required, non-empty)",
  "maxTokens": "integer 256..16384 (optional, default 4096)",
  "tier": "haiku | sonnet | opus (optional, default sonnet)"
}
```

**Response (200):** `{ text: string, inputTokens: number, outputTokens: number }`

**Errors:**
- `400` validation failure (`{error}`)
- `502` Kimi/Brain failure (`{error}` truncated to 500 chars)
- `[ai-timeout]` after 60s wall-clock (Promise.race against setTimeout)

### `ai-diagnostics.ts` exports

```typescript
callKimi(systemPrompt, userPrompt, opts?: {tier?, maxTokens?}): Promise<{text, inputTokens, outputTokens}>
redactSecrets(text: string): string
buildContainerDiagnosticPayload({logs, stats, inspectInfo}): ContainerDiagnosticPayload
diagnoseContainer(name, environmentId?): Promise<AiDiagnosticResult>
generateComposeFromPrompt(prompt): Promise<AiComposeResult>
explainVulnerabilities(imageRef): Promise<AiCveExplanationResult>
parseDiagnosticResponse(raw): {likelyCause, suggestedAction, confidence}
parseComposeResponse(raw): {yaml, warnings}

// Result types
AiDiagnosticResult = {likelyCause, suggestedAction, confidence: 'low'|'medium'|'high'|'unknown', summary, model, generatedAt, cached}
AiComposeResult = {yaml, warnings, model, generatedAt}
AiCveExplanationResult = {explanation, upgradeSuggestion, model, generatedAt, cached}
```

### Cache Keys

- `nexus:ai:diag:<containerId>:<logHash16>` — diagnose result, 300s TTL
- `nexus:ai:diag:cve:<imageHash16>` — CVE-explain result, 300s TTL
- (No cache for compose generation — every prompt unique by intent)

### System Prompts (verbatim)

- **DIAGNOSE_SYSTEM_PROMPT:** Three-section format (Likely cause / Suggested action / Confidence: low|medium|high), 80 word cap each
- **COMPOSE_SYSTEM_PROMPT:** compose-spec v3.8+, named volumes, pinned versions, restart: unless-stopped, alpine-preferred, `${VAR_NAME}` for secrets
- **CVE_SYSTEM_PROMPT:** Two-section format (Explanation: 2-4 sentences / Upgrade path: image:tag recommendation)

## Decisions Made

See `key-decisions` in frontmatter. Highlights:

- **One-shot endpoint, not agent loop** — AID-01/03/04 are completion tasks with no tool-use; an agent loop would add latency, surface area, and budget tracking complexity for zero benefit. The brain.chat() call already supports system+messages+tier+maxTokens, which is the entire surface needed.
- **Redact at source, not at Kimi** — Pre-flight redaction in livinityd ensures secrets never traverse the wire to nexus or to Kimi. The two regexes (env-style + JSON-shaped) with a shared key pattern cover the realistic shapes that show up in container logs and inspect dumps.
- **Cache only deterministic outputs** — Diagnose and CVE-explain are deterministic given the same inputs (logs / CVE list); compose-from-prompt is not (each natural-language description is unique). Caching the latter would store-and-never-hit.
- **Top-5 CRITICAL/HIGH short-circuit** — `explainVulnerabilities` returns a synthetic clean response when `top.length === 0`, saving a Kimi roundtrip on healthy images. The UI also gates the button on `CRITICAL + HIGH > 0` for the same reason.
- **httpOnlyPaths for all three mutations** — Kimi can take 30-60s; the documented Phase 18 gotcha is that disconnected WS mutations hang silently. Always-HTTP gives observable failures.
- **Tabs extension over new dialog** — Plan 21-02 already established Tabs as "multiple ways to specify the same resource"; AI compose generation is conceptually a third specification mode (yaml | git | ai), not a separate flow. Re-uses existing form's name + env-vars + Deploy button.

## Deviations from Plan

None - plan executed exactly as written.

(One minor adjustment: the plan's Task 4 spec used `trpcReact.useContext()` — the codebase uses `trpcReact.useUtils()` (tRPC v11+ React Query v5 idiom). The hook doesn't actually need utils for these stateless mutations, so the import is omitted entirely. Behavioural impact: zero.)

## Issues Encountered

None - all tasks executed cleanly. Unit tests passed on first GREEN run after RED-fail confirmation.

## User Setup Required

**To use Phase 23 reactive AI diagnostics on a deployed server:**

1. **Kimi auth must be live.** Verify via `GET /api/kimi/status` (existing endpoint) — returns `{authenticated: true}` once `kimi login` has completed and credentials are at `~/.kimi/credentials/kimi-code.json` per CLAUDE.md.
2. **`LIV_API_KEY` must be set** in livinityd's environment so it can call `POST /api/kimi/chat`. Already configured on server4 per `/opt/nexus/app/start-core.sh`.
3. **`NEXUS_API_URL`** (or `LIV_API_URL`) defaults to `http://localhost:3200`; override only if running livinityd on a different host than nexus.
4. **Redeploy after pull:**
   - `cd /opt/livos/livos && git pull`
   - `cd /opt/nexus/app && git pull && npm run build --workspace=packages/core && pm2 restart nexus-core`
   - `cd /opt/livos/livos && pnpm --filter @livos/config build && pnpm --filter ui build`
   - `pm2 restart livos`

## Next Phase Readiness

**Ready for Plan 23-02** (AID-02 + AID-05):

- `callKimi()` is exported and reusable for proactive resource-watch (`scheduler/index.ts:BUILT_IN_HANDLERS['ai-resource-watch']`)
- `redactSecrets()` is exported and reusable for AI Chat container-diagnostics tool (Phase 21 chat sidebar) — should be called on any container data attached to chat context
- `diagnoseContainer()` itself is reusable as the autonomous "why is my X container slow/failing" tool implementation; just needs an MCP/tool wrapper that the existing chat agent can invoke
- Cache prefix `nexus:ai:diag:` is shared between Plan 23-01 and Plan 23-02 for cross-feature dedupe (e.g., proactive watch caches the same key shape)

## Self-Check: PASSED

Verified post-write:

- ✓ `nexus/packages/core/src/api.ts` modified, 1 occurrence of `'/api/kimi/chat'` in `dist/api.js`
- ✓ `livos/packages/livinityd/source/modules/docker/ai-diagnostics.ts` exists (11 exports, 610 lines)
- ✓ `livos/packages/livinityd/source/modules/docker/ai-diagnostics.unit.test.ts` exists (15 tests pass)
- ✓ `livos/packages/livinityd/source/modules/docker/routes.ts` contains 3 new mutation declarations
- ✓ `livos/packages/livinityd/source/modules/server/trpc/common.ts` contains 3 new httpOnlyPaths entries under Phase 23 comment
- ✓ `livos/packages/ui/src/hooks/use-ai-diagnostics.ts` exists, exports useAiDiagnostics
- ✓ `livos/packages/ui/src/routes/server-control/container-detail-sheet.tsx` contains "AI Diagnose"
- ✓ `livos/packages/ui/src/routes/server-control/index.tsx` contains "Generate from prompt" + "Explain CVEs" + "Likely Cause"
- ✓ `nexus:ai:diag:` prefix appears 2× in ai-diagnostics.ts source
- ✓ All 6 commits exist: cf455dc4, 2d96d1df, 34fbf563, e928aeff, 14471729, 5f0200cb
- ✓ UI build clean (`pnpm --filter @livos/config build && pnpm --filter ui build` exit 0)
- ✓ nexus-core build clean (`npm run build --workspace=packages/core` exit 0)
- ✓ Unit tests pass (15/15)

---
*Phase: 23-ai-powered-docker-diagnostics*
*Plan: 01*
*Completed: 2026-04-25*
