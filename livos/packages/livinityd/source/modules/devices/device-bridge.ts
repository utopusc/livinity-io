/**
 * DeviceBridge -- Manages device proxy tool lifecycle in Nexus ToolRegistry.
 *
 * Listens for device_connected/device_disconnected events from the tunnel WebSocket,
 * registers/unregisters proxy tools in Nexus via HTTP API, handles tool execution
 * routing through the tunnel to the relay to the device agent.
 */

import {randomUUID} from 'node:crypto'
import type {Redis} from 'ioredis'

import {authorizeDeviceAccess} from './authorize.js'
import {recordDeviceEvent} from './audit-pg.js'

// Tool parameter definitions for each device tool (matches agent/src/tools.ts TOOL_NAMES)
const DEVICE_TOOL_SCHEMAS: Record<
	string,
	{description: string; parameters: Array<{name: string; type: string; description: string; required: boolean}>}
> = {
	shell: {
		// Phase 13 SHELL-01: this description is surfaced to the AI at proxy-tool
		// registration (see onDeviceConnected). Describing the ownership constraint
		// here prevents the agent from passing spurious device_id params or
		// targeting unowned devices — cross-user device IDs are rejected
		// server-side by authorizeDeviceAccess before any tunnel message is sent.
		description:
			'Execute a shell command on a specific owned device. This tool is bound at registration to ONE device you own; cross-user targeting is impossible (the server verifies ownership on every call and rejects unauthorized invocations with device_not_owned). Do not pass a device_id parameter — the device is implicit in the tool name.',
		parameters: [
			{name: 'command', type: 'string', description: 'Shell command to execute', required: true},
			{name: 'cwd', type: 'string', description: 'Working directory (optional)', required: false},
			{name: 'timeout', type: 'number', description: 'Timeout in ms (default 30000)', required: false},
		],
	},
	files_list: {
		description: 'List directory contents',
		parameters: [{name: 'path', type: 'string', description: 'Directory path to list', required: true}],
	},
	files_read: {
		description: 'Read file contents',
		parameters: [{name: 'path', type: 'string', description: 'File path to read', required: true}],
	},
	files_write: {
		description: 'Write content to a file',
		parameters: [
			{name: 'path', type: 'string', description: 'File path to write', required: true},
			{name: 'content', type: 'string', description: 'Content to write', required: true},
		],
	},
	files_delete: {
		description: 'Delete a file',
		parameters: [{name: 'path', type: 'string', description: 'File path to delete', required: true}],
	},
	files_rename: {
		description: 'Rename/move a file',
		parameters: [
			{name: 'oldPath', type: 'string', description: 'Current file path', required: true},
			{name: 'newPath', type: 'string', description: 'New file path', required: true},
		],
	},
	processes: {
		description: 'List running processes with CPU and memory usage',
		parameters: [
			{name: 'sortBy', type: 'string', description: 'Sort by "cpu" or "memory" (default: cpu)', required: false},
			{name: 'limit', type: 'number', description: 'Max processes to return (default: 20)', required: false},
		],
	},
	system_info: {
		description: 'Get system information: OS, CPU, RAM, disk usage, network, uptime',
		parameters: [],
	},
	screenshot: {
		description: 'Capture a screenshot of the display. Returns JPEG image with coordinate metadata (dimensions, scaling factor, monitor bounds, active window).',
		parameters: [
			{name: 'display', type: 'number', description: 'Display index (default: primary)', required: false},
		],
	},
	screen_info: {
		description: 'Get screen/display information: resolution, scaling factor, display count, and active window title/position',
		parameters: [],
	},
	mouse_click: {
		description: 'Left-click the mouse at screen coordinates',
		parameters: [
			{name: 'x', type: 'number', description: 'X coordinate (pixels from left)', required: true},
			{name: 'y', type: 'number', description: 'Y coordinate (pixels from top)', required: true},
		],
	},
	mouse_double_click: {
		description: 'Double-click the mouse at screen coordinates',
		parameters: [
			{name: 'x', type: 'number', description: 'X coordinate', required: true},
			{name: 'y', type: 'number', description: 'Y coordinate', required: true},
		],
	},
	mouse_right_click: {
		description: 'Right-click the mouse at screen coordinates',
		parameters: [
			{name: 'x', type: 'number', description: 'X coordinate', required: true},
			{name: 'y', type: 'number', description: 'Y coordinate', required: true},
		],
	},
	mouse_move: {
		description: 'Move the mouse cursor to screen coordinates without clicking',
		parameters: [
			{name: 'x', type: 'number', description: 'X coordinate', required: true},
			{name: 'y', type: 'number', description: 'Y coordinate', required: true},
		],
	},
	mouse_drag: {
		description: 'Drag the mouse from one position to another (click-hold-move-release)',
		parameters: [
			{name: 'fromX', type: 'number', description: 'Start X coordinate', required: true},
			{name: 'fromY', type: 'number', description: 'Start Y coordinate', required: true},
			{name: 'toX', type: 'number', description: 'End X coordinate', required: true},
			{name: 'toY', type: 'number', description: 'End Y coordinate', required: true},
		],
	},
	mouse_scroll: {
		description: 'Scroll the mouse wheel up or down, optionally at specific coordinates',
		parameters: [
			{name: 'direction', type: 'string', description: 'Scroll direction: "up" or "down" (default: down)', required: true},
			{name: 'amount', type: 'number', description: 'Scroll amount in clicks (default: 3)', required: false},
			{name: 'x', type: 'number', description: 'X coordinate to scroll at (optional, uses current position if omitted)', required: false},
			{name: 'y', type: 'number', description: 'Y coordinate to scroll at (optional)', required: false},
		],
	},
	keyboard_type: {
		description: 'Type a text string using the keyboard (into the currently focused input)',
		parameters: [
			{name: 'text', type: 'string', description: 'Text to type', required: true},
		],
	},
	keyboard_press: {
		description: 'Press a key or key combination (e.g., "enter", "ctrl+c", "alt+tab", "f5")',
		parameters: [
			{name: 'key', type: 'string', description: 'Key to press. Use "+" for combinations: "ctrl+c", "alt+f4", "shift+tab". Supported keys: a-z, 0-9, f1-f12, enter, tab, escape, space, backspace, delete, up, down, left, right, home, end, pageup, pagedown, insert, printscreen. Modifiers: ctrl/control, alt, shift, command/cmd.', required: true},
		],
	},
}

