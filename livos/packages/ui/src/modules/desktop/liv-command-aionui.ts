/**
 * Phase 291 — Liv command bar → AionUi (the live Liv) dispatch client.
 *
 * The topbar command bar talks DIRECTLY to the AionUi backend (the real Liv,
 * served at /liv/, aioncore on 127.0.0.1:3020) — NOT the deleted native
 * /chat/livAi route and NOT the openclaw gateway. Protocol reverse-engineered
 * from the pinned upstream source (github.com/iOfficeAI/AionUi v2.1.19,
 * commit f868eeeb) + the in-repo wiring (liv-login-handler.ts, caddy.ts,
 * mcp-registrar/aionui-client.ts, server/index.ts /api/agents):
 *
 *   1. AUTH — prime GET /liv-login (session-gated; mints the HttpOnly
 *      `aionui-session` cookie via AionUi qr-token+qr-login and forwards the
 *      Set-Cookie). After that, the browser auto-attaches the cookie to every
 *      same-origin /liv/* and /ws request. JS never reads the cookie.
 *   2. CREATE — POST /liv/api/conversations {type:'acp', name} → conversation id.
 *      An optional agent is carried in `extra.agent_id`; if that create is
 *      rejected we retry WITHOUT extra so the agent picker can never break the
 *      core stream (it just falls back to AionUi's configured default agent —
 *      LivOS forces Claude Code).
 *   3. SEND — POST /liv/api/conversations/{id}/messages {content}.
 *   4. STREAM — WebSocket wss://<host>/ws (bare /ws, NOT /liv/ws: Caddy @liv_ws
 *      proxies /ws → :3020 with NO forward_auth, while /liv/ws would hit the
 *      forward_auth gate that hijacks the WS upgrade → 502). Frames are
 *      `{name|event, data|payload}`; `message.stream` carries assistant text
 *      deltas (type 'text'|'content') and the per-turn terminal signal
 *      (type 'finish'); `confirmation.add` is a tool-approval prompt. (The
 *      top-level `turn.completed`/`error` cases are harmless backstops — upstream
 *      signals completion/errors via message.stream, which is handled.)
 *
 * Everything is same-origin in prod (one Caddy serves the shell + proxies
 * /liv, /ws, /liv-login). In dev the paths are proxied in vite.config.ts, but
 * full auth needs a reachable box (the LIVINITY_SESSION cookie) — this is
 * box-only / post-release verifiable (livinity.cloud default backend is dead).
 *
 * Defensive throughout: AionUi response shapes are read tolerantly (bare /
 * {data} / {agents} / {success,data} envelopes; text delta as string or
 * {text|content|delta|message}); any failure surfaces via onError so the
 * caller can fall back to opening the AionUi window.
 */

export interface LivAgent {
	id: string
	name: string
	/** Per-agent model list (from AionUi's /api/agents handshake.available_models). */
	models: {id: string; label: string}[]
	/** The agent's own default/current model id (null = let the agent use its built-in default). */
	defaultModelId: string | null
}

export interface LivSkill {
	name: string
	description: string
}

export interface LivMcpServer {
	id: string
	name: string
	enabled: boolean
}

/** Pull the conversation id out of AionUi's tolerant create response. */
function extractConversationId(body: unknown): string | null {
	const b = body as Record<string, unknown> | null | undefined
	const inner = (b?.data ?? b) as Record<string, unknown> | undefined
	const id =
		inner?.id ??
		inner?.conversation_id ??
		inner?.conversationId ??
		b?.id
	return typeof id === 'string' && id.length > 0 ? id : null
}

/** Extract assistant text from a `message.stream` IResponseMessage `.data`. */
function extractTextDelta(data: unknown): string {
	if (typeof data === 'string') return data
	if (data && typeof data === 'object') {
		const d = data as Record<string, unknown>
		for (const k of ['text', 'content', 'delta', 'message']) {
			if (typeof d[k] === 'string') return d[k] as string
		}
	}
	return ''
}

function isHttps(): boolean {
	return typeof location !== 'undefined' ? location.protocol === 'https:' : true
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
	const res = await fetch(url, {credentials: 'include', ...init})
	if (!res.ok) {
		throw new Error(`${init?.method ?? 'GET'} ${url} → HTTP ${res.status}`)
	}
	const text = await res.text()
	return text ? JSON.parse(text) : {}
}

