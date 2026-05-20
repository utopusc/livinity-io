// Phase 177-02 — AgentRunner: Redis-locked CC PTY execution + per-agent inbox write.
//
// Run-lock: Redis SET NX PX 900000 (`liv:agent:running:<agentId>`) prevents
// concurrent double-fire for the same agent. Lock auto-expires after 15 min
// (T-177-02-01 DoS mitigation).
//
// PTY session: Phase 166 CcPtyManager.createSession with userId='scheduler'
// (hardcoded — never caller-derived, T-177-02-03 mitigation) and cwd from
// AgentItem.cwd || vaultRoot.
//
// Inbox write: `<vaultRoot>/items/<agentId>/inbox/<runId>.md` (not the global
// Phase 164 `vaultPath/inbox/` path). Uses injected inboxWriterImpl for
// testability (vi.fn() in tests; real fs.writeFile in production).
//
// NOTE: Phase 177-02 creates the PTY session but does NOT wire real output
// capture. The actual long-running CC query is deferred to a future phase.
// For now: createSession → stub delay → write inbox with status='success'.
// The comment `// Phase 178: wire real output capture here` documents the stub.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.
// vault-items/index.ts is SACRED — no changes there.

import {randomUUID} from 'node:crypto'
import {promises as fs} from 'node:fs'
import * as path from 'node:path'
import type {Redis} from 'ioredis'
import type {ItemStore} from './item-store.js'
import type {CcPtyManager} from '../cc-pty/manager.js'

// ── Public types ────────────────────────────────────────────────────────────

export interface AgentRunnerOptions {
	redis: Redis
	itemStore: ItemStore
	ccPtyManager: CcPtyManager
	vaultRoot: string
	/**
	 * Injected inbox writer — production uses real fs.writeFile; tests inject
	 * a vi.fn() to avoid FS side effects. Signature: (filePath, frontmatter) => Promise.
	 */
	inboxWriterImpl?: (
		filePath: string,
		frontmatter: Record<string, unknown>,
	) => Promise<unknown>
}

export type RunAgentResult =
	| {ok: true; runId: string}
	| {ok: false; reason: 'agent_not_found'}
	| {ok: false; reason: 'already_running'}
	| {ok: false; reason: 'spawn_error'; message: string}

export interface RunAgentOptions {
	triggeredBy?: 'cron' | 'manual'
}

// ── AgentRunner class ────────────────────────────────────────────────────────

export class AgentRunner {
	private readonly redis: Redis
	private readonly itemStore: ItemStore
	private readonly ccPtyManager: CcPtyManager
	private readonly vaultRoot: string
	private readonly inboxWriterImpl: NonNullable<AgentRunnerOptions['inboxWriterImpl']>

	constructor(opts: AgentRunnerOptions) {
		this.redis = opts.redis
		this.itemStore = opts.itemStore
		this.ccPtyManager = opts.ccPtyManager
		this.vaultRoot = opts.vaultRoot
		this.inboxWriterImpl = opts.inboxWriterImpl ?? defaultInboxWriter
	}

	async runAgent(agentId: string, opts: RunAgentOptions = {}): Promise<RunAgentResult> {
		const triggeredBy = opts.triggeredBy ?? 'manual'
		const runId = randomUUID()
		const lockKey = `liv:agent:running:${agentId}`

		// 1. Verify agent exists
		const item = await this.itemStore.read(agentId)
		if (!item) {
			return {ok: false, reason: 'agent_not_found'}
		}

		// 2. Acquire Redis run-lock (NX = only if not exists; PX = TTL ms)
		// ioredis 5 signature: set(key, value, 'PX', ms, 'NX')
		const acquired = await this.redis.set(lockKey, runId, 'PX', 900_000, 'NX')
		if (acquired === null) {
			// Lock already held — another run is in progress
			return {ok: false, reason: 'already_running'}
		}

		const startedAt = Date.now()
		try {
			// 3. Resolve cwd: AgentItem.cwd if set, else vaultRoot
			const cwd = (item as {cwd?: string}).cwd ?? this.vaultRoot

			// 4. Create CC PTY session (Phase 166 CcPtyManager)
			// userId is hardcoded as 'scheduler' — never caller-derived (T-177-02-03)
			await this.ccPtyManager.createSession({
				userId: 'scheduler',
				title: `agent-${agentId}`,
				cwd,
			})

			// Phase 178: wire real output capture here.
			// For now: 0ms stub (session was created; capture deferred).
			const durationMs = Date.now() - startedAt

			// 5. Write inbox entry to items/<agentId>/inbox/<runId>.md
			const inboxDir = path.join(this.vaultRoot, 'items', agentId, 'inbox')
			const inboxFile = path.join(inboxDir, `${runId}.md`)
			const frontmatter: Record<string, unknown> = {
				runAt: new Date().toISOString(),
				triggeredBy,
				durationMs,
				status: 'success',
			}
			await this.inboxWriterImpl(inboxFile, frontmatter)

			return {ok: true, runId}
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err)
			// Attempt to write a failed inbox entry (best-effort — don't throw on failure)
			try {
				const durationMs = Date.now() - startedAt
				const inboxDir = path.join(this.vaultRoot, 'items', agentId, 'inbox')
				const inboxFile = path.join(inboxDir, `${runId}.md`)
				const frontmatter: Record<string, unknown> = {
					runAt: new Date().toISOString(),
					triggeredBy,
					durationMs,
					status: 'failed',
				}
				await this.inboxWriterImpl(inboxFile, frontmatter)
			} catch {
				/* best-effort — swallow */
			}
			return {ok: false, reason: 'spawn_error', message}
		} finally {
			// Release lock (always, even if spawn threw)
			await this.redis.del(lockKey)
		}
	}
}

// ── Default inbox writer (production) ────────────────────────────────────────

/**
 * Writes a YAML-frontmatter Markdown file to `filePath`.
 * Creates the parent directory recursively if needed.
 */
async function defaultInboxWriter(
	filePath: string,
	frontmatter: Record<string, unknown>,
): Promise<void> {
	await fs.mkdir(path.dirname(filePath), {recursive: true})
	const fm = Object.entries(frontmatter)
		.map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
		.join('\n')
	const content = `---\n${fm}\n---\n`
	await fs.writeFile(filePath, content, 'utf-8')
}
