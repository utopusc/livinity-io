---
phase: 101
plan: 09
title: Chat Animations + Hermes Phrase Relay (Pillars E + F)
subsystem: ui/chat + livinityd/broker
tags: [ui, animation, accessibility, broker, hermes, sse, pillar-e, pillar-f]
status: complete
completed: 2026-05-11
requirements: [D-101-CHAT-ANIMS, D-101-SACRED]
depends_on: []
wave: 3
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
dependency_graph:
  requires:
    - "100-10-10 (chat-WS scaffolding, agentStatus.phrase forward-compat slot)"
    - "101-06 (agent-runner-factory.ts Pillar C — extended Wave 2 in place)"
  provides:
    - "Pillar E chat animations (thinking-dots, idle-pulse) for webapp-floating-action-bar.tsx ChatInputBar"
    - "@keyframes idleBreath + .chat-input-idle utility + prefers-reduced-motion override (CSS)"
    - "AgentBrokerEvent type — local widening of @liv/core AgentEvent to include status_detail"
    - "Hermes status_detail SSE relay through livinity-broker/agent-runner-factory.ts"
    - "chatStatus.status phrase surface in ai/index.ts chatStream HTTP-SSE forwarder"
  affects:
    - "Future plan: livinityd /ws/agent → AgentSessionManager (in liv-core, separate hop) currently does NOT relay status_detail; that gap stays open and is documented inline."
tech-stack:
  added: []
  patterns:
    - "Tailwind motion-reduce: variant + @media (prefers-reduced-motion: reduce) backstop (a11y)"
    - "Type widening via local discriminated-union extension (AgentBrokerEvent = AgentEvent | AgentStatusDetailEvent) — avoids modifying sacred-adjacent @liv/core types"
    - "Source-text invariant tests (readFileSync + regex match, D-NO-NEW-DEPS pattern from 95-04 / 100-10)"
key-files:
  created:
    - livos/packages/ui/src/modules/window/webapp-floating-action-bar.test.tsx
  modified:
    - livos/packages/ui/src/modules/window/webapp-floating-action-bar.tsx
    - livos/packages/ui/src/index.css
    - livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts
    - livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.test.ts
    - livos/packages/livinityd/source/modules/ai/index.ts
    - livos/packages/ui/src/modules/window/app-contents/webapp-chat-bottom-bar.tsx
decisions:
  - "Derive thinking-dots gating from `lastAssistantHasContent` (computed via useMemo over agent.messages) instead of adding a new `lastSentCount` field to useWebAppAgent — same predicate, narrower surface."
  - "Use Tailwind motion-reduce: variant ON THE OUTER WRAPPER via `motion-reduce:[&_*]:!animate-none` so every descendant animation (thinking-dots, streaming caret, idle-pulse) is short-circuited under prefers-reduced-motion. CSS @media rule in index.css backstops .chat-input-idle and .animate-pulse for defense-in-depth."
  - "Widen AgentEvent locally via `AgentBrokerEvent` union instead of modifying liv-core. Honors sacred-adjacency: the @liv/core tree is left untouched even though sdk-agent-runner.ts is the only strict sacred file."
  - "Surface Hermes phrase into `chatStatus.status` in ai/index.ts so HTTP-SSE consumers reading via getChatStatus() see the live verb. The WS path (AgentSessionManager → liv-core agent-session.ts) is a separate hop, was NOT modified per orchestrator scope, and remains an open gap documented inline."
metrics:
  duration_minutes: 60
  task_count: 5
  file_count: 7
  commit_count: 5
---

# Phase 101 Plan 09: Chat Animations + Hermes Phrase Relay Summary

Pillar E (D-101-CHAT-ANIMS) chat animations + Pillar F (Hermes status_detail) relay shipped in one plan because both surfaces touch the same chat UI and are file-disjoint from every other Wave-3 plan.

## What Changed

### Pillar E — Chat animations in `ChatInputBar`

The single-pulse-dot block at the bottom of `webapp-floating-action-bar.tsx` `ChatInputBar` (lines 446-457 pre-change) gained three new behaviors. The original 100-10-10 phrase/currentTool status sub-line is preserved unchanged.

#### Before (single-dot, no idle pulse, no a11y variant)

```tsx
<div className='inline-flex flex-col items-center gap-1.5'>
  <div className='flex items-center gap-2 rounded-full bg-white/95 ...'>
    <input
      type='text'
      value={input}
      onChange={(e) => setInput(e.target.value)}
      ...
    />
    {/* Send + Close buttons */}
  </div>
  {agent.isStreaming && (agent.agentStatus?.phrase || agent.agentStatus?.currentTool) ? (
    <div className='text-caption-xs text-text-tertiary flex items-center gap-1.5'>
      <span className='inline-block w-1 h-1 rounded-full bg-text-tertiary animate-pulse' aria-hidden='true' />
      <span>{agent.agentStatus.phrase ?? `Using ${agent.agentStatus.currentTool}…`}</span>
    </div>
  ) : null}
</div>
```

