/**
 * Phase 195 Plan 01 Task 2 — flow-service.ts
 *
 * XaiAuthFlowService wraps `spawnOpencodeLogin()` in an async-await primitive
 * that the tRPC router (195-03) and onboarding UI (195-04) consume. It owns:
 *
 *   - The in-memory flow registry (`Map<flowId, FlowEntry>`)
 *   - The 30s URL-discovery race (stdout polled per chunk via extractXaiOAuthUrl)
 *   - The 10-min global lifetime timer (T-195-01-02 zombie mitigation)
 *   - SIGTERM-→-2s-grace-→-SIGKILL abort escalation
 *   - flowId validation (T-195-01-01 defense-in-depth even though flowId
 *     never reaches a shell)
 *
 * Threat surface notes:
 *   - flowId regex: /^[a-zA-Z0-9-]{8,64}$/
 *   - Map cap: 10 active flows; further start() calls reject FlowCapacityError
 *   - Stdout/stderr never logged at info level; debug-only forwards through
 *     logger.debug if provided (token-leak mitigation T-195-01-03)
 *
 * Public API (locked by CONTEXT.md):
 *   new XaiAuthFlowService({opencodeBinaryPath?, method?, logger?})
 *   start(flowId): Promise<{url, startedAt}>
 *   waitForCompletion(flowId, timeoutMs?): Promise<{success: true, completedAt}>
 *   abort(flowId): Promise<void>
 *   hasActiveFlow(flowId): boolean
 */

import type {ChildProcessWithoutNullStreams} from 'node:child_process'

import {extractXaiOAuthUrl} from './url-extractor.js'
import {spawnOpencodeLogin} from './opencode-spawner.js'

// ─── Tunables ────────────────────────────────────────────────────────────────

/** Default method label per CONTEXT.md verified live 2026-05-22 with operator's SuperGrok subscription. */
const DEFAULT_METHOD = 'xAI Grok Auth Headless / Remote / VPS'

/** URL must appear in child stdout within this window or the flow is aborted. */
const URL_DISCOVERY_TIMEOUT_MS = 30_000

/** Global lifetime of a flow — protects against zombie children (T-195-01-02). */
const FLOW_LIFETIME_TIMEOUT_MS = 10 * 60_000

/** Default waitForCompletion timeout. */
const DEFAULT_WAIT_TIMEOUT_MS = 10 * 60_000

/** Map cap — defense against DoS via flow registry growth (T-195-01-02). */
const MAX_ACTIVE_FLOWS = 10

/** SIGTERM grace before SIGKILL escalation in abort(). */
const ABORT_GRACE_MS = 2_000

/** flowId regex — alphanumeric + hyphen, 8 to 64 chars (T-195-01-01). */
// Acceptance criterion grep target — DO NOT collapse onto a comment line.
const FLOW_ID_REGEX = /^[a-zA-Z0-9-]{8,64}$/

// ─── Logger contract (minimal duck-typed) ────────────────────────────────────

export interface Logger {
	debug?: (...args: unknown[]) => void
	info?: (...args: unknown[]) => void
	warn?: (...args: unknown[]) => void
	error?: (...args: unknown[]) => void
}

// ─── Typed errors ────────────────────────────────────────────────────────────

export class XaiAuthFlowTimeoutError extends Error {
	readonly code = 'XAI_AUTH_TIMEOUT' as const
	constructor(message = 'xAI auth flow timed out') {
		super(message)
		this.name = 'XaiAuthFlowTimeoutError'
	}
}

export class XaiAuthFlowAbortedError extends Error {
	readonly code = 'XAI_AUTH_ABORTED' as const
	constructor(message = 'xAI auth flow aborted') {
		super(message)
		this.name = 'XaiAuthFlowAbortedError'
	}
}

export class ValidationError extends Error {
	readonly code = 'XAI_AUTH_VALIDATION_ERROR' as const
	constructor(message: string) {
		super(message)
		this.name = 'ValidationError'
	}
}

export class DuplicateFlowError extends Error {
	readonly code = 'XAI_AUTH_DUPLICATE_FLOW' as const
	constructor(flowId: string) {
		super(`flowId already active: ${flowId}`)
		this.name = 'DuplicateFlowError'
	}
}