/**
 * Ensure the `aionui-session` cookie exists. Idempotent — if the Liv AI iframe
 * is already mounted the cookie is already set; otherwise this 302-flow mints
 * it. Swallows failures (the caller falls back to opening the window).
 */
export async function primeLivSession(): Promise<void> {
	try {
		// redirect:'manual' — the handler 302s to /liv/; the browser still applies
		// the Set-Cookie before we'd follow it, so we get the cookie without
		// fetching (and discarding) the whole AionUi SPA HTML each dispatch.
		await fetch('/liv-login', {credentials: 'include', redirect: 'manual'})
	} catch {
		// Best-effort — dev (no backend) or a transient failure. The caller's
		// downstream calls will surface a real error if the cookie is missing.
	}
}

/** GET /liv/api/agents — livinityd-filtered list of installed Liv agents. */
export async function listLivAgents(): Promise<LivAgent[]> {
	const body = await fetchJson('/liv/api/agents')
	const raw = Array.isArray(body)
		? body
		: Array.isArray((body as {data?: unknown[]})?.data)
			? (body as {data: unknown[]}).data
			: Array.isArray((body as {agents?: unknown[]})?.agents)
				? (body as {agents: unknown[]}).agents
				: []
	return raw
		.map((a) => {
			const r = a as Record<string, unknown>
			const id = String(r?.id ?? r?.agent_id ?? r?.backend ?? '')
			const name = String(r?.name ?? r?.title ?? r?.id ?? 'Agent')
			// AionUi advertises each agent's model list under handshake.available_models
			// (AcpModelInfo: {available_models:[{id,label}], current_model_id}).
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const hs = (r?.handshake as any)?.available_models as any
			const models = Array.isArray(hs?.available_models)
				? hs.available_models
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						.map((m: any) => ({id: String(m?.id ?? ''), label: String(m?.label ?? m?.id ?? '')}))
						.filter((m: {id: string}) => m.id.length > 0)
				: []
			const defaultModelId = typeof hs?.current_model_id === 'string' ? hs.current_model_id : null
			return {id, name, models, defaultModelId}
		})
		.filter((a) => a.id.length > 0)
}

/** GET /liv/api/skills — the full skill catalog (its length is the "/24" total). */
export async function listLivSkills(): Promise<LivSkill[]> {
	const body = await fetchJson('/liv/api/skills')
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const raw = Array.isArray(body) ? body : Array.isArray((body as any)?.data) ? (body as any).data : []
	return raw
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		.map((s: any) => ({name: String(s?.name ?? ''), description: String(s?.description ?? '')}))
		.filter((s: LivSkill) => s.name.length > 0)
}

/** GET /liv/api/mcp/servers — configured MCP servers (the "/6"; enabled subset). */
export async function getLivMcpServers(): Promise<LivMcpServer[]> {
	const body = await fetchJson('/liv/api/mcp/servers')
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const raw = Array.isArray(body) ? body : Array.isArray((body as any)?.data) ? (body as any).data : []
	return raw
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		.map((m: any) => ({id: String(m?.id ?? ''), name: String(m?.name ?? ''), enabled: m?.enabled === true}))
		.filter((m: LivMcpServer) => m.id.length > 0)
}

/**
 * POST /api/fs/upload — upload one file (multipart). Returns the absolute
 * server-side path to pass in sendMessage `files:[...]`, or null on failure.
 *
 * Phase 302: hits the APEX `/api/fs/upload` (livinityd Express), NOT the old
 * `/liv/api/fs/upload`. The `/liv/api/*` path is reverse-proxied to the AionUi
 * :3020 service, which has NO filesystem backend (vendored web build) → it
 * always 404'd, so device-upload never worked. The apex route falls through
 * Caddy's catch-all to livinityd, the same place the navbar AionUi iframe posts
 * (httpBridge getBaseUrl()===''). Fields/response match AionUi's contract:
 * `file` (binary) + `file_name`; success → {success:true, data:"<abs path>"}.
 */
export async function uploadLivFile(file: File): Promise<string | null> {
	try {
		const fd = new FormData()
		fd.append('file', file)
		fd.append('file_name', file.name) // explicit name wins over Content-Disposition
		const res = await fetch('/api/fs/upload', {method: 'POST', credentials: 'include', body: fd})
		if (!res.ok) return null
		const json = (await res.json()) as {success?: boolean; data?: unknown}
		return json?.success === true && typeof json.data === 'string' ? json.data : null
	} catch {
		return null
	}
}