interface PendingRequest {
	resolve: (result: any) => void
	reject: (error: Error) => void
	timeout: ReturnType<typeof setTimeout>
	deviceId: string
}

interface ConnectedDevice {
	userId: string  // Phase 11 OWN-03: device owner
	deviceId: string
	deviceName: string
	platform: string
	tools: string[]
}

interface DeviceBridgeOptions {
	redis: Redis
	sendTunnelMessage: (msg: Record<string, unknown>) => void
	nexusApiUrl?: string
	nexusApiKey?: string
	callbackBaseUrl?: string
	logger?: {log: (...args: any[]) => void; error: (...args: any[]) => void}
	onEmergencyStop?: (deviceId: string) => void
}

const DEVICE_REDIS_PREFIX = 'livos:devices:'
const AUDIT_REDIS_SUFFIX = ':audit'
const AUDIT_MAX_ENTRIES = 1000
const REQUEST_TIMEOUT_MS = 30_000

export class DeviceBridge {
	// Phase 12 AUTHZ-01: `redis` is public readonly so routes.ts ensureOwnership()
	// can call authorizeDeviceAccess(bridge.redis, ...) without a type escape hatch.
	public readonly redis: Redis
	private sendTunnelMessage: (msg: Record<string, unknown>) => void
	private nexusApiUrl: string
	private nexusApiKey: string
	private callbackBaseUrl: string
	private logger: {log: (...args: any[]) => void; error: (...args: any[]) => void}

	private connectedDevices = new Map<string, ConnectedDevice>()
	private pendingRequests = new Map<string, PendingRequest>()
	private onEmergencyStopCallback?: (deviceId: string) => void

	constructor(opts: DeviceBridgeOptions) {
		this.redis = opts.redis
		this.sendTunnelMessage = opts.sendTunnelMessage
		this.nexusApiUrl = opts.nexusApiUrl || process.env.LIV_API_URL || 'http://localhost:3200'
		this.nexusApiKey = opts.nexusApiKey || process.env.LIV_API_KEY || ''
		this.callbackBaseUrl = opts.callbackBaseUrl || 'http://localhost:8080'
		this.logger = opts.logger || {log: console.log, error: console.error}
		this.onEmergencyStopCallback = opts.onEmergencyStop
	}

	// -- Device Event Handlers (called by TunnelClient) --

