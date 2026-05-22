/**
 * Phase 195 Plan 05 Task 1 — TypeScript interfaces for xAI request/response.
 *
 * These are a strict SUBSET of OpenAI-compatible shapes — only what
 * `createXaiClient` and Phase 196+ consumers actually use. We intentionally
 * do NOT model the full OpenAI surface to keep the type surface auditable.
 *
 * Streaming chat is NOT exposed here — Phase 195 ships only `stream: false`
 * shapes. Streaming hook is deferred to a future plan per CONTEXT.md
 * `<deferred>` block.
 */

// ─── Chat completion ─────────────────────────────────────────────────────────

export interface XaiChatMessage {
	role: 'system' | 'user' | 'assistant' | 'tool'
	content: string | Array<{type: string; [k: string]: unknown}>
	tool_calls?: Array<{
		id: string
		type: 'function'
		function: {name: string; arguments: string}
	}>
	tool_call_id?: string
	name?: string
}

export interface XaiToolDef {
	type: 'function'
	function: {
		name: string
		description?: string
		parameters: object
	}
}

export type XaiToolChoice =
	| 'auto'
	| 'none'
	| {type: 'function'; function: {name: string}}

export interface XaiChatRequest {
	/** e.g. 'grok-4.20-fast' (verified accessible 2026-05-22 per CONTEXT.md). */
	model: string
	messages: XaiChatMessage[]
	tools?: XaiToolDef[]
	tool_choice?: XaiToolChoice
	temperature?: number
	max_tokens?: number
	/** Streaming is OUT-OF-SCOPE for Phase 195 — Phase 196+ ships streaming hook. */
	stream?: false
}

export interface XaiChatChoice {
	index: number
	message: XaiChatMessage
	finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter'
}

export interface XaiChatResponse {
	id: string
	model: string
	choices: XaiChatChoice[]
	usage?: {
		prompt_tokens: number
		completion_tokens: number
		total_tokens: number
	}
}

// ─── Models listing ──────────────────────────────────────────────────────────

export interface XaiModelInfo {
	id: string
	object: 'model'
	created?: number
	owned_by?: string
}

export interface XaiModelListResponse {
	object: 'list'
	data: XaiModelInfo[]
}

// ─── Image generation ────────────────────────────────────────────────────────

export interface XaiImageRequest {
	model: string
	prompt: string
	n?: number
	size?: string
	response_format?: 'url' | 'b64_json'
}

export interface XaiImageResponse {
	created: number
	data: Array<{url?: string; b64_json?: string; revised_prompt?: string}>
}

// ─── Video generation ────────────────────────────────────────────────────────

export interface XaiVideoRequest {
	model: string
	prompt: string
	duration?: number
	resolution?: string
}

export interface XaiVideoResponse {
	created: number
	data: Array<{url?: string; b64_json?: string}>
}

// ─── Client surface ──────────────────────────────────────────────────────────

export interface XaiClient {
	/** Chat completions — OpenAI-compatible, non-streaming. */
	chatCompletions(req: XaiChatRequest): Promise<XaiChatResponse>
	/** List accessible models for the current credentials. */
	models(): Promise<XaiModelListResponse>
	/** Image generation (Grok Imagine — verified accessible 2026-05-22). */
	imageGenerate(req: XaiImageRequest): Promise<XaiImageResponse>
	/** Video generation (Grok Imagine Video — verified accessible 2026-05-22). */
	videoGenerate(req: XaiVideoRequest): Promise<XaiVideoResponse>
	/**
	 * Audio speech — ALWAYS throws XaiVoiceNotSupportedError.
	 * Documented absence: xAI tier 1 returns 403 on /v1/audio/speech (verified 2026-05-22).
	 */
	audioSpeech(req: unknown): Promise<never>
	/**
	 * Audio transcriptions — ALWAYS throws XaiVoiceNotSupportedError.
	 * Documented absence: xAI tier 1 returns 404 on /v1/audio/transcriptions (verified 2026-05-22).
	 */
	audioTranscriptions(req: unknown): Promise<never>
}