/**
 * Best-effort: set the conversation's permission MODE (default | plan |
 * acceptEdits | bypassPermissions) via AionUi's config-options. GET the options,
 * find the one in the 'mode' category, PUT the value. Silent on any failure (the
 * conversation then runs at its built-in default mode).
 */
export async function applyLivMode(conversationId: string, mode: string): Promise<void> {
	if (!mode) return
	try {
		const body = await fetchJson(
			`/liv/api/conversations/${encodeURIComponent(conversationId)}/config-options`,
		)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const b = body as any
		const list = (b?.config_options ?? b?.data ?? b) as Array<Record<string, unknown>>
		if (!Array.isArray(list)) return
		const opt =
			list.find((o) => String(o?.category ?? '').toLowerCase() === 'mode') ??
			list.find((o) => o?.id === 'mode')
		if (!opt) return
		const optionId = String(opt.id ?? 'mode')
		await fetchJson(
			`/liv/api/conversations/${encodeURIComponent(conversationId)}/config-options/${encodeURIComponent(optionId)}`,
			{
				method: 'PUT',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({value: mode}),
			},
		)
	} catch {
		// best-effort — mode stays at the conversation default
	}
}

/**
 * POST /liv/api/conversations — create an ephemeral ACP conversation.
 * Tries with the chosen agent first, then without (best-effort agent select).
 */
export async function createLivConversation(agentId?: string, modelId?: string): Promise<string> {
	const base: Record<string, unknown> = {type: 'acp', name: 'Liv command'}
	// ACP agents carry agent + model in `extra` (NOT the top-level `model` field,
	// which is aionrs-only). modelId omitted = "Default Model" (agent's own default).
	const extra: Record<string, unknown> = {}
	if (agentId) extra.agent_id = agentId
	if (modelId) extra.current_model_id = modelId
	const attempts: Record<string, unknown>[] =
		Object.keys(extra).length > 0 ? [{...base, extra}, base] : [base]
	let lastErr: unknown
	for (const body of attempts) {
		try {
			const res = await fetchJson('/liv/api/conversations', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(body),
			})
			const id = extractConversationId(res)
			if (id) return id
			lastErr = new Error('create conversation: no id in response')
		} catch (e) {
			lastErr = e
		}
	}
	throw lastErr instanceof Error ? lastErr : new Error('create conversation failed')
}

/** POST /liv/api/conversations/{id}/messages — send the user prompt (+ optional files/skills). */
export async function sendLivMessage(
	conversationId: string,
	content: string,
	opts?: {files?: string[]; injectSkills?: string[]},
): Promise<void> {
	const files = opts?.files?.length ? opts.files : undefined
	// AionUi's ACP pipeline feeds ONLY `content` to the agent — the `files` array
	// is stored + shown in the message bubble but is NEVER turned into a model
	// content block (verified against iOfficeAI/AionCore `prompt_existing_session`,
	// which sends a single text ContentBlock from data.content; `data.files` is
	// dropped before the ACP call). So we ALSO embed the absolute path(s) in
	// `content` — exactly what AionUi's own Team mode does — and the agent
	// (Claude Code / Codex under ACP) opens each path with its file tools (incl.
	// reading an image). The `files` array is kept for the bubble + DB display.
	const contentWithFiles = files
		? `${content}\n\nAttached file${files.length > 1 ? 's' : ''} (open with your tools):\n${files.join('\n')}`
		: content
	const body: Record<string, unknown> = {content: contentWithFiles}
	if (files) body.files = files
	if (opts?.injectSkills?.length) body.inject_skills = opts.injectSkills
	await fetchJson(
		`/liv/api/conversations/${encodeURIComponent(conversationId)}/messages`,
		{
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify(body),
		},
	)
}

/** POST .../confirmations/{callId}/confirm — auto-approve a tool call. */
export async function confirmLivTool(
	conversationId: string,
	callId: string,
	opts?: {msgId?: string; data?: unknown},
): Promise<void> {
	try {
		await fetchJson(
			`/liv/api/conversations/${encodeURIComponent(conversationId)}/confirmations/${encodeURIComponent(callId)}/confirm`,
			{
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				// The confirm endpoint REQUIRES a `data` field carrying the chosen
				// option key (verified vs upstream ipcBridge.ts confirmation.confirm);
				// a boolean-only approval is ignored and the turn stays paused. Echo
				// the approve option's value resolved from the confirmation, falling
				// back to 'allow_always'.
				body: JSON.stringify({msg_id: opts?.msgId, data: opts?.data ?? 'allow_always', always_allow: true}),
			},
		)
	} catch {
		// Approval is best-effort; the caller's escape hatch (Open in Liv) covers
		// the case where the turn stays paused.
	}
}

