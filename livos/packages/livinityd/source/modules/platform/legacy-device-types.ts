/**
 * legacy-device-types.ts — Phase 146 W3-T1.5
 *
 * Interfaces extracted from tunnel-client.ts BEFORE the W3-T2 rewrite that
 * drops the ws://livinity.io:4000 codepath. These types described the
 * wire-protocol messages livinityd's TunnelClient used to forward between
 * the relay and the local DeviceBridge.
 *
 * Why they survive Phase 146: the DeviceBridge module + any downstream
 * consumers may still reference them as structural shapes for in-process
 * events even though the wire protocol is dead. Phase 148 will route the
 * live versions of these messages through Supabase Broadcast — at that
 * point this file either grows (becomes the canonical home) or gets
 * replaced by a shared schema package. For Phase 146 it's just a holding
 * pen so the W3-T2 rewrite can stay focused on behavior.
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */

export interface TunnelDeviceConnected {
	type: 'device_connected'
	userId: string  // Phase 11 OWN-03: device owner forwarded from relay
	deviceId: string
	deviceName: string
	platform: string
	tools: string[]
}

export interface TunnelDeviceDisconnected {
	type: 'device_disconnected'
	deviceId: string
}

export interface TunnelDeviceToolResult {
	type: 'device_tool_result'
	requestId: string
	deviceId: string
	result: {success: boolean; output: string; error?: string; data?: unknown; images?: Array<{base64: string; mimeType: string}>}
}

export interface TunnelDeviceAuditEvent {
	type: 'device_audit_event'
	deviceId: string
	timestamp: string
	toolName: string
	params: Record<string, unknown>
	success: boolean
	duration: number
	error?: string
}

export interface TunnelDeviceEmergencyStop {
	type: 'device_emergency_stop'
	deviceId: string
	timestamp: string
	reason: string
}

export type LegacyDeviceMessage =
	| TunnelDeviceConnected
	| TunnelDeviceDisconnected
	| TunnelDeviceToolResult
	| TunnelDeviceAuditEvent
	| TunnelDeviceEmergencyStop
