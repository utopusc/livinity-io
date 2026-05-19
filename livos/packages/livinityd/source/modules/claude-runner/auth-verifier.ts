// Phase 162-03 — SDK subscription-path auth verifier (master plan D-V34-J).
//
// At livinityd boot (after vault scaffolder, see Phase 162-01), this module
// runs a minimal `query()` smoke check to validate that the SDK subprocess
// can locate the Anthropic Max subscription credentials and complete a
// minimal round-trip. The result is written to Redis key
// `liv:config:cc_auth_status` for the Settings UI (Phase 165 — pending) to
// surface as a green / red badge.
//
// Why this matters (per reference_anthropic_subscription_state):
//   The Mini PC has TWO `/.claude/.credentials.json` files for the same Max
//   account; ONLY the /root copy works. The SDK subprocess MUST inherit
//   HOME=/root so it reads `/root/.claude/.credentials.json`. If the env
//   propagation regresses (or the creds drift), the first real user chat
//   would silently fail. This boot-time probe lights it up immediately.
//
// Hard guardrails:
//   - feedback_subscription_only — no BYOK key env propagated anywhere
//   - Sacred SHA + D-09 untouched
//   - D-NO-NEW-DEPS — `@anthropic-ai/claude-agent-sdk` is already a direct
//     dep of livinityd (see livinityd/package.json) and a transitive dep of
//     @liv/core via sdk-agent-runner.ts. Type resolution works directly.
//   - Non-blocking contract — the verifier returns a discriminator instead
//     of throwing. The livinityd boot wire-up calls this with a defensive
//     `.catch()` and NO `await`, so boot continues even if this stalls or
//     fails.

import type {Redis} from 'ioredis'

/**
 * Cheapest model for the smoke check. Haiku 4.5 family is fast and cheap;
 * we don't need response quality here, just an `init` event indicating the
 * subprocess started up and authenticated against the Anthropic API.
 *
 * Note: this is the UNDATED alias. Phase 161 uses the DATED literal
 * `claude-haiku-4-5-20251001` for the computer-use chat path; that literal
 * is locked by a source-text test and must NOT be changed. THIS file is
 * a different concern (smoke probe, not a chat session), so the undated
 * alias is appropriate here — it follows whatever Haiku the broker has
 * configured as latest.
 */
const DEFAULT_MODEL = 'claude-haiku-4-5'

const DEFAULT_VAULT_PATH = '/home/bruce/livinity-vault'

const REDIS_STATUS_KEY = 'liv:config:cc_auth_status'

/**
 * Options accepted by smokeAuthCheck.
 *
 * The `queryImpl` field is reserved for tests — when set, this function
 * uses the injected stub instead of dynamically importing the real SDK.
 * Production callers should leave it undefined.
 */
export interface AuthVerifierOptions {
	/**
	 * Optional Redis client. When provided, the status (`'ok'` or
	 * `'failed: <reason>'`) is written to `liv:config:cc_auth_status`.
	 * A Redis failure during the write is logged but does NOT escalate
	 * — the function still returns the original AuthVerifierResult.
	 */
	redis?: Pick<Redis, 'set'>
	/**
	 * Working directory for the SDK subprocess. Defaults to
	 * `/home/bruce/livinity-vault` (Phase 162-01 vault path).
	 */
	vaultPath?: string
	/**
	 * Model to use for the probe. Defaults to `claude-haiku-4-5` (the
	 * cheapest tier — we only need an `init` event, not response quality).
	 */
	model?: string
	/**
	 * Optional logger. When provided, success and failure are logged via
	 * `log()` / `error()` respectively. Production callers pass a journal
	 * logger; tests pass a stub.
	 */
	logger?: {
		log: (msg: string) => void
		error: (msg: string, err?: unknown) => void
	}
	/**
	 * Tests-only injection point. Mirrors the SDK `query()` signature: takes
	 * `{prompt, options}` and returns an `AsyncIterable<unknown>`. When
	 * undefined, the function dynamically imports the real SDK.
	 */
	queryImpl?: (opts: {prompt: string; options: SdkQueryOptions}) => AsyncIterable<unknown>
}

