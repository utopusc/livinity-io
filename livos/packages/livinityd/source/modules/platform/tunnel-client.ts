/**
 * TunnelClient — Phase 146 Supabase Realtime presence wrapper
 *
 * Before Phase 146: opened ws://livinity.io:4000, ran an HTTP/WS proxy for
 * the user's subdomain, forwarded device events, handled domain sync. 872 LOC.
 *
 * After Phase 146 (~60 LOC):
 *   - Online status: Supabase Realtime presence channel via TunnelPresence
 *   - Inbound HTTP/WS for <user>.livinity.io: handled by CF Tunnel +
 *     livinityd's local cloudflared connector (port 8080 → user's apps).
 *     Nothing for tunnel-client.ts to do here anymore.
 *   - Device events: stub (Phase 148 will route via Supabase Broadcast)
 *   - Domain sync: stub (Phase 149 will route via Supabase channel or
 *     server-pushed via /api/me/domains)
 *
 * Public TunnelClient surface PRESERVED for livinityd/source/index.ts:
 *   - constructor({redis, relayUrl?, logger?})
 *   - setDeviceBridge(bridge)
 *   - sendDeviceMessage(msg)  — no-op stub; logs at verbose
 *   - start() / stop() / disconnect() / connect()
 *   - getStatus()
 *
 * Type re-exports PRESERVED (added in W3-T1.5):
 *   TunnelDeviceConnected, TunnelDeviceDisconnected, TunnelDeviceToolResult,
 *   TunnelDeviceAuditEvent, TunnelDeviceEmergencyStop, LegacyDeviceMessage.
 * Downstream consumers can keep importing them from './tunnel-client.js'.
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */
import type {Redis} from 'ioredis'
import {TunnelPresence, type TunnelPresenceSnapshot} from './tunnel-presence.js'

export {
	type TunnelDeviceConnected,
	type TunnelDeviceDisconnected,
	type TunnelDeviceToolResult,
	type TunnelDeviceAuditEvent,
	type TunnelDeviceEmergencyStop,
	type LegacyDeviceMessage,
} from './legacy-device-types.js'

type Logger = {
	log: (...args: unknown[]) => void
	error: (...args: unknown[]) => void
}

export interface TunnelClientOptions {
	redis: Redis
	/** Ignored post-Phase-146 — kept for type compat with older callers. */
	relayUrl?: string
	logger?: Logger
}

export default class TunnelClient {
	private readonly presence: TunnelPresence
	private readonly logger: Logger
	private _deviceBridge: unknown = null

	constructor({redis, logger}: TunnelClientOptions) {
		this.logger = logger ?? {log: console.log, error: console.error}
		this.presence = new TunnelPresence({
			redis,
			version: process.env.LIVINITYD_VERSION ?? '146.0.0',
			logger: this.logger,
		})
	}

	setDeviceBridge(bridge: unknown): void {
		this._deviceBridge = bridge
		// Phase 148 will wire bridge.* to Supabase Broadcast. For now: no-op.
	}

	/**
	 * Phase 148 will route this via Supabase Broadcast. Phase 146: no-op
	 * stub — the relay path is gone, no replacement yet.
	 */
	sendDeviceMessage(msg: Record<string, unknown>): void {
		void this._deviceBridge
		this.logger.log(
			`[tunnel] (stub) sendDeviceMessage type=${msg.type ?? 'unknown'} dropped (Phase 148 will route via Supabase Broadcast)`,
		)
	}

	async start(): Promise<void> {
		await this.presence.start()
	}

	async connect(): Promise<void> {
		await this.presence.start()
	}

	async disconnect(): Promise<void> {
		await this.presence.stop()
	}

	async stop(): Promise<void> {
		await this.presence.stop()
	}

	getStatus(): TunnelPresenceSnapshot {
		return this.presence.getSnapshot()
	}
}
