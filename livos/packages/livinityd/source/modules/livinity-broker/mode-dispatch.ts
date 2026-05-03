import type {Request} from 'express'
import type {BrokerMode} from './types.js'

/**
 * Phase 57 (FR-BROKER-A2-01): resolve broker mode from request header.
 *
 * Header `X-Livinity-Mode: agent` (case-insensitive, whitespace-tolerant) opts
 * into the existing Strategy B HTTP-proxy → nexus agent runner path. Default
 * (header absent or any other value) routes to passthrough mode which forwards
 * directly to api.anthropic.com via @anthropic-ai/sdk.
 *
 * Express normalizes header names to lowercase per RFC 7230 §3.2; access via
 * req.headers['x-livinity-mode'].
 */
export function resolveMode(req: Request): BrokerMode {
	const raw = req.headers['x-livinity-mode']
	const value = Array.isArray(raw) ? raw[0] : raw
	if (typeof value !== 'string') return 'passthrough'
	return value.trim().toLowerCase() === 'agent' ? 'agent' : 'passthrough'
}

// Re-export for caller convenience.
export type {BrokerMode} from './types.js'
