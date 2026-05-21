// Phase 166-03 — CcPtyManager.
//
// Owns Claude Code subprocess lifecycle: creates tmux sessions detached
// with `claude` as the foreground command, attaches via node-pty wrapping
// `tmux attach -t`, resurrects dead tmux on reattach using
// `claude --resume <ccSessionId>`, enforces concurrent cap (D-V35-H,
// default 10), and exposes runIdleReaper() callable from Plan 166-05.
//
// Threat model (highlights):
//  - tmux session name injection via userId → mitigated by
//    USER_ID_RE regex (rejects shell metachars) + shellEscape
//    defense-in-depth + TMUX_NAME_RE sanity check on generated name.
//  - shell injection via cwd / ccSessionId / title → mitigated by
//    shellEscape on every value crossing execSync.
//  - data plane uses node-pty ARRAY argv form (no shell), so tmuxName
//    never enters a shell parser at the data plane.
//
// Sacred SHA f3538e1d... + D-09 + Phase 161-02 helper + Phase 162-01
// vault-scaffolder + Phase 162-02 agent-session.ts + Phase 163 ws-agent.ts
// + Phase 164 + Phase 165-01 all UNCHANGED.

import * as pty from 'node-pty'
import * as path from 'path'
import {execSync} from 'child_process'
import {randomUUID} from 'crypto'
import type {Redis} from 'ioredis'
import type {CcPtySession, CcPtyManagerOptions} from './types.js'
import {SessionStore} from './session-store.js'
// Phase 189-02 — agent session hooks (ADDITIVE). resolveAgentSpawnArgs returns [] for non-agent sessions (no-op).
// Phase 189-05 — transcript recorder exports added to same module (additive).
import {resolveAgentSpawnArgs, isAgentSession, createAgentSessionRecorder, flushAgentSessionTranscript, type AgentSessionRecorder} from './agent-session-hooks.js'

// ─── Security constants ──────────────────────────────────────────────────

const USER_ID_RE = /^[a-zA-Z0-9_-]+$/
const TMUX_NAME_RE = /^livos-cc-[a-zA-Z0-9_-]+-[a-f0-9]{8}$/

// Phase 168-04 — Redis channel for cross-tab attach status broadcasts.
// Message format: JSON {sessionId, attachId, attachedAt, action}.
// No PII / no session content — metadata only.
const ATTACH_CHANNEL = 'liv:cc-pty:attached'

/**
 * POSIX single-quote escape: any single-quote in `s` is replaced with `'\''`
 * (close quote, escaped quote, reopen quote) and the whole string is wrapped
 * in single quotes. Result is safe to interpolate into any POSIX shell.
 */