/** One choice in a tool-approval prompt (confirmation.add `options[]`). */
export interface LivApprovalOption {
	/** Human label as AionUi sends it (e.g. "Allow", "Always allow", "Decline"). */
	label: string
	/** The value echoed back on confirm (option_id / value / id). */
	value: unknown
	/** Rough intent so the UI can style approve vs reject distinctly. */
	kind: 'approve' | 'reject' | 'other'
}

export interface LivStreamHandlers {
	/** Fired on every assistant text delta with the FULL accumulated text. */
	onText: (fullText: string) => void
	/** Turn finished (turn.completed). `fullText` is the final accumulated text. */
	onComplete: (fullText: string) => void
	/** A tool call needs approval (confirmation.add) — carries the full option set. */
	onApprovalNeeded?: (info: {
		callId?: string
		msgId?: string
		approveValue?: unknown
		title?: string
		options: LivApprovalOption[]
	}) => void
	/** A protocol/transport error. */
	onError: (message: string) => void
}

/**
 * Subscribes to AionUi's chat WebSocket for one conversation and accumulates
 * the streamed assistant reply. Open() resolves once the socket is connected
 * (subscribe BEFORE sending so early deltas aren't missed).
 */
export class LivCommandStream {
	private ws?: WebSocket
	private ping?: ReturnType<typeof setInterval>
	private readonly acc = new Map<string, string>()
	private readonly order: string[] = []
	private done = false

	constructor(
		private readonly conversationId: string,
		private readonly handlers: LivStreamHandlers,
	) {}

