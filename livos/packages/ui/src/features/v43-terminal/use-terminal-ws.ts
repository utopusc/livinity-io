/**
 * Phase 243-03 + Phase 246-04 — Persistent UI Terminal WebSocket hook.
 *
 * Encapsulates the WS lifecycle for one `PersistentTerminalPanel` tab:
 *   - Open WS to `/livos/terminal/ws` (cookie auth, no ?token query)
 *   - In v44 (Plan 246-04) the URL grows a `?attach=<id>` query when the
 *     hook is constructed in attach mode — Phase 243 `?create` path is
 *     the default (no query, matches 246-03 backward-compat default
 *     branch in livinityd's ws-handler).
 *   - JSON parse every inbound `event.data`; malformed → onMessage with
 *     {type:'error', message:'parse error'}
 *   - `send` JSON.stringifies and guards on `readyState === OPEN`; silently
 *     drops sends when not open (e.g. before-open keystrokes during init).
 *   - useEffect cleanup closes the WS — note: from 246-03 ws.close() no
 *     longer kills the server-side session (PTY survives reload).
 *
 * Protocol mirrors 243-02 + 246-03 SUMMARY (drift-locked):
 *   Client → Server: 'init' | 'data' | 'resize' | 'close'
 *   Server → Client: 'ready' | 'reattached' | 'data' | 'exit' | 'error'
 */
import {useEffect, useRef, useState} from 'react'

export type ClientToServer =
	| {type: 'init'; cols: number; rows: number; cwd?: string}
	| {type: 'data'; data: string}
	| {type: 'resize'; cols: number; rows: number}
	| {type: 'close'}

export type ServerToClient =
	| {type: 'ready'; sessionId: string}
	| {type: 'reattached'; sessionId: string; scrollback: string[]}
	| {type: 'data'; data: string}
	| {type: 'exit'; code: number; signal: string | null}
	| {type: 'error'; message: string}

export type TerminalWsMode = 'create' | 'attach'

export interface UseTerminalWsOpts {
	mode?: TerminalWsMode
	sessionId?: string
	onMessage: (msg: ServerToClient) => void
	onOpen?: () => void
	onClose?: (event?: CloseEvent) => void
}

export interface UseTerminalWsResult {
	send: (msg: ClientToServer) => void
	readyState: number
}

/**
 * Build the WS URL for `/livos/terminal/ws` relative to the current host.
 * JWT travels via cookie automatically (Phase 243-02 cookie-only auth).
 *
 * Phase 246-04 extension:
 *   - mode 'create' (or no mode) → no query (243-02 path; routes to the
 *     CREATE branch in livinityd's ws-handler per 246-03 default rule)
 *   - mode 'attach' WITH sessionId → `?attach=<encoded sessionId>` (routes
 *     to the ATTACH branch which emits `{type:'reattached', scrollback}`)
 */
export function buildTerminalWsUrl(mode: TerminalWsMode = 'create', sessionId?: string): string {
	const wsProtocol =
		typeof window !== 'undefined' && window.location.protocol === 'https:'
			? 'wss://'
			: 'ws://'
	const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
	const port =
		typeof window !== 'undefined' && window.location.port ? `:${window.location.port}` : ''
	const base = `${wsProtocol}${hostname}${port}/livos/terminal/ws`
	if (mode === 'attach' && sessionId) {
		return `${base}?attach=${encodeURIComponent(sessionId)}`
	}
	return base
}

export function useTerminalWs(opts: UseTerminalWsOpts): UseTerminalWsResult {
	const wsRef = useRef<WebSocket | null>(null)
	const [readyState, setReadyState] = useState<number>(
		typeof WebSocket !== 'undefined' ? WebSocket.CONNECTING : 0,
	)

	// Stash callbacks in refs so the effect can be one-shot without
	// re-tearing-down the socket on every parent rerender.
	const onMessageRef = useRef(opts.onMessage)
	const onOpenRef = useRef(opts.onOpen)
	const onCloseRef = useRef(opts.onClose)
	onMessageRef.current = opts.onMessage
	onOpenRef.current = opts.onOpen
	onCloseRef.current = opts.onClose

	const mode = opts.mode ?? 'create'
	const sessionId = opts.sessionId

	useEffect(() => {
		const url = buildTerminalWsUrl(mode, sessionId)
		const ws = new WebSocket(url)
		wsRef.current = ws
		setReadyState(ws.readyState)

		ws.onopen = () => {
			setReadyState(ws.readyState)
			onOpenRef.current?.()
		}

		ws.onmessage = (event: MessageEvent) => {
			let parsed: ServerToClient
			try {
				parsed = JSON.parse(typeof event.data === 'string' ? event.data : '') as ServerToClient
			} catch {
				onMessageRef.current({type: 'error', message: 'parse error'})
				return
			}
			onMessageRef.current(parsed)
		}

		ws.onerror = () => {
			// Surface as inline error; the close handler will fire next.
			onMessageRef.current({type: 'error', message: 'websocket error'})
		}

		ws.onclose = (event: CloseEvent) => {
			setReadyState(ws.readyState)
			onCloseRef.current?.(event)
		}

		return () => {
			try {
				ws.close()
			} catch {
				// no-op — already closed.
			}
			wsRef.current = null
		}
		// Effect depends on (mode, sessionId) — reopen if either changes.
		// In practice the parent panel doesn't mutate them after mount;
		// each tab pane keeps its own hook instance with stable args.
	}, [mode, sessionId])

	function send(msg: ClientToServer): void {
		const ws = wsRef.current
		if (!ws) return
		if (ws.readyState !== WebSocket.OPEN) return
		try {
			ws.send(JSON.stringify(msg))
		} catch {
			// Drop silently; the close handler will surface state changes.
		}
	}

	return {send, readyState}
}