	async onDeviceConnected(event: {userId: string; deviceId: string; deviceName: string; platform: string; tools: string[]}): Promise<void> {
		const {userId, deviceId, deviceName, platform, tools} = event

		// Phase 11 OWN-03: relay MUST supply userId. If missing (stale relay version), log
		// and drop — we refuse to cache an unowned device to prevent cross-user leakage.
		if (!userId || typeof userId !== 'string' || userId.length === 0) {
			this.logger.error(`[device-bridge] Refusing device_connected without userId: deviceId=${deviceId}`)
			return
		}

		this.logger.log(`[device-bridge] Device connected: ${deviceName} (${deviceId}) user=${userId} platform=${platform} tools=[${tools.join(',')}]`)

		// Store in local state
		this.connectedDevices.set(deviceId, {userId, deviceId, deviceName, platform, tools})

		// Store in Redis for UI queries (TTL 25h -- slightly longer than device token expiry)
		const redisKey = `${DEVICE_REDIS_PREFIX}${deviceId}`
		await this.redis.set(
			redisKey,
			JSON.stringify({userId, deviceId, deviceName, platform, tools, connectedAt: Date.now()}),
			'EX',
			90000,
		)

		// Register proxy tools in Nexus
		for (const toolName of tools) {
			const schema = DEVICE_TOOL_SCHEMAS[toolName]
			if (!schema) {
				this.logger.log(`[device-bridge] Unknown tool '${toolName}' from device ${deviceId}, skipping`)
				continue
			}

			const proxyName = `device_${deviceId}_${toolName}`
			const platformLabel = platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux'
			const description = `${schema.description} on "${deviceName}" (${platformLabel})`

			try {
				const headers: Record<string, string> = {'Content-Type': 'application/json'}
				if (this.nexusApiKey) headers['X-Api-Key'] = this.nexusApiKey

				const resp = await fetch(`${this.nexusApiUrl}/api/tools/register`, {
					method: 'POST',
					headers,
					body: JSON.stringify({
						name: proxyName,
						description,
						parameters: schema.parameters,
						// Phase 12 AUTHZ-01: embed device-owner userId in the callbackUrl
						// so every proxy-tool invocation from Nexus carries the userId
						// end-to-end to /internal/device-tool-execute, which forwards it
						// to executeOnDevice(...) for the authorizeDeviceAccess gate.
						// Query-string (not POST body) because Nexus's Tool.execute hardcodes
						// the POST body as `{tool, params}` and cannot be extended without
						// modifying Nexus.
						callbackUrl: `${this.callbackBaseUrl}/internal/device-tool-execute?expectedUserId=${encodeURIComponent(userId)}`,
					}),
				})

				if (!resp.ok) {
					this.logger.error(`[device-bridge] Failed to register tool ${proxyName}: ${resp.status}`)
				}
			} catch (err) {
				this.logger.error(`[device-bridge] Error registering tool ${proxyName}:`, err)
			}
		}
	}

	async onDeviceDisconnected(event: {deviceId: string}): Promise<void> {
		const {deviceId} = event
		const device = this.connectedDevices.get(deviceId)
		this.logger.log(`[device-bridge] Device disconnected: ${deviceId}`)

		// Unregister proxy tools from Nexus
		if (device) {
			for (const toolName of device.tools) {
				const proxyName = `device_${deviceId}_${toolName}`
				try {
					const headers: Record<string, string> = {}
					if (this.nexusApiKey) headers['X-Api-Key'] = this.nexusApiKey

					await fetch(`${this.nexusApiUrl}/api/tools/${encodeURIComponent(proxyName)}`, {
						method: 'DELETE',
						headers,
					})
				} catch (err) {
					this.logger.error(`[device-bridge] Error unregistering tool ${proxyName}:`, err)
				}
			}
		}

		// Clean up local state
		this.connectedDevices.delete(deviceId)

		// Remove from Redis
		await this.redis.del(`${DEVICE_REDIS_PREFIX}${deviceId}`)

		// Reject any pending requests for this device
		for (const [requestId, pending] of this.pendingRequests) {
			if (pending.deviceId === deviceId) {
				clearTimeout(pending.timeout)
				pending.reject(new Error(`Device '${deviceId}' disconnected`))
				this.pendingRequests.delete(requestId)
			}
		}
	}

	// -- Tool Execution (called by Nexus callback) --