	open(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			let settled = false
			try {
				const proto = isHttps() ? 'wss' : 'ws'
				const ws = new WebSocket(`${proto}://${location.host}/ws`)
				this.ws = ws
				ws.onopen = () => {
					this.ping = setInterval(() => {
						try {
							ws.send(JSON.stringify({event: 'ping', payload: null}))
						} catch {
							/* socket closing */
						}
					}, 30_000)
					settled = true
					resolve()
				}
				ws.onmessage = (ev) => this.onFrame(ev)
				ws.onerror = () => {
					if (!settled) {
						settled = true
						reject(new Error('Liv stream connection failed'))
					} else {
						// Error AFTER the socket opened (mid-stream): terminal — route
						// to the caller's fallback instead of an infinite spinner.
						this.terminalError('Liv stream connection error')
					}
				}
				ws.onclose = () => {
					if (this.ping) clearInterval(this.ping)
					// A close before completion (e.g. AionUi reset the socket mid-turn)
					// is a terminal failure, not a silent end. No-op once done.
					this.terminalError('Liv stream closed before the turn finished')
				}
			} catch (e) {
				reject(e instanceof Error ? e : new Error('Liv stream connection failed'))
			}
		})
	}

	private fullText(): string {
		return this.order.map((id) => this.acc.get(id) ?? '').join('').trim()
	}

	private onFrame(ev: MessageEvent): void {
		if (typeof ev.data !== 'string') return
		let msg: Record<string, unknown>
		try {
			msg = JSON.parse(ev.data) as Record<string, unknown>
		} catch {
			return
		}
		const name = (msg.name ?? msg.event) as string | undefined
		const data = msg.data ?? msg.payload
		if (!name) return
		switch (name) {
			case 'message.stream':
				this.onResponseMessage(data as Record<string, unknown>)
				break
			case 'turn.completed':
				this.complete()
				break
			case 'confirmation.add': {
				const d = (data ?? {}) as Record<string, unknown>
				const raw = Array.isArray(d.options) ? (d.options as Array<Record<string, unknown>>) : []
				// Normalize every option to {label, value, kind} so the inline
				// approval UI can render real buttons (approve / reject / other).
				const options: LivApprovalOption[] = raw.map((o) => {
					const value = o.value ?? o.option_id ?? o.id
					const label = String(o.label ?? o.title ?? o.value ?? o.option_id ?? o.id ?? 'Option')
					const probe = `${String(value ?? '')} ${label}`.toLowerCase()
					const kind: LivApprovalOption['kind'] = /reject|deny|decline|cancel|\bno\b/.test(probe)
						? 'reject'
						: /allow|approve|accept|\byes\b/.test(probe)
							? 'approve'
							: 'other'
					return {label, value, kind}
				})
				// Prefer an allow/approve option; echo its value back on auto-confirm.
				const approve = options.find((o) => o.kind === 'approve') ?? options[0]
				this.handlers.onApprovalNeeded?.({
					callId: (d.call_id ?? d.id) as string | undefined,
					msgId: d.msg_id as string | undefined,
					approveValue: approve ? approve.value : undefined,
					title: (d.title ?? d.action) as string | undefined,
					options,
				})
				break
			}
			case 'error':
				this.terminalError(
					String(
						(data as Record<string, unknown>)?.message ??
							(data as Record<string, unknown>)?.error ??
							'Liv error',
					),
				)
				break
			default:
				break
		}
	}

	private onResponseMessage(m: Record<string, unknown> | undefined): void {
		if (!m || typeof m !== 'object') return
		// Ignore frames for other conversations on the shared WS. When a content
		// frame carries no conversation_id we accept it (getting the text matters
		// more than the rare cross-conversation merge — the bar runs one command
		// at a time and aborts the prior run).
		if (m.conversation_id && m.conversation_id !== this.conversationId) return
		const type = m.type as string | undefined
		// Assistant text streams as BOTH type:'content' AND type:'text' (verified
		// vs upstream useAcpMessage.ts `case 'text': case 'content':`).
		if (type === 'content' || type === 'text') {
			const delta = extractTextDelta(m.data)
			if (delta) {
				const msgId = String(m.msg_id ?? 'default')
				if (!this.acc.has(msgId)) this.order.push(msgId)
				const prev = this.acc.get(msgId) ?? ''
				const nested =
					m.data && typeof m.data === 'object'
						? (m.data as Record<string, unknown>).replace === true
						: false
				const replace = m.replace === true || nested
				this.acc.set(msgId, replace ? delta : prev + delta)
				this.handlers.onText(this.fullText())
			}
		} else if (type === 'error' || m.status === 'error') {
			this.terminalError(extractTextDelta(m.data) || 'Liv error')
			return
		}
		// The authoritative per-turn terminal signal is type:'finish' (data:null)
		// on message.stream (verified vs upstream useAcpMessage.ts `case 'finish':`).
		// The top-level `turn.completed` frame is a secondary, idempotent backstop.
		if (type === 'finish' || m.status === 'finish') {
			this.complete()
		}
	}

	private complete(): void {
		if (this.done) return
		this.done = true
		this.handlers.onComplete(this.fullText())
		this.close()
	}

	/** A terminal failure for this one-shot stream — fires onError exactly once. */
	private terminalError(message: string): void {
		if (this.done) return
		this.done = true
		this.handlers.onError(message)
		this.close()
	}

	close(): void {
		if (this.ping) clearInterval(this.ping)
		try {
			this.ws?.close()
		} catch {
			/* already closed */
		}
	}
}

export interface RunLivCommandOptions {
	prompt: string
	agentId?: string
	/** ACP model id (extra.current_model_id); omit = the agent's "Default Model". */
	modelId?: string
	/** Permission mode: default | plan | acceptEdits | bypassPermissions. Applied to a NEW conversation. */
	mode?: string
	/** Uploaded file paths to attach (from uploadLivFile). */
	files?: string[]
	/** Skill names to inject for this turn. */
	injectSkills?: string[]
	/** True when the mode auto-approves tool calls (bypassPermissions). */
	autoApprove: boolean
	/**
	 * Reuse an existing AionUi conversation for a same-session FOLLOW-UP. When
	 * set, skip the create call so the new turn lands in the same thread (AionUi
	 * Memory carries the context). When omitted, a fresh ACP conversation is
	 * created and reported via onConversation.
	 */
	conversationId?: string
}

export interface RunLivCommandCallbacks {
	/** Dispatch started — Liv is working. */
	onWorking: () => void
	/** A fresh conversation was created (only fired when no conversationId was reused). */
	onConversation?: (conversationId: string) => void
	/** Streamed assistant text so far. */
	onText: (fullText: string) => void
	/** Turn complete with the final text. */
	onDone: (fullText: string) => void
	/** Fatal error; `fallback` true means the caller should open the Liv window. */
	onError: (message: string, opts: {fallback: boolean}) => void
	/**
	 * A tool needs approval and auto-approve is OFF — render the prompt inline.
	 * `confirm(value)` sends the chosen option back to Liv and keeps the stream
	 * alive; the caller picks the option (approve / reject / …) from `options`.
	 */
	onApprovalNeeded: (info: {title?: string; options: LivApprovalOption[]; confirm: (value: unknown) => void}) => void
}

