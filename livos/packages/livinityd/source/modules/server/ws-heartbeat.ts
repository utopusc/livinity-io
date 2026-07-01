import type WebSocket from 'ws'

// Reliability A5 — WS heartbeat for idle-prone connections, applied at the
// UPGRADE SEAM where we still hold the raw `ws` socket (the bridge classes
// further down — VncBridgeSocket / SubscriberSocket — expose no .ping()).
//
// Why: the browser↔box chain (CF edge → cloudflared → Caddy → :8080) reaps
// quiet connections (~100s at the CF edge; consumer NAT expires idle flows in
// 30-90s). A VNC/stream/voice socket can be legitimately silent for minutes;
// without protocol pings every such socket dies with an opaque browser-side
// 1006. The proven 30s ping/pong already existed on the chatty docker-logs
// socket (docker-logs-socket.ts) — this applies the same discipline where it
// is actually needed. Browsers answer pings with pongs automatically, so the
// liveness check is peer-agnostic.
//
// Heartbeat the CLIENT side only: the upstream leg of proxy pairs is
// loopback (no reaper on 127.0.0.1) and dies with the client via the
// existing close-propagation wiring.

export function attachWsHeartbeat(ws: WebSocket, {pingMs = 30_000}: {pingMs?: number} = {}): void {
	let alive = true
	ws.on('pong', () => {
		alive = true
	})
	const timer = setInterval(() => {
		if (ws.readyState !== ws.OPEN) return
		if (!alive) {
			// Two missed intervals with no pong — the peer is gone; free the
			// socket so reapers/bridges see a clean close instead of a zombie.
			ws.terminate()
			return
		}
		alive = false
		try {
			ws.ping()
		} catch {
			// socket mid-close — the close handler below clears the timer
		}
	}, pingMs)
	timer.unref?.()
	ws.on('close', () => clearInterval(timer))
}