	async executeOnDevice(
		proxyToolName: string,
		params: Record<string, unknown>,
		expectedUserId: string | undefined | null,
	): Promise<{success: boolean; output: string; error?: string; data?: unknown; images?: Array<{base64: string; mimeType: string}>}> {
		// Parse device_<deviceId>_<toolName> from the proxy tool name
		const match = proxyToolName.match(/^device_(.+?)_([a-z_]+)$/)
		if (!match) {
			return {success: false, output: '', error: `Invalid proxy tool name: ${proxyToolName}`}
		}

		const [, deviceId, toolName] = match

		// Phase 12 AUTHZ-01: verify caller owns the target device BEFORE touching
		// the tunnel. Redis cache is authoritative (also catches cross-instance
		// leakage), and this check runs BEFORE the in-memory connectedDevices
		// lookup so an unauthorized caller never causes a sendTunnelMessage.
		const auth = await authorizeDeviceAccess(this.redis, expectedUserId, deviceId)
		if (!auth.authorized) {
			// Phase 15 AUDIT-01/02: PG-backed audit (with Redis-stub fallback inside
			// recordDeviceEvent). Fire-and-forget; never blocks the 403 response.
			void recordDeviceEvent(
				this.redis,
				{
					userId: expectedUserId || '',
					deviceId,
					toolName: `device_tool_call:${toolName}`,
					params,
					success: false,
					error: auth.reason || 'unknown',
				},
				this.logger,
			)
			return {success: false, output: '', error: auth.reason || 'device_not_owned'}
		}

		const device = this.connectedDevices.get(deviceId)
		if (!device) {
			return {success: false, output: '', error: `Device '${deviceId}' is not connected`}
		}

		const requestId = randomUUID()

		// Send tool_call through tunnel WS -> relay -> device
		const toolCallMsg = {
			type: 'device_tool_call',
			requestId,
			deviceId,
			tool: toolName,
			params,
			timeout: REQUEST_TIMEOUT_MS,
		}
		this.sendTunnelMessage(toolCallMsg)

		// Wait for result with timeout
		type ToolResult = {success: boolean; output: string; error?: string; data?: unknown; images?: Array<{base64: string; mimeType: string}>}
		return new Promise<ToolResult>((resolve, _reject) => {
			const deviceAuditedUserId = expectedUserId || ''
			const auditedResolve = (result: ToolResult) => {
				// Phase 15 AUDIT-01: record the tool-call outcome (success OR tunnel
				// error OR timeout) with the same deviceId/toolName the proxy name
				// carried. Fire-and-forget; never blocks the Nexus callback response.
				void recordDeviceEvent(
					this.redis,
					{
						userId: deviceAuditedUserId,
						deviceId,
						toolName: `device_tool_call:${toolName}`,
						params,
						success: result.success === true,
						error: result.error ?? null,
					},
					this.logger,
				)
				resolve(result)
			}

			const timeout = setTimeout(() => {
				this.pendingRequests.delete(requestId)
				auditedResolve({success: false, output: '', error: `Tool execution timed out after ${REQUEST_TIMEOUT_MS}ms`})
			}, REQUEST_TIMEOUT_MS)

			this.pendingRequests.set(requestId, {resolve: auditedResolve, reject: _reject, timeout, deviceId})
		})
	}

	// -- Tool Result Handler (called by TunnelClient on device_tool_result) --

	onToolResult(event: {
		requestId: string
		deviceId: string
		result: {success: boolean; output: string; error?: string; data?: unknown; images?: Array<{base64: string; mimeType: string}>}
	}): void {
		const pending = this.pendingRequests.get(event.requestId)
		if (!pending) {
			this.logger.log(`[device-bridge] Received tool_result for unknown request ${event.requestId}`)
			return
		}

		clearTimeout(pending.timeout)
		this.pendingRequests.delete(event.requestId)
		pending.resolve(event.result)
	}

	// -- Audit Event Handler (called by TunnelClient on device_audit_event) --

	onAuditEvent(event: {
		deviceId: string
		timestamp: string
		toolName: string
		params: Record<string, unknown>
		success: boolean
		duration: number
		error?: string
	}): void {
		const device = this.connectedDevices.get(event.deviceId)
		const deviceName = device?.deviceName ?? event.deviceId

		const entry = {
			timestamp: event.timestamp,
			toolName: event.toolName,
			params: event.params,
			success: event.success,
			duration: event.duration,
			deviceId: event.deviceId,
			deviceName,
			...(event.error ? {error: event.error} : {}),
		}

		const key = `${DEVICE_REDIS_PREFIX}${event.deviceId}${AUDIT_REDIS_SUFFIX}`
		this.redis
			.rpush(key, JSON.stringify(entry))
			.then(() => this.redis.ltrim(key, -AUDIT_MAX_ENTRIES, -1))
			.catch((err) => this.logger.error(`[device-bridge] Failed to store audit event:`, err))

		this.logger.log(`[device-bridge] Audit: ${event.toolName} on ${event.deviceId} success=${event.success}`)
	}

