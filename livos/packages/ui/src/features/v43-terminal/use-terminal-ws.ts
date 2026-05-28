/**
 * Phase 243-03 — Persistent UI Terminal WebSocket hook.
 *
 * Encapsulates the WS lifecycle for `PersistentTerminalPanel`:
 *   - Open WS to `/livos/terminal/ws` on mount (cookie auth, no ?token query)
 *   - JSON parse every inbound `event.data`; malformed → onMessage with
 *     {type:'error', message:'parse error'}
 *   - `send` JSON.stringifies and guards on `readyState === OPEN`; silently
 *     drops sends when not open (e.g. before-open keystrokes during init).
 *   - useEffect cleanup closes the WS — Phase 243-02 contract: ws.close()
 *     alone kills the server-side PtySession via the WS close handler.
 *
 * Protocol mirrors 243-02 SUMMARY (drift-locked):
 *   Client → Server: 'init' | 'data' | 'resize' | 'close'
 *   Server → Client: 'ready' | 'data' | 'exit' | 'error'
 */
import {useEffect, useRef, useState} from 'react'

export type ClientToServer =
	| {type: 'init'; cols: number; rows: number; cwd?: string}
	| {type: 'data'; data: string}
	| {type: 'resize'; cols: number; rows: number}
	| {type: 'close'}

export type ServerToClient =
	| {type: 'ready'; sessionId: string}
	| {type: 'data'; data: string}
	| {type: 'exit'; code: number; signal: string | null}
	| {type: 'error'; message: string}

export interface UseTerminalWsOpts {
	onMessage: (msg: ServerToClient) => void
	onOpen?: () => void
	onClose?: () => void
}

export interface UseTerminalWsResult {
	send: (msg: ClientToServer) => void
	readyState: number
}

/**
 * Build the WS URL for `/livos/terminal/ws` relative to the current host.
 * JWT travels via cookie automatically (Phase 243-02 cookie-only auth — NO
 * ?token query-string fallback, clean break from the legacy /terminal
 * handler).
 */
function buildTerminalWsUrl(): string {
	const wsProtocol =
		typeof window !== 'undefined' && window.location.protocol === 'https:'
			? 'wss://'
			: 'ws://'
	const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
	const port =
		typeof window !== 'undefined' && window.location.port ? `:${window.location.port}` : ''
	return `${wsProtocol}${hostname}${port}/livos/terminal/ws`
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

	useEffect(() => {
		const url = buildTerminalWsUrl()
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

		ws.onclose = () => {
			setReadyState(ws.readyState)
			onCloseRef.current?.()
		}

		return () => {
			try {
				ws.close()
			} catch {
				// no-op — already closed.
			}
			wsRef.current = null
		}
		// One-shot mount/unmount; callback refs handle latest closures.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

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
