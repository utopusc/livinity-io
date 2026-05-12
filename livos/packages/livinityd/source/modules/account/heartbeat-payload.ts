// livos/packages/livinityd/source/modules/account/heartbeat-payload.ts
//
// Phase 104 plan 104-10 — pure heartbeat payload builder.
//
// Snapshots LivOS box state into a small JSON envelope that the heartbeat
// sender POSTs to `https://livinity.io/api/devices/heartbeat`. Pure
// function (no I/O) so it's trivially unit-testable: callers pass in the
// device_id (from device-id.ts), mode (Redis `livos:domain:local_mode`),
// version (livinityd's package.json), and we read the rest off `os`/process.
//
// Payload shape is forward-compatible with the Server5 `devices` table from
// 104-09 audit (id, user_id, device_id uuid, device_name, platform, version,
// last_seen, revoked). New fields here (uptime, ip, node_version) are
// metadata Server5 may surface on the future dashboard but won't reject if
// the endpoint shape evolves.
//
// SECURITY: the API key is NEVER embedded in the body — it travels in the
// `X-Api-Key` HTTP header (heartbeat-sender.ts). This keeps body content
// safe to log for debugging at warn-level.

import os from 'node:os'

export interface HeartbeatPayload {
	readonly device_id: string
	readonly hostname: string
	readonly mode: string
	readonly version: string
	readonly ip: string | null
	readonly uptime: number
	readonly node_version: string
}

export interface HeartbeatPayloadInputs {
	readonly deviceId: string
	readonly mode: string
	readonly version: string
	// Optional overrides for testability (production callers pass nothing).
	readonly hostname?: string
	readonly ip?: string | null
	readonly uptime?: number
	readonly nodeVersion?: string
}

/**
 * Find the first non-internal IPv4 address on this host. Returns null if no
 * such interface exists (rare: a fresh container with only `lo`).
 *
 * On a typical Mini PC / Docker UAT box this returns the LAN IP (e.g.
 * `192.168.1.100` or `172.28.0.1` inside Docker). For Server5 dashboard
 * widgets this is enough to ping/diagnose the box — Server5 doesn't
 * actually try to reach this IP (D-104-RELAY-ZERO-DATA-PLANE: traffic
 * stays LAN-direct).
 */
export function detectPrimaryIPv4(): string | null {
	const interfaces = os.networkInterfaces()
	for (const name of Object.keys(interfaces)) {
		const addrs = interfaces[name] ?? []
		for (const addr of addrs) {
			if (addr.family === 'IPv4' && !addr.internal) {
				return addr.address
			}
		}
	}
	return null
}

/**
 * Build the heartbeat payload. Pure: no Redis, no fs, no network. All
 * non-determinism is in optional overrides (defaults: os.hostname,
 * detectPrimaryIPv4, process.uptime, process.version).
 */
export function buildHeartbeatPayload(inputs: HeartbeatPayloadInputs): HeartbeatPayload {
	return {
		device_id: inputs.deviceId,
		hostname: inputs.hostname ?? os.hostname(),
		mode: inputs.mode,
		version: inputs.version,
		ip: inputs.ip === undefined ? detectPrimaryIPv4() : inputs.ip,
		uptime: inputs.uptime ?? Math.floor(process.uptime()),
		node_version: inputs.nodeVersion ?? process.version,
	}
}
