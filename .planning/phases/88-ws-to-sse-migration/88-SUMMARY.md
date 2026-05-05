# Phase 88 — WebSocket → SSE Migration — SUMMARY

**Status:** COMPLETE
**Wave:** 4 (paralel with P89)
**Sacred SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED (verified before AND after).

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `livos/packages/ui/src/routes/ai-chat/v32/AgentSelector.tsx` | 169 | Compact dropdown driven by `agents.list` tRPC; `is_default` → seed UUID → first-row fallback chain |
| `livos/packages/ui/src/routes/ai-chat/v32/StatusDetailCard.tsx` | 120 | Liv-styled animated phrase card consuming `status_detail` payload; phase icons (pulse-dots / wrench / hourglass), NO Hermes KAWAII |
| `livos/packages/ui/src/routes/ai-chat/v32/lib/sse-adapter.ts` | 175 | Pure helpers projecting P67-04 SSE shapes → P81 v32 shapes (`sseSnapshotToV32`, `sseStateToChatMessages`, `sseSnapshotsToV32List`, `streamStatusToAgentStatus`, `isStreamActive`) |
| `.planning/phases/88-ws-to-sse-migration/88-CONTEXT.md` | 152 | Phase planning document |
| `.planning/phases/88-ws-to-sse-migration/88-SUMMARY.md` | (this file) | Phase summary |

## Files Modified

| File | Delta | Change summary |
|------|-------|----------------|
| `livos/packages/ui/src/routes/ai-chat/v32/index.tsx` | -130 / +156 | Replaced mock streaming with `useLivAgentStream`; mounted `ToolCallPanel` + `AgentSelector` + `StatusDetailCard`; auto-open via `shouldAutoOpen` with false→true ref guard; `liv-sidebar-toggled` listener for layout shift; toast on stream error |
| `livos/packages/ui/src/lib/liv-agent-types.ts` | +29 | Additive: `'status_detail'` ChunkType variant; new `StatusDetailPayload` type; optional `currentStatus` on `ConversationStreamState`; default `null` in `makeEmptyConversationState` |
| `livos/packages/ui/src/lib/use-liv-agent-stream.ts` | +29 | Additive: `applyChunk` extended with `status_detail` branch + `null` clear on terminal status; `currentStatus` exposed on `UseLivAgentStreamReturn`; import of `StatusDetailPayload` |

## Pattern Implementation Map

### V32-MIGRATE-01 — useLivAgentStream wiring
- v32/index.tsx imports `useLivAgentStream` from `@/lib/use-liv-agent-stream`
- One stable `conversationId` per mount via `useState(makeConversationId)` — uses `crypto.randomUUID` with fallback
- Composer submit calls `sendMessage(input.trim())`; stop calls `stop()` (P67-04 hook owns reconnect-with-after-idx internally)
- SSE state projected through pure adapter helpers — no React state duplication

### V32-MIGRATE-02 — `status_detail` consumption
- `liv-agent-types.ts` `ChunkType` extended with `'status_detail'` (additive — backend ships this since P87 commit `628ed1ca`)
- `applyChunk()` reducer in `use-liv-agent-stream.ts` matches `chunk.type === 'status_detail'`, validates payload (`phase` + `phrase` + `elapsed`), writes to `next.currentStatus`
- Terminal status (`complete`/`error`/`stopped`) clears `currentStatus = null` so the card hides when the run finishes
- `StatusDetailCard.tsx` consumes the payload — phase determines icon variant (animated dots for thinking, pulsing wrench for tool_use, pulsing hourglass for waiting)
- Card rendered above the composer, only when `currentStatus !== null && isStreaming` — visible across thread scroll

