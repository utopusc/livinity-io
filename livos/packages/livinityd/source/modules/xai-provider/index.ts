/**
 * Phase 195 Plan 05 — xai-provider barrel.
 *
 * Public surface consumed by:
 *   - Phase 196 LangGraph agent → createXaiClient(credsService).chatCompletions(...)
 *   - Phase 197 lean Livinity broker → createXaiClient(credsService) for all upstream xAI traffic
 *
 * NOT in this phase: LangGraph integration, broker rewrite, MCP tool dispatch
 * wiring. Those are downstream consumers (see 195-CONTEXT.md `<deferred>`).
 */

export {createXaiClient} from './xai-client.js'
export type {XaiClientLogger, XaiClientOpts} from './xai-client.js'

export {
	XaiNotConnectedError,
	XaiUnauthorizedError,
	XaiVoiceNotSupportedError,
	XaiRateLimitedError,
	XaiModelNotFoundError,
	XaiNetworkError,
} from './errors.js'

export type {
	XaiChatMessage,
	XaiToolDef,
	XaiToolChoice,
	XaiChatRequest,
	XaiChatChoice,
	XaiChatResponse,
	XaiModelInfo,
	XaiModelListResponse,
	XaiImageRequest,
	XaiImageResponse,
	XaiVideoRequest,
	XaiVideoResponse,
	XaiClient,
} from './types.js'
