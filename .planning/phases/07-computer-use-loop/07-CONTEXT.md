# Phase 7: Computer Use Loop - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable the Nexus AI to autonomously operate a device's desktop through a screenshot-vision-action loop. User says "Open Chrome and go to YouTube" → AI takes screenshot, analyzes it with multimodal vision, determines coordinates, executes mouse/keyboard action, repeats until task complete.

Key insight: The Nexus architecture ALREADY supports this — messages carry images, tool results return base64, normalization converts to image_url format. This is primarily:
1. Enable vision flag in KimiProvider
2. Add computer use system prompt guidance
3. Add step limits and completion detection
4. Ensure tool result images flow correctly to LLM

</domain>

<decisions>
## Implementation Decisions

### Vision Enablement
- Set `supportsVision = true` in KimiProvider (kimi.ts line 292)
- Verify that tool result images are passed through to LLM in agent loop message construction
- The existing `normalizeMessages()` → `prepareForProvider()` → `image_url` pipeline handles this

### Computer Use System Prompt
- Add computer use guidance to NATIVE_SYSTEM_PROMPT or inject it when computer use tools are available
- Guidance: "Take a screenshot first to understand screen state", "Extract coordinates from visual analysis", "Use mouse/keyboard tools based on coordinates", "Take another screenshot to verify your action worked"
- The prompt should teach the screenshot→analyze→act→verify loop

### Step Limits and Session Management
- Configurable max steps per computer use session (default: 50)
- Step counter tracks screenshot→action iterations
- When limit reached: stop gracefully, report what was accomplished
- No separate "computer use mode" toggle — AI naturally enters the loop when device tools are available and task requires visual interaction

### Task Completion Detection
- AI determines task completion through visual analysis (screenshot shows expected state)
- AI reports back with reasoning: "Task complete — I can see YouTube is open" or "Unable to complete — Chrome not found on desktop"
- No external completion oracle — AI uses its own judgment

### Claude's Discretion
- Exact system prompt wording for computer use guidance
- How to structure the step limit (per-tool-call or per-screenshot-cycle)
- Whether to add a dedicated `computer_use` tool that wraps the loop, or let the AI call tools individually
- Error handling when vision analysis fails or coordinates are wrong

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `nexus/packages/core/src/agent.ts` — AgentLoop class with run() method, already iterates tool calls
- `nexus/packages/core/src/providers/kimi.ts` — KimiProvider, just needs supportsVision=true
- `nexus/packages/core/src/providers/normalize.ts` — normalizeMessages() already handles images
- `nexus/packages/core/src/brain.ts` — ChatMessage interface has images field
- `nexus/packages/core/src/types.ts` — ToolResult has images array

### Established Patterns
- Tool results with images: `{ success, output, images: [{ base64, mimeType }] }`
- Agent loop: calls brain.chatStream() → collects tool_use → executes → builds tool_result → loop
- System prompt: NATIVE_SYSTEM_PROMPT in agent.ts lists available tools and guides behavior
- SSE streaming: agent events → SSE data frames to client

### Integration Points
- `kimi.ts` line 292: `supportsVision = false` → change to `true`
- `agent.ts` NATIVE_SYSTEM_PROMPT: add computer use guidance section
- `agent.ts` run() method: may need step limit counter for computer use iterations
- `api.ts` POST /api/agent/stream: may need max_turns override for computer use tasks
- DeviceBridge proxy tools: already registered as device_{deviceId}_{toolName}

### Key Message Flow (already working)
1. AI calls device_{id}_screenshot → DeviceBridge → agent → returns ToolResult with images
2. Agent loop adds images to message history as ChatMessage with images array
3. normalizeMessages() → prepareForProvider() converts to image_url content blocks
4. Kimi receives image + text, analyzes screen, calls next tool
5. Loop continues automatically

</code_context>

<specifics>
## Specific Ideas

- The AI should be instructed to ALWAYS screenshot first before any mouse/keyboard action on a new task
- After each action, take another screenshot to verify the action worked
- If the AI can't find a UI element after 3 screenshots, it should report failure rather than clicking randomly
- Step limit should be generous (50) since complex tasks need many actions

</specifics>

<deferred>
## Deferred Ideas

- Live screenshot streaming to LivOS UI (Phase 8)
- User consent dialog before AI takes control (Phase 9)
- Emergency stop hotkey (Phase 9)
- Per-action audit logging (Phase 9)

</deferred>