	// -- Emergency Stop Handler (called by TunnelClient on device_emergency_stop) --

	onEmergencyStop(event: {deviceId: string; timestamp: string; reason: string}): void {
		this.logger.log(`[device-bridge] EMERGENCY STOP from device ${event.deviceId} (${event.reason})`)
		this.onEmergencyStopCallback?.(event.deviceId)
	}

	async getAuditLog(
		deviceId: string,
		offset: number,
		limit: number,
	): Promise<
		Array<{
			timestamp: string
			toolName: string
			params: Record<string, unknown>
			success: boolean
			duration: number
			deviceId: string
			deviceName: string
			error?: string
		}>
	> {
		const key = `${DEVICE_REDIS_PREFIX}${deviceId}${AUDIT_REDIS_SUFFIX}`
		const raw = await this.redis.lrange(key, 0, -1)
		if (!raw || raw.length === 0) return []

		// Redis list is oldest-first, reverse for newest-first
		const entries = raw
			.map((item) => {
				try {
					return JSON.parse(item)
				} catch {
					return null
				}
			})
			.filter(Boolean)
			.reverse()

		return entries.slice(offset, offset + limit)
	}

	// -- Queries --

	getConnectedDevices(): ConnectedDevice[] {
		return Array.from(this.connectedDevices.values())
	}

	isDeviceConnected(deviceId: string): boolean {
		return this.connectedDevices.has(deviceId)
	}

	// -- Redis Device Queries & Mutations (for tRPC routes) --

	async getDeviceFromRedis(
		deviceId: string,
	): Promise<{userId: string; deviceId: string; deviceName: string; platform: string; tools: string[]; connectedAt: number} | null> {
		const raw = await this.redis.get(`${DEVICE_REDIS_PREFIX}${deviceId}`)
		if (!raw) return null
		try {
			return JSON.parse(raw)
		} catch {
			return null
		}
	}

	async getAllDevicesFromRedis(): Promise<
		Array<{userId: string; deviceId: string; deviceName: string; platform: string; tools: string[]; connectedAt: number; online: boolean}>
	> {
		const keys = await this.redis.keys(`${DEVICE_REDIS_PREFIX}*`)
		if (keys.length === 0) return []

		const pipeline = this.redis.pipeline()
		for (const key of keys) pipeline.get(key)
		const results = await pipeline.exec()
		if (!results) return []

		const devices: Array<{
			userId: string
			deviceId: string
			deviceName: string
			platform: string
			tools: string[]
			connectedAt: number
			online: boolean
		}> = []

		for (const [err, val] of results) {
			if (err || !val) continue
			try {
				const parsed = JSON.parse(val as string)
				devices.push({
					...parsed,
					online: this.connectedDevices.has(parsed.deviceId),
				})
			} catch {
				// skip malformed entries
			}
		}

		return devices
	}

	/**
	 * Phase 11 OWN-03: Return only the devices owned by a given user.
	 * Filters the Redis cache by userId — the authoritative source remains
	 * the platform `devices` table, but livinityd only receives data for
	 * devices whose tunnel this LivOS instance is bound to anyway.
	 */
	async getDevicesForUser(userId: string): Promise<
		Array<{userId: string; deviceId: string; deviceName: string; platform: string; tools: string[]; connectedAt: number; online: boolean}>
	> {
		const all = await this.getAllDevicesFromRedis()
		return all.filter((d) => d.userId === userId)
	}

	async renameDevice(deviceId: string, newName: string): Promise<boolean> {
		const redisKey = `${DEVICE_REDIS_PREFIX}${deviceId}`
		const raw = await this.redis.get(redisKey)
		if (!raw) return false

		try {
			const data = JSON.parse(raw)
			data.deviceName = newName
			const ttl = await this.redis.ttl(redisKey)
			await this.redis.set(redisKey, JSON.stringify(data), 'EX', ttl > 0 ? ttl : 90000)
		} catch {
			return false
		}

		// Update in-memory state if device is online
		const inMemory = this.connectedDevices.get(deviceId)
		if (inMemory) {
			inMemory.deviceName = newName
		}

		return true
	}

	async removeDevice(deviceId: string): Promise<boolean> {
		// Delete Redis key
		await this.redis.del(`${DEVICE_REDIS_PREFIX}${deviceId}`)

		// Remove from in-memory state
		this.connectedDevices.delete(deviceId)

		// Tell relay to disconnect the device
		this.sendTunnelMessage({type: 'device_disconnect', deviceId})

		return true
	}
}