/**
 * Result discriminator. Returned by smokeAuthCheck without throwing — the
 * non-fatal contract means callers can always trust this shape.
 */
export type AuthVerifierResult =
	| {ok: true; model: string}
	| {ok: false; err: string}

/**
 * Subset of the SDK query() options we set here. Typed loosely to avoid a
 * compile-time coupling to the SDK's exported option type (which would
 * also be a non-issue since `@anthropic-ai/claude-agent-sdk` IS a direct
 * dep of livinityd, but loose typing keeps the test injection ergonomic).
 */
interface SdkQueryOptions {
	cwd: string
	settingSources: ['project']
	maxTurns: number
	maxBudgetUsd: number
	model: string
	permissionMode: 'dontAsk'
	persistSession: false
	env: Record<string, string | undefined>
}

/**
 * Run a minimal SDK query() round-trip to verify subscription-path auth.
 *
 * Side effects (gated on opts):
 *   - Redis: `set(liv:config:cc_auth_status, 'ok' | 'failed: <reason>')`
 *   - Logger: `log('smoke check passed model=<model>')` on success,
 *     `error('smoke check failed: <err>')` on failure.
 *
 * Never throws — all errors flow into the AuthVerifierResult discriminator.
 */
export async function smokeAuthCheck(
	opts: AuthVerifierOptions = {},
): Promise<AuthVerifierResult> {
	const vaultPath = opts.vaultPath ?? DEFAULT_VAULT_PATH
	const model = opts.model ?? DEFAULT_MODEL

	// Subscription-path env contract: HOME=/root so the spawned SDK process
	// reads /root/.claude/.credentials.json (per reference_anthropic_subscription_state).
	// PATH is propagated so /usr/bin/claude resolves.
	// CRITICAL: do NOT propagate any BYOK key env — feedback_subscription_only
	// requires the subscription path (HOME=/root credentials), not API-key auth.
	const env: Record<string, string | undefined> = {
		HOME: '/root',
		PATH: process.env.PATH,
	}

	const sdkOptions: SdkQueryOptions = {
		cwd: vaultPath,
		settingSources: ['project'],
		maxTurns: 1,
		maxBudgetUsd: 0.05,
		model,
		permissionMode: 'dontAsk',
		persistSession: false,
		env,
	}

	let result: AuthVerifierResult
	try {
		// Default to the real SDK; tests inject `queryImpl` to avoid hitting
		// api.anthropic.com (CI machines have no /root/.claude/.credentials.json).
		const q =
			opts.queryImpl ?? (await import('@anthropic-ai/claude-agent-sdk')).query

		const messages = q({
			prompt: 'Reply with the single word "ok"',
			options: sdkOptions,
		})

		let initSeen: AuthVerifierResult | null = null
		for await (const msg of messages as AsyncIterable<any>) {
			if (msg?.type === 'system' && msg?.subtype === 'init') {
				initSeen = {ok: true, model: msg?.model ?? model}
				break
			}
		}
		result = initSeen ?? {ok: false, err: 'no init event received'}
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err)
		result = {ok: false, err: msg}
	}

	// Redis side-effect (best-effort; failure does NOT change result).
	if (opts.redis) {
		const value = result.ok ? 'ok' : `failed: ${result.err}`
		try {
			await opts.redis.set(REDIS_STATUS_KEY, value)
		} catch (redisErr: unknown) {
			opts.logger?.error(
				'[claude-runner/auth] Redis write failed (non-fatal)',
				redisErr,
			)
		}
	}

	// Logger side-effect.
	if (opts.logger) {
		if (result.ok) {
			opts.logger.log(
				`[claude-runner/auth] smoke check passed model=${result.model}`,
			)
		} else {
			opts.logger.error(
				`[claude-runner/auth] smoke check failed: ${result.err}`,
			)
		}
	}

	return result
}
