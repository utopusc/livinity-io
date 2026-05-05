// Phase 71 — Computer Use Tasks repository (CU-FOUND-06)
export * from './task-repository.js'

// Phase 72-01 — Bytebot tool schemas (CU-LOOP-01). Verbatim Apache 2.0
// copy from upstream Bytebot agent.tools.ts. See bytebot-tools.ts header
// for source URL + snapshot date + license attribution.
export {
	BYTEBOT_TOOLS,
	BYTEBOT_TOOL_NAMES,
	isBytebotToolName,
} from './bytebot-tools.js'
export type {AnthropicTool, BytebotToolName} from './bytebot-tools.js'

// Phase 72-02 — Bytebot system prompt (CU-LOOP-03). Verbatim Apache 2.0
// copy from upstream Bytebot agent.constants.ts with 3 narrow D-12 edits
// (You are Liv / 1280x960 / NEEDS_HELP+COMPLETED retained). See
// bytebot-system-prompt.ts header for source URL + snapshot date + diff.
export {
	BYTEBOT_SYSTEM_PROMPT,
	injectComputerUseSystemPrompt,
} from './bytebot-system-prompt.js'