export interface LivCommandRun {
	abort: () => void
}

/**
 * Hard cap before we give up waiting for a SILENT stream and fall back. Re-armed
 * whenever a tool call is auto-approved (a tool may run for a while before it
 * emits any text), so a real, tool-heavy Auto-run command isn't killed mid-work.
 */
const NO_RESPONSE_TIMEOUT_MS = 45_000

/**
 * Orchestrates one command: prime → create → subscribe → send → stream → done,
 * with a launcher fallback on any failure (so a protocol mismatch on the box
 * degrades to "open Liv" rather than a dead bar).
 */
export function runLivCommand(
	opts: RunLivCommandOptions,
	cb: RunLivCommandCallbacks,
): LivCommandRun {
	let stream: LivCommandStream | undefined
	let aborted = false
	let gotText = false
	let silenceTimer: ReturnType<typeof setTimeout> | undefined

	const clearTimer = () => {
		if (silenceTimer) {
			clearTimeout(silenceTimer)
			silenceTimer = undefined
		}
	}
	const fail = (message: string) => {
		if (aborted) return
		aborted = true
		clearTimer()
		stream?.close()
		cb.onError(message, {fallback: true})
	}
	// Arm (or re-arm) the no-response watchdog. Called once after the prompt is
	// sent and again each time a tool is auto-approved (work is in progress, so
	// reset the countdown). Once any text arrives the timer is cleared for good
	// (gotText), so this only guards a genuinely silent stream.
	const armSilenceTimer = () => {
		clearTimer()
		silenceTimer = setTimeout(() => {
			if (!gotText) fail('Liv did not respond in time.')
		}, NO_RESPONSE_TIMEOUT_MS)
	}

	void (async () => {
		cb.onWorking()
		try {
			await primeLivSession()
			if (aborted) return
			const isNew = !opts.conversationId
			let conversationId = opts.conversationId ?? ''
			if (isNew) {
				conversationId = await createLivConversation(opts.agentId, opts.modelId)
				cb.onConversation?.(conversationId)
			}
			if (aborted) return
			// Apply the permission mode (best-effort). A fresh conversation starts at
			// 'default', so only push a non-default choice there; a follow-up always
			// pushes so a mid-session mode change (incl. back to default) takes effect.
			if (opts.mode && (!isNew || opts.mode !== 'default')) {
				await applyLivMode(conversationId, opts.mode)
			}
			if (aborted) return
			stream = new LivCommandStream(conversationId, {
				onText: (full) => {
					if (aborted) return
					gotText = true
					clearTimer()
					cb.onText(full)
				},
				onComplete: (full) => {
					if (aborted) return
					aborted = true
					clearTimer()
					cb.onDone(
						full || '(Liv finished without a text reply — open Liv to see details.)',
					)
				},
				onApprovalNeeded: ({callId, msgId, approveValue, title, options}) => {
					if (aborted) return
					if (opts.autoApprove && callId) {
						// Auto-approve and keep streaming. Re-arm the watchdog: the
						// approved tool may run a while before any text, and we must
						// not bail to "Open in Liv" while it's actually working.
						void confirmLivTool(conversationId, callId, {msgId, data: approveValue})
						armSilenceTimer()
					} else {
						// Surface the prompt inline. `confirm(value)` echoes the chosen
						// option back to Liv and re-arms the watchdog so the resumed
						// turn isn't killed while the (now approved) tool runs.
						cb.onApprovalNeeded({
							title,
							options,
							confirm: (value) => {
								if (callId) void confirmLivTool(conversationId, callId, {msgId, data: value})
								armSilenceTimer()
							},
						})
					}
				},
				onError: (m) => fail(m),
			})
			await stream.open()
			if (aborted) {
				stream.close()
				return
			}
			armSilenceTimer()
			await sendLivMessage(conversationId, opts.prompt, {
				files: opts.files,
				injectSkills: opts.injectSkills,
			})
		} catch (e) {
			fail(e instanceof Error ? e.message : 'Could not reach Liv.')
		}
	})()

	return {
		abort: () => {
			aborted = true
			clearTimer()
			stream?.close()
		},
	}
}
