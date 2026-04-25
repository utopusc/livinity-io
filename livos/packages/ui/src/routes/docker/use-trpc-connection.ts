// Phase 24-02 — WebSocket connection state poll for the StatusBar Live pill.
//
// Polls wsClient.getConnection()?.readyState every pollMs (default 1000ms).
// Returns {connected: boolean} where connected === (readyState === OPEN).
//
// Why polling instead of an event listener: tRPC's WebSocket client recreates
// the underlying WebSocket on reconnect, so an addEventListener('open'/'close')
// listener registered against the initial WS instance goes stale after the
// first reconnect. Polling readyState always reads the current instance and
// is the simpler correct approach for v1.
//
// Why the `(wsClient as any).getConnection` cast: tRPC v11's
// TRPCWebSocketClient does not expose .getConnection() on its public type,
// even though the runtime method exists. The cast is documented for a future
// tRPC v12 upgrade — once getConnection() is on the public type, the cast
// can be removed and Phase 29's polish task can swap polling for a proper
// observable if v12 ships one.

import {useEffect, useState} from 'react'

import {wsClient} from '@/trpc/trpc'

/**
 * Polls wsClient.getConnection()?.readyState every pollMs (default 1000ms).
 * Used by the docker-app StatusBar Live indicator. v1 polling — Phase 29
 * polish task can swap for a proper observable once tRPC v12 ships
 * .getConnection() on the public type.
 */
export function useTrpcConnection(pollMs: number = 1000): {connected: boolean} {
	const [connected, setConnected] = useState(false)
	useEffect(() => {
		const tick = () => {
			// tRPC v11 wsClient exposes getConnection() — types are private; cast to any.
			const ws = (wsClient as unknown as {getConnection?: () => WebSocket | undefined})
				.getConnection?.()
			setConnected(ws?.readyState === WebSocket.OPEN)
		}
		tick() // initial sync
		const id = setInterval(tick, pollMs)
		return () => clearInterval(id)
	}, [pollMs])
	return {connected}
}