function shellEscape(s: string): string {
	return `'${s.replace(/'/g, `'\\''`)}'`
}

function validateUserId(userId: string): void {
	if (!USER_ID_RE.test(userId)) {
		throw new Error(`CcPty: invalid userId '${userId}' (must match ${USER_ID_RE})`)
	}
}

// ─── Manager ─────────────────────────────────────────────────────────────

export class CcPtyManager {
	private store: SessionStore
	// Mirror mode (D-V35-E): multiple concurrent attaches per session each
	// get their own node-pty handle. Map value is an array of handles.
	private attachedTerminals = new Map<string, pty.IPty[]>()
	// Phase 168-04 — attachId per node-pty handle, parallel to attachedTerminals.
	// Used by killSession to publish detach for each peer attacher BEFORE killing.
	private handleAttachIds = new Map<string, string[]>()
	private vaultPath: string
	private logger: CcPtyManagerOptions['logger']
	private idleHours: number
	private maxSessions: number
	private started = false
	// Phase 168-04 — Redis client for cross-tab attach pub/sub broadcasts.
	// Publish is best-effort; failures logged but never thrown so a Redis
	// outage cannot break attach/detach functionality.
	private redis: Redis
	// Phase 189-05 — per-session transcript recorders for agent sessions.
	private agentRecorders = new Map<string, AgentSessionRecorder>()

	constructor(opts: CcPtyManagerOptions & {store?: SessionStore}) {
		this.vaultPath = opts.vaultPath
		this.logger = opts.logger
		this.idleHours = opts.idleHours ?? 24
		this.maxSessions = opts.maxSessions ?? 10
		this.store = opts.store ?? new SessionStore({vaultPath: opts.vaultPath})
		this.redis = opts.redis
	}

	async start(): Promise<void> {
		if (this.started) return
		// Verify tmux binary exists; log + non-fatal warn if missing.
		// Phase 170 apt-installs tmux on Mini PC; local dev typically lacks it.
		try {
			const v = execSync('tmux -V', {encoding: 'utf-8'}).trim()
			this.logger.log(`[cc-pty] tmux available: ${v}`)
		} catch {
			this.logger.warn?.(
				'[cc-pty] tmux binary NOT FOUND — createSession/attachSession will fail until Phase 170 apt-installs tmux',
			)
		}
		this.started = true
	}

	async stop(): Promise<void> {
		// Detach all in-process pty handles; tmux sessions OUTLIVE livinityd
		// by design (D-V35-A) — stop() does NOT kill the tmux sessions.
		for (const handles of this.attachedTerminals.values()) {
			for (const h of handles) {
				try {
					h.kill()
				} catch {
					/* swallow */
				}
			}
		}
		this.attachedTerminals.clear()
		this.started = false
	}

	async createSession(opts: {
		userId: string
		title?: string
		cwd?: string
		model?: string
		/** Phase 189-02 — agent name for wizard prompt (optional; only for agent sessions). */
		agentName?: string
	}): Promise<CcPtySession> {
		validateUserId(opts.userId)

		// Cap enforcement BEFORE spawn
		const existing = await this.store.getByUser(opts.userId)
		if (existing.length >= this.maxSessions) {
			throw new Error(
				`CcPty: session cap reached (${this.maxSessions}) for user ${opts.userId}`,
			)
		}

		const id = randomUUID()
		const tmuxName = `livos-cc-${opts.userId}-${id.slice(0, 8)}`
		if (!TMUX_NAME_RE.test(tmuxName)) {
			throw new Error(`CcPty: generated tmuxName failed regex: ${tmuxName}`)
		}

		const cwd = opts.cwd ?? this.vaultPath
		const cwdEsc = shellEscape(cwd)
		const nameEsc = shellEscape(tmuxName)

		// Phase 183 — read skip-perms flag. Default: true (D-V38-K).
		// null → operator hasn't set a value → safe default is to skip perms.
		const skipPermsRaw = await this.redis.get('liv:config:cc_pty_skip_perms')
		const skipPerms = skipPermsRaw === null ? true : skipPermsRaw === 'true'
		const skipPermsFlag = skipPerms ? ' --dangerously-skip-permissions' : ''

		// Phase 189-02 — agent spawn args (wizard prompt injection on first open).
		// resolveAgentSpawnArgs returns [] for non-agent sessions (no-op).
		let agentExtraArgs: string[] = []
		if (isAgentSession(tmuxName)) {
			const agentIdMatch = tmuxName.match(/^liv-agent-(.+)$/)
			if (agentIdMatch) {
				const agentId = agentIdMatch[1]
				const agentDir = path.join(this.vaultPath, 'items', agentId)
				const mcpNames = await this.getMcpNames()
				const hookResult = await resolveAgentSpawnArgs({
					tmuxName,
					agentDir,
					agentItem: {id: agentId, name: opts.agentName ?? agentId},
					mcpNames,
				})
				agentExtraArgs = hookResult.extraArgs
			}
		}
		// Build extra args string — each arg is shell-escaped
		const extraArgsStr =
			agentExtraArgs.length > 0 ? ' ' + agentExtraArgs.map((a) => shellEscape(a)).join(' ') : ''

		// tmux command — name + cwd are shell-escaped; the child command sets
		// HOME=/root (Anthropic SDK credentials live at /root/.claude/.credentials.json)
		// AND forces a UTF-8 locale so Turkish + non-ASCII chars round-trip cleanly
		// through claude's TUI. Phase 167.2 hotfix: livinityd inherits LANG from
		// systemd but tmux daemon snapshots env on first server start; subsequent
		// new-session calls inherit the daemon's snapshot. Setting LANG/LC_ALL on
		// the spawned child explicitly bypasses that snapshot.
		const tmuxCmd = `tmux new-session -d -s ${nameEsc} -c ${cwdEsc} 'LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 HOME=/root claude${skipPermsFlag}${extraArgsStr}'`
		execSync(tmuxCmd, {env: {...process.env, HOME: '/root', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8'}})

		// Phase 183 — suppress tmux status bar so the green line never appears
		// in xterm.js. Non-fatal: if tmux is absent in local dev this must not
		// prevent session creation.
		try {
			execSync(`tmux set-option -g status off -t ${nameEsc}`, {
				env: {...process.env, HOME: '/root'},
				stdio: 'ignore',
			})
		} catch (err) {
			this.logger.warn?.(`[cc-pty] set-option status off failed for ${tmuxName}: ${err}`)
		}

		const session: CcPtySession = {
			id,
			userId: opts.userId,
			tmuxName,
			cwd,
			model: opts.model,
			createdAt: Date.now(),
			lastAttachedAt: 0,
			lastMessageAt: 0,
			title: opts.title,
		}
		await this.store.add(session)
		this.logger.log(
			`[cc-pty] createSession userId=${opts.userId} id=${id} tmuxName=${tmuxName}`,
		)
		return session
	}

	async attachSession(
		sessionId: string,
		onStdout: (chunk: Buffer) => void,
		opts?: {attachId?: string},
	): Promise<{
		stdin: (data: string) => void
		resize: (cols: number, rows: number) => void
		detach: () => void
		attachId: string
	}> {
		const session = await this.store.getById(sessionId)
		if (!session) throw new Error(`CcPty: session ${sessionId} not found`)

		// Phase 168-04 — attachId is caller-provided (UI tab UUID) or server-
		// generated; used by killSession + detach to publish pub/sub events
		// and by peer-tab subscribers to suppress self-attach badges.
		const attachId = opts?.attachId ?? randomUUID()

		const nameEsc = shellEscape(session.tmuxName)

		// Verify tmux session still alive — has-session exits non-zero if dead.
		let alive = false
		try {
			execSync(`tmux has-session -t ${nameEsc}`, {stdio: 'ignore'})
			alive = true
		} catch {
			alive = false
		}

		if (!alive) {
			// Resurrect: spawn new tmux + claude --resume <ccSessionId> if present
			const cwdEsc = shellEscape(session.cwd)
			const resumeArg = session.ccSessionId
				? `--resume ${shellEscape(session.ccSessionId)}`
				: ''
			// Phase 167.2 hotfix — same LANG/LC_ALL injection as createSession.
			const cmd = `tmux new-session -d -s ${nameEsc} -c ${cwdEsc} 'LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 HOME=/root claude ${resumeArg}'`
			execSync(cmd, {env: {...process.env, HOME: '/root', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8'}})
			this.logger.log(`[cc-pty] resurrected tmux session ${session.tmuxName}`)
		} else {
			// Phase 181-04 — Buffer replay: send last 2000 lines of tmux output to
			// the new client. Only when session was already alive (resurrection = fresh
			// start with no prior output to replay). Non-fatal: if capture-pane fails,
			// attach still proceeds (T-181-04-06: uses shellEscape + timeout guard).
			try {
				const replay = execSync(
					`tmux capture-pane -e -p -S -2000 -t ${nameEsc}`,
					{encoding: 'utf-8', timeout: 3000},
				)
				if (replay) onStdout(Buffer.from(replay))
			} catch (err) {
				this.logger.warn?.(
					`[cc-pty] capture-pane failed for ${session.tmuxName}: ${err}`,
				)
				// Non-fatal: continue with attach even if replay fails
			}
		}

		// Spawn node-pty wrapping `tmux attach -t <name>` — ARRAY argv form
		// bypasses the shell entirely so tmuxName never enters a shell parser.
		// Phase 167.2 hotfix — propagate UTF-8 locale to the attach client so
		// the renderer xterm.js receives proper multi-byte sequences.
		const ptyProc = pty.spawn('tmux', ['attach', '-t', session.tmuxName], {
			name: 'xterm-256color',
			cols: 120,
			rows: 30,
			cwd: session.cwd,
			env: {
				...process.env,
				HOME: '/root',
				TERM: 'xterm-256color',
				LANG: 'en_US.UTF-8',
				LC_ALL: 'en_US.UTF-8',
			} as {[k: string]: string},
		})

		ptyProc.onData((data) => {
			this.store
				.update(session.id, {lastMessageAt: Date.now()})
				.catch(() => {})
			onStdout(Buffer.from(data))
		})

		// Phase 189-05 — start session transcript recorder for agent sessions (ADDITIVE).
		if (isAgentSession(session.tmuxName)) {
			const recorder = createAgentSessionRecorder()
			this.agentRecorders.set(sessionId, recorder)
			// Second listener feeds the recorder (does not affect existing data plane)
			ptyProc.onData((data) => {
				recorder.append(Buffer.from(data))
			})
		}

		// Mirror mode: append to per-sessionId handle list
		const list = this.attachedTerminals.get(sessionId) ?? []
		list.push(ptyProc)
		this.attachedTerminals.set(sessionId, list)
		// Phase 168-04 — parallel attachId list for cross-tab detach broadcast
		const idsList = this.handleAttachIds.get(sessionId) ?? []
		idsList.push(attachId)
		this.handleAttachIds.set(sessionId, idsList)
		await this.store.update(sessionId, {lastAttachedAt: Date.now()})

		// Phase 168-04 — broadcast attach. Best-effort; failures logged but
		// not thrown (a Redis outage cannot break attach functionality).
		this.redis
			.publish(
				ATTACH_CHANNEL,
				JSON.stringify({
					sessionId,
					attachId,
					attachedAt: Date.now(),
					action: 'attached',
				}),
			)
			.catch((err) => this.logger.error?.('[cc-pty] attach publish failed', err))

		return {
			stdin: (data) => ptyProc.write(data),
			resize: (cols, rows) => ptyProc.resize(cols, rows),
			attachId,
			detach: () => {
				try {
					ptyProc.kill()
				} catch {
					/* swallow */
				}
				const cur = this.attachedTerminals.get(sessionId)
				if (cur) {
					const filtered = cur.filter((p) => p !== ptyProc)
					if (filtered.length === 0) this.attachedTerminals.delete(sessionId)
					else this.attachedTerminals.set(sessionId, filtered)
				}
				// Phase 168-04 — remove this attachId from the parallel list
				const curIds = this.handleAttachIds.get(sessionId)
				if (curIds) {
					const filteredIds = curIds.filter((aid) => aid !== attachId)
					if (filteredIds.length === 0) this.handleAttachIds.delete(sessionId)
					else this.handleAttachIds.set(sessionId, filteredIds)
				}
				// Phase 168-04 — broadcast detach. Best-effort.
				this.redis
					.publish(
						ATTACH_CHANNEL,
						JSON.stringify({
							sessionId,
							attachId,
							attachedAt: Date.now(),
							action: 'detached',
						}),
					)
					.catch((err) => this.logger.error?.('[cc-pty] detach publish failed', err))
			},
		}
	}

	async killSession(id: string): Promise<void> {
		const session = await this.store.getById(id)
		if (!session) return
		// Phase 168-04 — publish detach for each active attacher BEFORE killing
		// so peer tabs clear their badges in real time, even though the
		// per-handle detach hooks below would also fire on .kill() (defensive
		// redundancy: tmux kill-session may EOF the node-pty handles in
		// parallel and the cleanup ordering across processes is racy).
		const ids = this.handleAttachIds.get(id) ?? []
		for (const attachId of ids) {
			this.redis
				.publish(
					ATTACH_CHANNEL,
					JSON.stringify({
						sessionId: id,
						attachId,
						attachedAt: Date.now(),
						action: 'detached',
					}),
				)
				.catch((err) =>
					this.logger.error?.('[cc-pty] killSession detach publish failed', err),
				)
		}
		this.handleAttachIds.delete(id)
		const nameEsc = shellEscape(session.tmuxName)
		try {
			execSync(`tmux kill-session -t ${nameEsc}`, {stdio: 'ignore'})
		} catch {
			/* tmux session already dead — fine */
		}
		const handles = this.attachedTerminals.get(id) ?? []
		for (const h of handles) {
			try {
				h.kill()
			} catch {
				/* swallow */
			}
		}
		this.attachedTerminals.delete(id)

		// Phase 189-05 — flush transcript for agent sessions before store.remove (ADDITIVE).
		const recorder = this.agentRecorders.get(id)
		if (recorder) {
			const agentIdMatch = session.tmuxName.match(/^liv-agent-(.+)$/)
			if (agentIdMatch) {
				const agentDir = path.join(this.vaultPath, 'items', agentIdMatch[1])
				await flushAgentSessionTranscript({recorder, agentDir}).catch((err) =>
					this.logger.warn?.(`[cc-pty] transcript flush failed: ${err}`),
				)
			}
			this.agentRecorders.delete(id)
		}

		await this.store.remove(id)
		this.logger.log(`[cc-pty] killSession id=${id} tmuxName=${session.tmuxName}`)
	}

	async listSessions(userId: string): Promise<CcPtySession[]> {
		return this.store.getByUser(userId)
	}

	/**
	 * Phase 168-01 — additive: rename a session's user-visible title.
	 * Thin pass-through to SessionStore.update which is a no-op for unknown ids,
	 * so this method is safe to call without a prior existence check.
	 */
	async renameSession(id: string, title: string): Promise<void> {
		await this.store.update(id, {title})
	}

	/**
	 * Phase 168-01 — additive: fetch a single session by id (or null if absent).
	 * Thin pass-through to SessionStore.getById; used by the tRPC `getPreview`
	 * procedure to resolve `ccSessionId` for the CC jsonl path lookup.
	 */
	async getSession(id: string): Promise<CcPtySession | null> {
		return this.store.getById(id)
	}

	/**
	 * Phase 189-02 — list MCP server names from Redis for wizard prompt injection.
	 * Best-effort: returns [] on any Redis failure.
	 */
	private async getMcpNames(): Promise<string[]> {
		try {
			const keys = await this.redis.keys('liv:mcp:*')
			return keys.map((k) => k.replace(/^liv:mcp:/, '')).filter(Boolean)
		} catch {
			return []
		}
	}

	/**
	 * Walk all known sessions; kill any whose last-touch (max of
	 * lastAttachedAt, lastMessageAt, createdAt) is older than
	 * idleHours * 3600 * 1000 ms.
	 *
	 * `now` is injectable for tests (defaults to Date.now).
	 */
	async runIdleReaper(now: () => number = Date.now): Promise<{reaped: number}> {
		const idleMs = this.idleHours * 3600 * 1000
		const cutoff = now() - idleMs
		const all = await this.store.load()
		let reaped = 0
		for (const s of all) {
			const lastTouch = Math.max(s.lastAttachedAt, s.lastMessageAt, s.createdAt)
			if (lastTouch < cutoff) {
				await this.killSession(s.id)
				reaped++
			}
		}
		return {reaped}
	}
}