#### After (3 staggered dots, idle pulse, motion-reduce wrapper)

```tsx
<div className='inline-flex flex-col items-center gap-1.5 motion-reduce:[&_*]:!animate-none'>
  <div
    className={cn(
      'flex items-center gap-2 rounded-full bg-white/95 ...',
      idlePulseActive && 'chat-input-idle motion-reduce:animate-none',
    )}
  >
    <input
      ref={inputRef}
      type='text'
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      ...
    />
    {/* Send + Close buttons */}
  </div>
  {showThinkingDots ? (
    <div className='text-caption-xs text-text-tertiary flex items-center gap-1.5'
         aria-label='thinking-dots' aria-live='polite'>
      <span className='inline-flex gap-1' aria-hidden='true'>
        <span className='w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse [animation-delay:0ms]' />
        <span className='w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse [animation-delay:150ms]' />
        <span className='w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse [animation-delay:300ms]' />
      </span>
    </div>
  ) : null}
  {/* original phrase/currentTool sub-line preserved verbatim */}
</div>
```

**Gating predicates** (all derived in the component body via `useState` + `useMemo`):

- `showThinkingDots = agent.isStreaming && !lastAssistantHasContent`
  - `lastAssistantHasContent` walks `agent.messages` from the tail; the dots vanish as soon as the first text delta arrives.
- `idlePulseActive = !isFocused && input.length === 0 && !agent.isStreaming`
  - Local `isFocused` state tracks `onFocus` / `onBlur` events on the `<input>`.

### Pillar E — `index.css` keyframes

Appended at line 332-365 (right before the `Permanent Marker` font-face block):

```css
@keyframes idleBreath {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.8; }
}
.chat-input-idle {
  animation: idleBreath 4s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .chat-input-idle {
    animation: none !important;
  }
  .animate-pulse {
    animation: none !important;
  }
}
```

Q5 RESOLVED — accessibility respects the OS-level setting only, no per-user Settings toggle.

### Pillar F — `agent-runner-factory.ts` (status_detail relay)

The `@liv/core` `AgentEvent.type` union is closed and lives in a sacred-adjacent file. To re-yield `status_detail` chunks (V32-HERMES-01 — emitted by liv-core RunStore in `liv-agent-runner.ts` per `run-store.ts` chunk type) without modifying the core type, the broker now widens its yielded shape via a local discriminated union:

```ts
export interface AgentStatusDetailEvent {
  type: 'status_detail'
  turn?: number
  data: {
    phase: 'thinking' | 'tool_use' | 'responding' | 'idle' | string
    phrase: string
    elapsed: number
  }
}
export type AgentBrokerEvent = AgentEvent | AgentStatusDetailEvent
```

The function signature changed from `AsyncGenerator<AgentEvent, AgentResult, void>` to `AsyncGenerator<AgentBrokerEvent, AgentResult, void>`. The SSE parse loop now has an explicit `else if (event.type === 'status_detail')` branch that yields the event verbatim (preserving `{phase, phrase, elapsed}` payload). The `done`-event terminator path is unchanged; existing event types still pass through via the trailing `else { yield event }`.

### Pillar F — `ai/index.ts` (chatStream HTTP-SSE forwarder)

`LivStreamEventData` widened with optional `phase`, `phrase`, `elapsed` fields. New `status_detail` handler block surfaces the human-readable phrase into `chatStatus.status` so HTTP-SSE consumers reading via `getChatStatus()` see the live Hermes verb ("inspecting", "calling", "reasoning", …). The existing `onEvent` callback forwards the chunk verbatim to downstream bridge layers.

```ts
if (event.type === 'status_detail' && isEventData(event.data)) {
  const prev = this.chatStatus.get(conversationId)
  const phrase = event.data.phrase
  if (typeof phrase === 'string' && phrase.length > 0) {
    this.chatStatus.set(conversationId, {
      ...prev,
      status: phrase,
      steps: prev?.steps ?? [],
      commands: prev?.commands ?? [],
      turn: event.turn,
    })
  }
}
```

### `webapp-chat-bottom-bar.tsx` (DEPRECATED file — comment-only)

Per PATTERNS.md risk note #1: this file is DEPRECATED 2026-05-10 (P100-09-08) and has no consumers. A 3-line forward-pointer comment was inserted right under the existing DEPRECATED header pointing readers to `webapp-floating-action-bar.tsx`. No production behavior change. `git diff --stat` shows 3 insertions only.

