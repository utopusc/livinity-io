# Phase 3: AI Prompt Optimization & Hybrid Mode - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Update the AI system prompt and agent loop behavior to prefer accessibility tree element coordinates over screenshot pixel analysis. Implement hybrid mode where AI calls screen_elements first and falls back to screenshots. Add screenshot caching to skip re-capture when the accessibility tree hasn't changed.

</domain>

<decisions>
## Implementation Decisions

### Accessibility-First Prompt Strategy
- AI calls screen_elements first every time before any mouse action; uses screenshot only if no matching element found or for visual context
- Skip screenshot for pure click tasks when screen_elements returns matching elements; take screenshot only when task requires visual context (e.g., "what color is the button?")
- Instruct AI: "When screen_elements returns an element matching your target, use mouse_click with raw:true and the element's (cx,cy) coordinates directly"

### Screenshot Caching & Tree Change Detection
- Hash the element list text to detect changes; if hash matches previous call, tree is unchanged
- When tree unchanged, skip screenshot capture only — still let AI see cached element list
- Cache state stored as instance variables on AgentCore: `lastElementHash`, `lastScreenshotBase64`, `lastScreenshotTime`

### Claude's Discretion
- Exact prompt wording for the accessibility-first instructions
- How to handle the hybrid fallback gracefully in the prompt
- Whether to add a `cached: true` flag to screenshot responses when returning cached data

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `nexus/packages/core/src/agent.ts` lines 256-282: Current AI system prompt "Computer Use" section — needs major rewrite
- `agent-app/src/main/agent-core.ts`: toolScreenshot() (Phase 1), toolScreenElements() (Phase 2), all mouse tools with raw flag
- Phase 2 screen_elements returns pipe-delimited text with header line

### Established Patterns
- AI system prompt sections: ## Computer Use, ### The Screenshot-Analyze-Act-Verify Loop, ### Coordinate System, ### Important Guidelines
- Agent loop in nexus/packages/core/src/agent.ts handles tool calls, screenshot passthrough, computer use step counting

### Integration Points
- AI system prompt in agent.ts — rewrite Computer Use section for accessibility-first flow
- toolScreenshot() — add caching logic (store hash, return cached image)
- toolScreenElements() — compute hash of response for caching comparison
- Agent loop — no changes needed (tool dispatch is already generic)

</code_context>

<specifics>
## Specific Ideas

**New AI Prompt Flow:**
1. Call screen_elements to see available interactive elements
2. If target element found in list → use mouse_click with raw:true and element coords
3. If target NOT found → take screenshot, analyze visually, click with regular coordinates
4. After action → call screen_elements again to verify state changed

**Hash-based Caching:**
- `toolScreenElements()` computes SHA-256 hash of the pipe-delimited element list
- Stores as `this.lastElementHash`
- `toolScreenshot()` checks: if `lastElementHash === currentElementHash` and screenshot taken within last call, return cached screenshot
- On new screen_elements call with different hash, invalidate cache

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
