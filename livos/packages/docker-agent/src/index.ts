#!/usr/bin/env node
// Phase 22 MH-04 — Outbound Docker agent CLI entry.
//
// Connects to livinityd via WebSocket and proxies Docker API calls.
// Auth: presents the per-agent token (32 random bytes hex) in the FIRST
// `register` message after WS open. Server replies `registered` or closes
// with code 4401 (invalid/revoked).
//
// Reconnect strategy: exponential backoff 1s → 2s → 4s → 8s → 16s → 30s (cap).
// Resets to 1s on a successful clean disconnect (close code 1000 or unstable
// network). Exits process with code 2/3 on auth/revoke close codes (no
// reconnect storm against an invalid token).
//
// Usage:
//   livos-docker-agent --token <T> --server wss://livinity.cloud/agent/connect
//   LIVOS_AGENT_TOKEN=... LIVOS_AGENT_SERVER=... livos-docker-agent

import os from 'node:os'

import {WebSocket} from 'ws'

import type {AgentMessage, AgentRegister} from './protocol.js'
import {dispatch, getDockerVersion} from './proxy.js'

const AGENT_VERSION = '0.1.0'

interface AgentArgs {
	token: string
	server: string
}

export function parseArgs(argv: string[] = process.argv.slice(2)): AgentArgs {
	const get = (flag: string): string | undefined => {
		const i = argv.indexOf(flag)
		if (i < 0) return undefined
		return argv[i + 1]
	}
	const token = get('--token') ?? process.env.LIVOS_AGENT_TOKEN
	const server = get('--server') ?? process.env.LIVOS_AGENT_SERVER
	if (!token) {
		throw new Error('--token <T> (or LIVOS_AGENT_TOKEN env var) is required')
	}
	if (!server) {
		throw new Error(
			'--server <wss://...> (or LIVOS_AGENT_SERVER env var) is required, e.g. wss://livinity.cloud/agent/connect',
		)
	}
	return {token, server}
}

/**
 * Run a single WS connection. Resolves on clean close (caller should reconnect),
 * rejects on errors that should also retry, exits the process for auth-fatal codes.
 */
function runOnce({
	token,
	server,
	dockerVersion,
}: {
	token: string
	server: string
	dockerVersion?: string
}): Promise<void> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(server)
		let resolved = false

		const finish = (cb: () => void) => {
			if (resolved) return
			resolved = true
			cb()
		}

		ws.on('open', () => {
			const reg: AgentRegister = {
				type: 'register',
				token,
				agentVersion: AGENT_VERSION,
				platform: `${os.platform()}-${os.arch()}`,
				dockerVersion,
			}
			try {
				ws.send(JSON.stringify(reg))
			} catch (err) {
				console.error('[agent] failed to send register message:', err)
				try {
					ws.close()
				} catch {
					/* ignore */
				}
			}
		})

		ws.on('message', async (raw) => {
			let msg: AgentMessage
			try {
				msg = JSON.parse(raw.toString()) as AgentMessage
			} catch {
				return // ignore malformed
			}

			if (msg.type === 'registered') {
				console.log(`[agent] registered as ${msg.agentId}`)
				return
			}

			if (msg.type === 'ping') {
				try {
					ws.send(JSON.stringify({type: 'pong', ts: Date.now()}))
				} catch {
					/* WS may have closed mid-tick */
				}
				return
			}

			if (msg.type === 'request') {
				const response = await dispatch(msg)
				try {
					ws.send(JSON.stringify(response))
				} catch (err) {
					console.error(`[agent] failed to send response for ${msg.requestId}:`, err)
				}
				return
			}
			// 'response' / 'progress' / 'pong' / 'register' / 'registered' from server are unexpected; ignore.
		})

		ws.on('close', (code, reasonBuf) => {
			const reason = reasonBuf?.toString?.() ?? ''
			if (code === 4401) {
				console.error(
					`[agent] auth failed (code 4401): ${reason || 'invalid-or-revoked-token'}. Halting.`,
				)
				process.exit(2)
			}
			if (code === 4403) {
				console.error(
					`[agent] disconnected by server (code 4403): ${reason || 'token-revoked'}. Halting.`,
				)
				process.exit(3)
			}
			console.log(`[agent] WS closed code=${code} reason=${reason}`)
			finish(() => resolve())
		})

		ws.on('error', (err) => {
			console.error(`[agent] WS error: ${err.message}`)
			finish(() => reject(err))
		})
	})
}

async function connectLoop({token, server}: AgentArgs): Promise<void> {
	let backoff = 1_000
	const MAX_BACKOFF = 30_000
	const dockerVersion = await getDockerVersion()
	if (!dockerVersion) {
		console.error(
			'[agent] WARNING: cannot reach local Docker daemon. Is /var/run/docker.sock accessible? Continuing anyway — connection retries will surface the issue.',
		)
	}

	// Run forever — process.exit() on auth-fatal close codes is the only escape.
	for (;;) {
		try {
			await runOnce({token, server, dockerVersion})
			backoff = 1_000 // clean disconnect — reset
		} catch (err: any) {
			console.error(`[agent] connection error: ${err.message ?? String(err)}`)
		}
		console.log(`[agent] reconnecting in ${backoff / 1000}s`)
		await new Promise((r) => setTimeout(r, backoff))
		backoff = Math.min(MAX_BACKOFF, backoff * 2)
	}
}

// Only run when executed as a script (not when imported by tests).
// The `import.meta.url` check is the standard ESM "is this the entry?" idiom.
const isEntry =
	import.meta.url === `file://${process.argv[1]}` ||
	import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') ?? '')

if (isEntry) {
	let args: AgentArgs
	try {
		args = parseArgs()
	} catch (err: any) {
		console.error(`[agent] ${err.message}`)
		console.error(
			'\nUsage:\n  livos-docker-agent --token <T> --server <wss://...>\n  LIVOS_AGENT_TOKEN=... LIVOS_AGENT_SERVER=... livos-docker-agent',
		)
		process.exit(1)
	}
	connectLoop(args).catch((err) => {
		console.error('[agent] fatal:', err)
		process.exit(1)
	})
}