export class UnknownFlowError extends Error {
	readonly code = 'XAI_AUTH_UNKNOWN_FLOW' as const
	constructor(flowId: string) {
		super(`flowId not registered: ${flowId}`)
		this.name = 'UnknownFlowError'
	}
}

export class FlowCapacityError extends Error {
	readonly code = 'XAI_AUTH_CAPACITY' as const
	constructor() {
		super(`maximum concurrent xAI auth flows reached (${MAX_ACTIVE_FLOWS})`)
		this.name = 'FlowCapacityError'
	}
}

// ─── Internal entry ──────────────────────────────────────────────────────────

interface FlowEntry {
	child: ChildProcessWithoutNullStreams
	url: string | null
	startedAt: number
	lifetimeTimer: NodeJS.Timeout | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Redact the obvious access/refresh token shapes from a log line (T-195-01-03). */
function redactTokenSubstrings(line: string): string {
	// Heuristic: strip `access[: ]value` / `refresh[: ]value` / `Bearer xxx`
	return line
		.replace(/(["']?(?:access|refresh)(?:_token)?["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1<REDACTED>')
		.replace(/(Bearer\s+)[A-Za-z0-9._-]+/g, '$1<REDACTED>')
}

// ─── Service ─────────────────────────────────────────────────────────────────

export interface XaiAuthFlowServiceOpts {
	opencodeBinaryPath?: string
	/** OpenCode method label. Default verified working 2026-05-22 — flag warn-and-fallback if drift detected at runtime. */
	method?: string
	logger?: Logger
}

export class XaiAuthFlowService {
	private readonly flows = new Map<string, FlowEntry>()
	private readonly opencodeBinaryPath?: string
	private readonly method: string
	private readonly logger: Logger

	constructor(opts: XaiAuthFlowServiceOpts = {}) {
		this.opencodeBinaryPath = opts.opencodeBinaryPath
		this.method = opts.method ?? DEFAULT_METHOD
		this.logger = opts.logger ?? {}
	}

	hasActiveFlow(flowId: string): boolean {
		return this.flows.has(flowId)
	}

	/**
	 * Start an xAI auth flow. Spawns the OpenCode CLI, races stdout against
	 * a 30s URL-discovery timeout, returns the extracted URL on success.
	 *
	 * Throws:
	 *   - ValidationError       — flowId fails regex check
	 *   - DuplicateFlowError    — flowId already in registry
	 *   - FlowCapacityError     — registry at MAX_ACTIVE_FLOWS
	 *   - XaiAuthFlowTimeoutError — no URL within 30s (child SIGKILLed)
	 *   - OpencodeNotInstalledError / OpencodeSpawnError — re-thrown from spawner
	 */
	async start(flowId: string): Promise<{url: string; startedAt: number}> {
		if (!FLOW_ID_REGEX.test(flowId)) {
			throw new ValidationError(
				`flowId must match /^[a-zA-Z0-9-]{8,64}$/ (got: ${JSON.stringify(flowId)})`,
			)
		}
		if (this.flows.has(flowId)) {
			throw new DuplicateFlowError(flowId)
		}
		if (this.flows.size >= MAX_ACTIVE_FLOWS) {
			throw new FlowCapacityError()
		}

		let stdoutBuf = ''
		let urlResolved = false
		let urlResolve!: (url: string) => void
		let urlReject!: (err: unknown) => void
		const urlPromise = new Promise<string>((resolve, reject) => {
			urlResolve = resolve
			urlReject = reject
		})

		const onStdout = (chunk: string) => {
			stdoutBuf += chunk
			if (!urlResolved) {
				const found = extractXaiOAuthUrl(stdoutBuf)
				if (found) {
					urlResolved = true
					urlResolve(found)
				}
			}
			this.logger.debug?.('[xai-auth] stdout', redactTokenSubstrings(chunk))
		}
		const onStderr = (chunk: string) => {
			this.logger.debug?.('[xai-auth] stderr', redactTokenSubstrings(chunk))
		}

		const {child, ready} = spawnOpencodeLogin({
			provider: 'xai',
			method: this.method,
			onStdout,
			onStderr,
			opencodeBinaryPath: this.opencodeBinaryPath,
		})

		// If spawn fails before stdout, surface that as the start() rejection.
		ready.catch((err: unknown) => {
			if (!urlResolved) {
				urlReject(err)
			}
		})

		// 30s URL-discovery race
		const discoveryTimer = setTimeout(() => {
			if (!urlResolved) {
				try {
					child.kill('SIGKILL')
				} catch {
					// ignore
				}
				urlReject(new XaiAuthFlowTimeoutError('xAI OAuth URL not observed within 30s'))
			}
		}, URL_DISCOVERY_TIMEOUT_MS)

		let url: string
		try {
			url = await urlPromise
		} catch (err) {
			clearTimeout(discoveryTimer)
			throw err
		}
		clearTimeout(discoveryTimer)

		const startedAt = Date.now()

		// 10-min global lifetime timer (T-195-01-02 zombie mitigation)
		const lifetimeTimer = setTimeout(() => {
			const entry = this.flows.get(flowId)
			if (entry) {
				try {
					entry.child.kill('SIGKILL')
				} catch {
					// ignore
				}
				this.flows.delete(flowId)
				this.logger.warn?.(`[xai-auth] flow ${flowId} reached lifetime cap; SIGKILLed`)
			}
		}, FLOW_LIFETIME_TIMEOUT_MS)
		// Don't keep the event loop alive solely for this timer.
		lifetimeTimer.unref?.()

		this.flows.set(flowId, {child, url, startedAt, lifetimeTimer})

		return {url, startedAt}
	}

	/**
	 * Resolve when the child process exits cleanly (OpenCode auto-completes
	 * on device-code success and exits 0). Reject on timeout or non-zero exit.
	 */
	async waitForCompletion(
		flowId: string,
		timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS,
	): Promise<{success: true; completedAt: number}> {
		const entry = this.flows.get(flowId)
		if (!entry) throw new UnknownFlowError(flowId)

		return new Promise((resolve, reject) => {
			let settled = false
			const onExit = (code: number | null) => {
				if (settled) return
				settled = true
				clearTimeout(timeoutTimer)
				this.cleanup(flowId)
				if (code === 0) {
					resolve({success: true, completedAt: Date.now()})
				} else {
					reject(new XaiAuthFlowAbortedError(`opencode exited with code ${code}`))
				}
			}
			const onError = (err: Error) => {
				if (settled) return
				settled = true
				clearTimeout(timeoutTimer)
				this.cleanup(flowId)
				reject(err)
			}
			const timeoutTimer = setTimeout(() => {
				if (settled) return
				settled = true
				try {
					entry.child.kill('SIGKILL')
				} catch {
					// ignore
				}
				this.cleanup(flowId)
				reject(new XaiAuthFlowTimeoutError(`xAI auth flow ${flowId} timed out after ${timeoutMs}ms`))
			}, timeoutMs)
			timeoutTimer.unref?.()

			entry.child.once('exit', onExit)
			entry.child.once('error', onError)
		})
	}

	/**
	 * Abort an in-flight flow. SIGTERM, 2s grace, SIGKILL, registry removal.
	 * Idempotent — abort()-ing an unknown flowId is a no-op.
	 */
	async abort(flowId: string): Promise<void> {
		const entry = this.flows.get(flowId)
		if (!entry) return

		try {
			entry.child.kill('SIGTERM')
		} catch {
			// ignore
		}

		// Schedule SIGKILL escalation; do not block abort() on it.
		const escalator = setTimeout(() => {
			try {
				if (!entry.child.killed) {
					entry.child.kill('SIGKILL')
				}
			} catch {
				// ignore
			}
		}, ABORT_GRACE_MS)
		escalator.unref?.()

		this.cleanup(flowId)
	}

	// ─── Internal ────────────────────────────────────────────────────────────

	private cleanup(flowId: string): void {
		const entry = this.flows.get(flowId)
		if (!entry) return
		if (entry.lifetimeTimer) {
			clearTimeout(entry.lifetimeTimer)
		}
		this.flows.delete(flowId)
	}
}
