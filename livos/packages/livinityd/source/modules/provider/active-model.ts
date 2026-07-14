/**
 * Phase 316-05 (LLM-02) — explicit active-model selection + revert-to-Claude.
 *
 * Implements the fail-safe DECISION locked by 316-01: Ollama becomes Liv's
 * provider ONLY as the direct effect of an explicit "Use as Liv model" action,
 * and an explicit "Revert to Claude" tears that down completely. Listing or
 * pulling models (plan 316-04) never runs any of this, so the presence of the
 * Ollama provider key is ALWAYS the trace of a deliberate user selection —
 * Claude stays the default until the user acts, regardless of gateway
 * internals. This is the fail-safe property that makes openclaw's (unverifiable)
 * default-provider behaviour non-blocking.
 *
 * Three moving parts:
 *   - `liv:provider:active_model` — a NEW Redis flag, this module's only owned
 *     state. Written by selection, cleared by revert, read by the UI to show
 *     which model (if any) is Liv's provider. It is deliberately DISTINCT from
 *     the structurally separate Mastra provider-selection system (a different
 *     Redis key, never reused here — see 316-01 DECISION RULE 3).
 *   - The reused provider-config set/delete surface — the already-shipped
 *     mutation that persists the provider key, regenerates the gateway env
 *     file, and restarts the gateway. This module delegates through the
 *     injected `providerConfig` interface; it NEVER writes the gateway env
 *     file itself and never names a gateway env var.
 *   - A fixed honest sentinel — Ollama's loopback daemon needs no real
 *     credential, so selection writes a stable placeholder that satisfies the
 *     provider-key writer's shape gate (never a fabricated secret).
 *
 * Import boundary: this module imports NOTHING. It defines its own narrow Redis
 * + provider-config surfaces, so it touches neither the sacred broker package
 * nor the Mastra runtime tree — proven statically by
 * scripts/verify-llm02-boundary.cjs.
 */

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * The LLM-02 active-model flag. Set on an explicit selection, cleared on an
 * explicit revert, read by the Local Models UI. Distinct from the unrelated
 * Mastra runtime's provider-selection key by design (316-01 RULE 3).
 */
export const ACTIVE_MODEL_KEY = 'liv:provider:active_model'

/**
 * Fixed honest placeholder written to the Ollama provider slot on selection.
 * Ollama's loopback daemon needs no real credential; this value exists only to
 * satisfy the provider-key writer's shape gate
 * (KEY_SHAPE_REGEX = /^[A-Za-z0-9_\-.]{8,500}$/) and to make the slot's
 * presence a truthful "the user selected Ollama" signal — NOT a fabricated
 * secret (316-01 threat T-316-17).
 */
export const OLLAMA_SENTINEL = 'ollama-local-runtime'

// ── Injected surfaces ────────────────────────────────────────────────────────

/** Narrow Redis surface — get/set/del over the single flag key. */
export interface ActiveModelRedis {
	get(key: string): Promise<string | null>
	set(key: string, value: string): Promise<unknown>
	del(key: string): Promise<unknown>
}

/**
 * The reused provider-config mutation surface. In production this is backed by
 * the already-shipped key-store → writer → restart-hook composition (the same
 * effects the provider config set/delete tRPC routes run). This module only
 * ever calls set/delete against the `ollama` slot — it does not know or care
 * how the gateway env file is written.
 */
export interface ProviderConfigMutator {
	set(provider: 'ollama', key: string): Promise<unknown>
	delete(provider: 'ollama'): Promise<unknown>
}

export interface ActiveModelLogger {
	info(msg: string): void
	warn(msg: string, err?: unknown): void
}

export interface ActiveModelDeps {
	redis: ActiveModelRedis
	providerConfig: ProviderConfigMutator
	logger?: ActiveModelLogger
}

// ── Flag primitives ──────────────────────────────────────────────────────────

/** Record an explicit model selection in the active-model flag. */
export async function setActiveModel(redis: ActiveModelRedis, modelName: string): Promise<void> {
	await redis.set(ACTIVE_MODEL_KEY, modelName)
}

/** Read the currently selected model (null when unset). Drives the UI state. */
export async function getActiveModel(redis: ActiveModelRedis): Promise<string | null> {
	return redis.get(ACTIVE_MODEL_KEY)
}

/** Clear the active-model flag — no model is Liv's provider. */
export async function clearActiveModel(redis: ActiveModelRedis): Promise<void> {
	await redis.del(ACTIVE_MODEL_KEY)
}

// ── Orchestration ────────────────────────────────────────────────────────────

/**
 * Explicit "Use as Liv model". The ONLY code path in the phase that writes the
 * Ollama provider key: it composes the reused provider-config set mutation
 * (which persists the sentinel + regenerates the gateway env file + restarts
 * the gateway) with the active-model flag write. One deliberate act writes
 * BOTH. Idempotent — re-selecting re-writes both sides cleanly.
 */
export async function selectOllamaModel(deps: ActiveModelDeps, modelName: string): Promise<void> {
	await deps.providerConfig.set('ollama', OLLAMA_SENTINEL)
	await setActiveModel(deps.redis, modelName)
	deps.logger?.info(`[active-model] selected Ollama model '${modelName}' as Liv's provider`)
}

/**
 * Explicit "Revert to Claude". Full teardown, zero residual state (RESEARCH
 * Test 2 step 4): deletes the Ollama provider config (the writer regenerates
 * the gateway env file without it) AND clears the active-model flag. Safe to
 * call even when nothing was ever selected (idempotent).
 */
export async function revertToClaude(deps: ActiveModelDeps): Promise<void> {
	await deps.providerConfig.delete('ollama')
	await clearActiveModel(deps.redis)
	deps.logger?.info(
		'[active-model] reverted to Claude (Ollama provider config + active-model flag cleared)',
	)
}
