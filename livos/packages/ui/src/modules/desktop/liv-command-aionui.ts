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
 *      deltas (type 'content'), `turn.completed` ends the turn,
 *      `confirmation.add` is a tool-approval prompt.
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
			return {id, name}
		})
		.filter((a) => a.id.length > 0)
}

/**
 * POST /liv/api/conversations — create an ephemeral ACP conversation.
 * Tries with the chosen agent first, then without (best-effort agent select).
 */
export async function createLivConversation(agentId?: string): Promise<string> {
	const base: Record<string, unknown> = {type: 'acp', name: 'Liv command'}
	const attempts: Record<string, unknown>[] = agentId
		? [{...base, extra: {agent_id: agentId}}, base]
		: [base]
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

/** POST /liv/api/conversations/{id}/messages — send the user prompt. */
export async function sendLivMessage(conversationId: string, content: string): Promise<void> {
	await fetchJson(
		`/liv/api/conversations/${encodeURIComponent(conversationId)}/messages`,
		{
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({content}),
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

export interface LivStreamHandlers {
	/** Fired on every assistant text delta with the FULL accumulated text. */
	onText: (fullText: string) => void
	/** Turn finished (turn.completed). `fullText` is the final accumulated text. */
	onComplete: (fullText: string) => void
	/** A tool call needs approval (confirmation.add). */
	onApprovalNeeded?: (info: {callId?: string; msgId?: string; approveValue?: unknown; title?: string}) => void
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
				const options = Array.isArray(d.options) ? (d.options as Array<Record<string, unknown>>) : []
				// Prefer an allow/approve option; echo its value back on confirm.
				const approve =
					options.find((o) => /allow|approve|yes/i.test(String(o.value ?? o.option_id ?? o.id ?? o.label ?? ''))) ??
					options[0]
				this.handlers.onApprovalNeeded?.({
					callId: (d.call_id ?? d.id) as string | undefined,
					msgId: d.msg_id as string | undefined,
					approveValue: approve ? (approve.value ?? approve.option_id ?? approve.id) : undefined,
					title: (d.title ?? d.action) as string | undefined,
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
	autoApprove: boolean
}

export interface RunLivCommandCallbacks {
	/** Dispatch started — Liv is working. */
	onWorking: () => void
	/** Streamed assistant text so far. */
	onText: (fullText: string) => void
	/** Turn complete with the final text. */
	onDone: (fullText: string) => void
	/** Fatal error; `fallback` true means the caller should open the Liv window. */
	onError: (message: string, opts: {fallback: boolean}) => void
	/** A tool needs approval and auto-approve is OFF — surface the escape hatch. */
	onApprovalNeeded: () => void
}

export interface LivCommandRun {
	abort: () => void
}

/** Hard cap before we give up waiting for a silent stream and fall back. */
const NO_RESPONSE_TIMEOUT_MS = 20_000

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

	void (async () => {
		cb.onWorking()
		try {
			await primeLivSession()
			if (aborted) return
			const conversationId = await createLivConversation(opts.agentId)
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
				onApprovalNeeded: ({callId, msgId, approveValue}) => {
					if (aborted) return
					if (opts.autoApprove && callId) {
						void confirmLivTool(conversationId, callId, {msgId, data: approveValue})
					} else {
						cb.onApprovalNeeded()
					}
				},
				onError: (m) => fail(m),
			})
			await stream.open()
			if (aborted) {
				stream.close()
				return
			}
			silenceTimer = setTimeout(() => {
				if (!gotText) fail('Liv did not respond in time.')
			}, NO_RESPONSE_TIMEOUT_MS)
			await sendLivMessage(conversationId, opts.prompt)
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