### V32-MIGRATE-03 — Auto-open ToolCallPanel
- `useEffect([liveToolCalls])` calls `shouldAutoOpen(liveToolCalls)` (from P82's `lib/is-visual-tool`)
- `prevAutoOpenRef` (useRef) holds the previous return value — only opens panel on the false→true transition (D-88-05)
- User-initiated close (X button / Cmd+I) sets `panelOpen=false`; auto-open does NOT re-trigger until a new visual snapshot arrives
- `streamStatusToAgentStatus(status)` adapter feeds the panel its expected `agentStatus` prop value

### V32-MIGRATE-04 — Agent selector
- `AgentSelector` compact pill (rounded-full, h-8) anchored top-left of chat header next to "Liv Agent v2" badge
- `useAgents({})` fetches the list via `agents.list` tRPC (P85-UI)
- Default selection chain: `isDefault` flag → seed UUID `11111111-1111-4111-8111-111111111111` → first row
- Selection updates local `selectedAgentId` + `selectedAgent` state — addressable for future `+ MCP` install (D-88-04)
- Disabled while streaming so user can't switch mid-run

### V32-MIGRATE-05 — Sidebar layout-shift listener
- `useEffect` on mount adds `window.addEventListener('liv-sidebar-toggled', …)`
- Event handler reads `detail.open: boolean` and toggles `threadShifted` state
- Top bar wrapper, MessageThread inner container, status card wrapper, composer container all use `transition-all duration-300` and conditional `max-w-3xl` ↔ `max-w-[calc(100%-480px-2rem)]` classes
- Composer container also receives `pr-[calc(480px+2rem)]` to leave room for the panel rail

## Decisions Realized

- **D-88-01 — Adapter layer**: `lib/sse-adapter.ts` houses 5 pure helpers (`sseSnapshotToV32`, `sseStateToChatMessages`, `sseSnapshotsToV32List`, `streamStatusToAgentStatus`, `isStreamActive`) that decouple P67-04 wire shapes from P81 presentation shapes. Field rename `done` → `complete`, `toolName` → `name`, `assistantCall.input` → `input`, `toolResult.output` → `output` (stringified if non-string), `completedAt` → `endedAt`.
- **D-88-02 — Single conversationId per mount**: `'v32-' + crypto.randomUUID()` generated once via `useState(makeConversationId)`. P85+ will replace with real conversation routing.
- **D-88-03 — currentStatus expiration**: cleared on terminal status only; backend explicitly emits new `status_detail` between turns so the field naturally turns over.
- **D-88-04 — Agent selector is presentational**: backend `/api/agent/start` (agent-runs.ts:253-254) does not yet accept an `agentId` body field. Selector tracks the choice locally so a follow-up plan can wire it without a UI churn.
- **D-88-05 — Auto-open guard**: `prevAutoOpenRef.current` tracks the previous `shouldAutoOpen()` return; only opens on `false → true`, preventing reopening after manual close.
- **D-88-06 — Layout-shift container**: top bar, message thread, status card, and composer all gated on `threadShifted` boolean toggled by `liv-sidebar-toggled` event detail.

## Constraints Verified

| Constraint | Status |
|-----------|--------|
| Sacred SHA `f3538e1d…` unchanged before AND after | PASS — `git hash-object` returned exact match both times |
| `liv/packages/core/` zero changes | PASS — only UI files touched |
| `routes/ai-chat/index.tsx` (legacy) zero changes | PASS — file untouched |
| `routes/ai-chat/v32/types.ts` zero changes | PASS — file untouched |
| `ToolCallPanel.tsx` zero changes | PASS — file untouched (P82 lane) |
| `views/` zero changes | PASS — directory untouched (P83 lane) |
| `mcp/` components zero changes | PASS — directory untouched (P84 lane) |
| tRPC router files zero changes | PASS — `agents-router.ts`, `marketplace-router.ts`, `mcp-router.ts` untouched |
| `useAgentSocket` legacy hook untouched | PASS — only v32 lane stops importing it; legacy `/ai-chat` still does |
| `grep -r "useAgentSocket" v32/` returns NOTHING | PASS — exit code 1, no output |
| `grep -r "useLivAgentStream" v32/index.tsx` returns >0 hits | PASS — 4 hits (import + call + 2 comments) |
| D-LIV-STYLED — only liv-* tokens / no kawaii | PASS — Tabler icons + liv-* tokens; spinner is CSS pulse-dots/wrench/hourglass |
| D-NO-NEW-DEPS | PASS — used existing zustand (transitive), framer-motion, @tabler/icons-react, sonner, shadcn Select/Slider |
| D-NO-KAWAII | PASS — phrase text + 3 phase-icon variants, zero ASCII/emoji faces |
| D-COEXISTENCE | PASS — legacy `/ai-chat` kept as-is, only `/ai-chat-v2` uses SSE |
| D-ADDITIVE-ONLY | PASS — `liv-agent-types.ts` and `use-liv-agent-stream.ts` only added fields; existing 6-branch behaviour tests pass unchanged |

## Verification Commands Run

```
git hash-object liv/packages/core/src/sdk-agent-runner.ts
# → f3538e1d811992b782a9bb057d1b7f0a0189f95f  (exit 0, before AND after)

pnpm --filter ui build
# → exit 0  (40.10s, 447 precache entries, no new chunk-size warnings)

pnpm --filter ui exec tsc --noEmit 2>&1 | grep -E "v32/|use-liv-agent-stream|liv-agent-types"
# → empty (zero errors in any P88-touched file)
# (pre-existing errors in cmdk.tsx, motion-primitives, ai-chat/agents-panel.tsx etc. unchanged)

pnpm --filter ui exec vitest run src/lib/use-liv-agent-stream.unit.test.tsx
# → 44/44 tests pass  (no regression on the extended applyChunk reducer)

grep -r "useAgentSocket" livos/packages/ui/src/routes/ai-chat/v32/
# → exit 1, no output  (legacy WS hook fully removed from v32 lane)

grep -rn "useLivAgentStream" livos/packages/ui/src/routes/ai-chat/v32/index.tsx
# → 4 hits (import + hook call + 2 doc-comment refs)
```

## API Surface for P89 / P90

```tsx
// useLivAgentStream now exposes currentStatus:
const {messages, snapshots, status, currentStatus, sendMessage, stop, runId, retry} =
	useLivAgentStream({conversationId})

// currentStatus is StatusDetailPayload | null:
//   { phase: 'thinking' | 'tool_use' | 'waiting'; phrase: string; elapsed: number }

// Adapter helpers (pure, no React deps):
import {
	sseSnapshotToV32,        // single snapshot conversion
	sseSnapshotsToV32List,   // sorted list (by startedAt)
	sseStateToChatMessages,  // full thread projection
	streamStatusToAgentStatus,
	isStreamActive,
} from './lib/sse-adapter'

// AgentSelector — control with `value` + `onChange`:
<AgentSelector
	value={selectedAgentId}
	onChange={(id, agent) => { /* … */ }}
	disabled={isStreaming}
/>

// StatusDetailCard — pass through the currentStatus payload:
<StatusDetailCard status={currentStatus} />
```

## Deviations from CONTEXT.md

None.

## Carryover for Future Plans

- **Backend `agentId` body field on POST /api/agent/start** — D-88-04 left this open. A small server change (additive optional input field on agent-runs.ts:253) plus a one-line patch to v32/index.tsx can flow `selectedAgentId` end-to-end. Natural slot is P90 cutover or a 90-pre patch.
- **Threading `batchId` through SSE wire shape** — backend `LivAgentRunner` already stamps `batchId` per P87, but the UI mirror `ToolCallSnapshot` (P67-04) does not include it. Future plan: add optional `batchId?: string` to `liv-agent-types.ts` and have `sseSnapshotToV32` thread it through to v32's `ToolCallSnapshot.batchId`. Until then, ToolCallPanel renders its batch-grouping ticks based on the `batchId` set client-side at sort time (currently undefined; ticks degrade gracefully).
- **Agent selector → composer "+ MCP" wiring** — P84 explicitly deferred this pending P88's agent selector. Now unblocked: the composer can read `selectedAgentId` (lifted via prop or a simple context) and pass it to `BrowseDialog` for install-to-agent.

## Commit SHA

(filled after commit)
