/**
 * DeviceBridge -- Manages device proxy tool lifecycle in Nexus ToolRegistry.
 *
 * Listens for device_connected/device_disconnected events from the tunnel WebSocket,
 * registers/unregisters proxy tools in Nexus via HTTP API, handles tool execution
 * routing through the tunnel to the relay to the device agent.
 */

import {randomUUID} from 'node:crypto'
import type {Redis} from 'ioredis'

// Tool parameter definitions for each device tool (matches agent/src/tools.ts TOOL_NAMES)
const DEVICE_TOOL_SCHEMAS: Record<
	string,
	{description: string; parameters: Array<{name: string; type: string; description: string; required: boolean}>}
> = {
	shell: {
		description: 'Execute a shell command',
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
		description: 'Capture a screenshot of the display',
		parameters: [],
	},
}

interface PendingRequest {
	resolve: (result: any) => void
	reject: (error: Error) => void
	timeout: ReturnType<typeof setTimeout>
	deviceId: string
}

interface ConnectedDevice {
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
}

const DEVICE_REDIS_PREFIX = 'livos:devices:'
const REQUEST_TIMEOUT_MS = 30_000

export class DeviceBridge {
	private redis: Redis
	private sendTunnelMessage: (msg: Record<string, unknown>) => void
	private nexusApiUrl: string
	private nexusApiKey: string
	private callbackBaseUrl: string
	private logger: {log: (...args: any[]) => void; error: (...args: any[]) => void}

	private connectedDevices = new Map<string, ConnectedDevice>()
	private pendingRequests = new Map<string, PendingRequest>()

	constructor(opts: DeviceBridgeOptions) {
		this.redis = opts.redis
		this.sendTunnelMessage = opts.sendTunnelMessage
		this.nexusApiUrl = opts.nexusApiUrl || process.env.LIV_API_URL || 'http://localhost:3200'
		this.nexusApiKey = opts.nexusApiKey || process.env.LIV_API_KEY || ''
		this.callbackBaseUrl = opts.callbackBaseUrl || 'http://localhost:8080'
		this.logger = opts.logger || {log: console.log, error: console.error}
	}

	// -- Device Event Handlers (called by TunnelClient) --

	async onDeviceConnected(event: {deviceId: string; deviceName: string; platform: string; tools: string[]}): Promise<void> {
		const {deviceId, deviceName, platform, tools} = event
		this.logger.log(`[device-bridge] Device connected: ${deviceName} (${deviceId}) platform=${platform} tools=[${tools.join(',')}]`)

		// Store in local state
		this.connectedDevices.set(deviceId, {deviceId, deviceName, platform, tools})

		// Store in Redis for UI queries (TTL 25h -- slightly longer than device token expiry)
		const redisKey = `${DEVICE_REDIS_PREFIX}${deviceId}`
		await this.redis.set(
			redisKey,
			JSON.stringify({deviceId, deviceName, platform, tools, connectedAt: Date.now()}),
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
						callbackUrl: `${this.callbackBaseUrl}/internal/device-tool-execute`,
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
	): Promise<{success: boolean; output: string; error?: string; data?: unknown; images?: Array<{base64: string; mimeType: string}>}> {
		// Parse device_<deviceId>_<toolName> from the proxy tool name
		const match = proxyToolName.match(/^device_(.+?)_([a-z_]+)$/)
		if (!match) {
			return {success: false, output: '', error: `Invalid proxy tool name: ${proxyToolName}`}
		}

		const [, deviceId, toolName] = match
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
		return new Promise((resolve, _reject) => {
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(requestId)
				resolve({success: false, output: '', error: `Tool execution timed out after ${REQUEST_TIMEOUT_MS}ms`})
			}, REQUEST_TIMEOUT_MS)

			this.pendingRequests.set(requestId, {resolve, reject: _reject, timeout, deviceId})
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

	// -- Queries --

	getConnectedDevices(): ConnectedDevice[] {
		return Array.from(this.connectedDevices.values())
	}

	isDeviceConnected(deviceId: string): boolean {
		return this.connectedDevices.has(deviceId)
	}
}