## Tests Added

| File | Tests | Pattern |
|---|---|---|
| `webapp-floating-action-bar.test.tsx` | 9 source-text invariants | NEW file. `readFileSync` + regex match (D-NO-NEW-DEPS, same as 95-04 / 100-10 unit tests). |
| `agent-runner-factory.test.ts` | 4 new tests (extending the existing 7 from 101-06 — total 11) | Custom `captureWithScript` SSE stub enqueues arbitrary chunk types + drains the async generator + collects yielded events for assertion. |

Test counts:
- `webapp-floating-action-bar.test.tsx`: 9 cases — 3 thinking-dot, 1 thinking-dot gating, 1 visual shape, 1 chat-input-idle class, 1 gating predicates, 1 motion-reduce variant, 1 100-10-10 status line preservation, 1 deprecation enforcement, 1 sacred-SHA marker.
- `agent-runner-factory.test.ts`: 4 new — verbatim relay, tool-dispatch verb relay, mixed-chunk preservation, forward-compat unknown-type pass-through.

## Sacred SHA Confirmation

`git hash-object liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — both pre- and post-execution.

`git diff --name-only 7c12e260bc2d0dd43fc015672d8ce4992cef1e17 HEAD | grep sdk-agent-runner` returns NOTHING — the sacred file is absent from this plan's diff.

## Deviations from Plan

**None.** Plan executed exactly as written.

The plan acknowledged that the chat-WS path (livinityd `/ws/agent` → liv-core `AgentSessionManager` → SDK `query()`) does NOT currently relay status_detail chunks because `agent-session.ts` in liv-core uses the Claude SDK directly, not the RunStore. This plan ONLY closes the SSE / HTTP-broker hop (livinity-broker + ai/index.ts chatStream). A future plan that teaches `liv-core/agent-session.ts` to forward RunStore status_detail (or migrates the chat-WS to use LivAgentRunner instead of SDK `query()`) will complete the end-to-end flow. The UI is forward-compatible: `agentStatus.phrase` is already an optional field, and `webapp-floating-action-bar.tsx` already renders `phrase ?? \`Using ${currentTool}…\`` — so the moment the WS path lights up, the verb shows in the per-tool status sub-line with zero UI changes.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or trust-boundary schema changes.

## Files

| Path | Change | Lines added/modified |
|---|---|---|
| `livos/packages/ui/src/modules/window/webapp-floating-action-bar.tsx` | MODIFIED | +95 / -4 |
| `livos/packages/ui/src/modules/window/webapp-floating-action-bar.test.tsx` | NEW | +116 |
| `livos/packages/ui/src/index.css` | MODIFIED | +32 |
| `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` | MODIFIED | +58 / -1 |
| `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.test.ts` | MODIFIED | +167 |
| `livos/packages/livinityd/source/modules/ai/index.ts` | MODIFIED | +38 |
| `livos/packages/ui/src/modules/window/app-contents/webapp-chat-bottom-bar.tsx` | DOCS | +3 |

## Commits

| Hash | Message |
|---|---|
| `8bb161c0` | test(101-09): add failing tests for chat thinking-dots + idle-pulse |
| `6cd296e8` | feat(101-09): chat thinking-dots + idle-pulse animations in ChatInputBar |
| `96e761a3` | feat(101-09): @keyframes idleBreath + chat-input-idle utility + reduced-motion |
| `69d55542` | feat(101-09): Hermes status_detail relay through broker SSE pass-through |
| `89ac8ffe` | docs(101-09): reaffirm webapp-chat-bottom-bar DEPRECATED status |

## Self-Check: PASSED

- All 5 expected commits present (`git log --oneline 7c12e260..HEAD`)
- All 7 modified/created files exist on disk
- Sacred SHA matches: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- `sdk-agent-runner.ts` absent from diff vs. base
- grep verifies: `animation-delay:0ms`, `animation-delay:150ms`, `animation-delay:300ms`, `chat-input-idle`, `motion-reduce`, `idleBreath`, `prefers-reduced-motion: reduce`, `status_detail` (10× in agent-runner-factory.ts, 6× in ai/index.ts, 16× in test file)
- PATTERNS risk #1 enforced: deprecated `webapp-chat-bottom-bar.tsx` has 3-line forward-pointer comment, no production change
- PATTERNS risk #2 enforced: relay extends `agent-runner-factory.ts` + `ai/index.ts` (NOT a fictional `agent-session.ts` in livinityd)
- Q5 RESOLVED: `motion-reduce:` Tailwind variant + `@media (prefers-reduced-motion: reduce)` CSS backstop both present
