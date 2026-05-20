// Phase 167-02 — CcPtyWsClient
//
// Browser-side WebSocket client for the Phase 166 `/ws/cc-pty` endpoint.
// Speaks the envelope protocol shipped by Plan 166-04's ws-handler:
//
//   Client → server: {type:'attach'|'stdin'|'resize'|'detach', ...}
//   Server → client: {type:'attached'|'stdout'|'error'|'exited', ...}
//
// Stdout `data` field is base64-encoded — decoded via atob() before
// forwarding to opts.onStdout(decoded). NOTE: server field name is `data`
// per Plan 166-04 ws-handler ('chunk.toString("base64")') — the
// 167-CONTEXT.md "payload" wording was a documentation drift; client
// matches the server's actual on-the-wire shape.
//
// Reconnect policy: exponential backoff [250, 500, 1000, 2000, 4000] ms,
// max 5 attempts. After the 5th failed reconnect the client calls
// opts.onClose() and stays closed. The `detached` flag is set by an
// explicit detach() call to suppress reconnection of intentional closes.

export interface AttachedEnvelope {
	session: {id: string; pid: number; cols: number; rows: number}
}

export interface CcPtyWsClientOpts {
	url: string
	sessionId: string
	onStdout: (data: string) => void
	onAttached: (env: AttachedEnvelope) => void
	onError: (msg: string) => void
	onClose?: () => void
}

export class CcPtyWsClient {
	private ws: WebSocket | null = null
	private reconnectAttempts = 0
	private maxReconnects = 5
	private detached = false
	private static readonly BACKOFF_MS = [250, 500, 1000, 2000, 4000]
	private static readonly MAX_STDIN_BYTES = 64 * 1024

	constructor(private opts: CcPtyWsClientOpts) {
		this.connect()
	}

	private connect(): void {
		const ws = new WebSocket(this.opts.url)
		this.ws = ws
		ws.onopen = () => {
			this.reconnectAttempts = 0
			ws.send(JSON.stringify({type: 'attach', sessionId: this.opts.sessionId}))
		}
		ws.onmessage = (ev) => {
			let env: any
			try {
				env = JSON.parse(ev.data as string)
			} catch {
				this.opts.onError('invalid json frame')
				return
			}
			if (env.type === 'stdout' && typeof env.data === 'string') {
				try {
					// Phase 167.2 hotfix — `atob` returns a binary string treating each
					// byte as a single Latin-1 code-point, which corrupts multi-byte
					// UTF-8 sequences (Turkish ş/ç/ı/ğ/ü/ö, emoji, box-drawing chars
					// in claude's TUI). Decode into a Uint8Array and run it through
					// TextDecoder so the stream xterm.js receives is the same UTF-8
					// payload the PTY emitted.
					const bytes = Uint8Array.from(atob(env.data), (c) => c.charCodeAt(0))
					this.opts.onStdout(new TextDecoder('utf-8', {fatal: false}).decode(bytes))
				} catch {
					this.opts.onError('invalid base64 stdout payload')
				}
			} else if (env.type === 'attached' && env.session) {
				this.opts.onAttached({session: env.session})
			} else if (env.type === 'error') {
				this.opts.onError(env.message || 'unknown server error')
			} else if (env.type === 'exited') {
				this.opts.onError(`session exited code=${env.code}`)
			}
		}
		ws.onclose = () => {
			if (this.detached) {
				this.opts.onClose?.()
				return
			}
			if (this.reconnectAttempts >= this.maxReconnects) {
				this.opts.onError('reconnect attempts exhausted')
				this.opts.onClose?.()
				return
			}
			const delay = CcPtyWsClient.BACKOFF_MS[this.reconnectAttempts]
			this.reconnectAttempts += 1
			setTimeout(() => {
				if (!this.detached) this.connect()
			}, delay)
		}
		ws.onerror = () => {
			/* close handler will run */
		}
	}

	sendStdin(data: string): void {
		if (this.ws?.readyState !== WebSocket.OPEN) return
		const bytes = new TextEncoder().encode(data).length
		if (bytes > CcPtyWsClient.MAX_STDIN_BYTES) {
			this.opts.onError(`stdin chunk too large (${bytes} bytes)`)
			return
		}
		this.ws.send(JSON.stringify({type: 'stdin', data}))
	}

	sendResize(cols: number, rows: number): void {
		if (this.ws?.readyState !== WebSocket.OPEN) return
		this.ws.send(JSON.stringify({type: 'resize', cols, rows}))
	}

	detach(): void {
		this.detached = true
		if (this.ws?.readyState === WebSocket.OPEN) {
			try {
				this.ws.send(JSON.stringify({type: 'detach'}))
			} catch {
				/* ignore */
			}
		}
		this.ws?.close()
	}
}
