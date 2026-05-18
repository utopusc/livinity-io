/**
 * Phase 153 — plugin runtime API.
 *
 * The object passed to every plugin's onActivate/onDeactivate. Each
 * surface (redis / pg / fs) is namespaced + cap-checked so a plugin
 * can't reach outside its declared capabilities (SPEC §3.4).
 *
 * v37 enforcement level:
 *   - Redis: hard key-prefix gate (operator-signed plugins are
 *     trusted but the gate is cheap and catches accidental drift).
 *   - Postgres: per-plugin role with GRANT on declared tables.
 *     Implementation in plugin-installer.ts at install time.
 *   - Filesystem: path-prefix proxy. Reads/writes outside declared
 *     roots throw.
 *   - Network: documentation/review only in v37; DNS filtering is
 *     v38 scope.
 */

import {promises as fs} from 'fs'
import * as path from 'path'
import type pg from 'pg'

import type {PluginManifest} from './manifest-schema.js'

export interface PluginRuntimeLogger {
	info: (msg: string, extra?: unknown) => void
	warn: (msg: string, extra?: unknown) => void
	error: (msg: string, extra?: unknown) => void
}

export interface RawRedisLike {
	set(key: string, value: string): Promise<string | 'OK' | null>
	get(key: string): Promise<string | null>
	del(key: string): Promise<number>
	keys(pattern: string): Promise<string[]>
	publish(channel: string, message: string): Promise<number>
}

// ─── Cap-gated Redis proxy ───────────────────────────────────────────────

/**
 * Wraps a raw ioredis client so every key access is checked against
 * the plugin's declared Redis key patterns. A miss throws — the
 * runtime dispatcher catches and logs, the plugin sees a normal
 * Promise rejection.
 */
export function makeScopedRedis(
	raw: RawRedisLike,
	patterns: ReadonlyArray<{keyPattern: string; access: 'read' | 'write' | 'readwrite'}>,
	logger: PluginRuntimeLogger,
): RawRedisLike {
	const compiled = patterns.map((p) => ({
		access: p.access,
		match: globToRegex(p.keyPattern),
	}))

	function check(key: string, mode: 'read' | 'write'): void {
		for (const c of compiled) {
			if (c.match.test(key)) {
				if (mode === 'read' && (c.access === 'read' || c.access === 'readwrite')) return
				if (mode === 'write' && (c.access === 'write' || c.access === 'readwrite')) return
			}
		}
		const msg = `redis cap denied: ${mode} ${key}`
		logger.warn(msg)
		throw new Error(msg)
	}

	return {
		async get(key) {
			check(key, 'read')
			return raw.get(key)
		},
		async set(key, value) {
			check(key, 'write')
			return raw.set(key, value)
		},
		async del(key) {
			check(key, 'write')
			return raw.del(key)
		},
		async keys(pattern) {
			// keys() reads the keyspace — treat as read on the pattern.
			check(pattern, 'read')
			return raw.keys(pattern)
		},
		async publish(channel, message) {
			check(channel, 'write')
			return raw.publish(channel, message)
		},
	}
}

function globToRegex(glob: string): RegExp {
	// Redis-style globs: `*` is any chars, `?` is one char.
	const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
	const expanded = escaped.replace(/\*/g, '.*').replace(/\?/g, '.')
	return new RegExp(`^${expanded}$`)
}

// ─── Cap-gated filesystem proxy ──────────────────────────────────────────

export interface PluginFsApi {
	readFile(filePath: string): Promise<string>
	writeFile(filePath: string, contents: string | Uint8Array): Promise<void>
	mkdir(dirPath: string): Promise<void>
	readdir(dirPath: string): Promise<string[]>
	unlink(filePath: string): Promise<void>
}

export function makeScopedFs(
	patterns: ReadonlyArray<{path: string; access: 'read' | 'write' | 'readwrite'}>,
	logger: PluginRuntimeLogger,
): PluginFsApi {
	const roots = patterns.map((p) => ({
		access: p.access,
		root: path.resolve(p.path),
	}))

	function check(target: string, mode: 'read' | 'write'): string {
		const abs = path.resolve(target)
		for (const r of roots) {
			if (abs === r.root || abs.startsWith(r.root + path.sep)) {
				if (mode === 'read' && (r.access === 'read' || r.access === 'readwrite')) return abs
				if (mode === 'write' && (r.access === 'write' || r.access === 'readwrite')) return abs
			}
		}
		const msg = `fs cap denied: ${mode} ${abs}`
		logger.warn(msg)
		throw new Error(msg)
	}

	return {
		async readFile(filePath) {
			const safe = check(filePath, 'read')
			return fs.readFile(safe, 'utf8')
		},
		async writeFile(filePath, contents) {
			const safe = check(filePath, 'write')
			await fs.writeFile(safe, contents)
		},
		async mkdir(dirPath) {
			const safe = check(dirPath, 'write')
			await fs.mkdir(safe, {recursive: true})
		},
		async readdir(dirPath) {
			const safe = check(dirPath, 'read')
			return fs.readdir(safe)
		},
		async unlink(filePath) {
			const safe = check(filePath, 'write')
			await fs.unlink(safe)
		},
	}
}

// ─── Runtime API root ────────────────────────────────────────────────────

export interface PluginRuntimeApi {
	pluginId: string
	redis: RawRedisLike
	pg: pg.Pool
	fs: PluginFsApi
	log: PluginRuntimeLogger
	emitEvent(name: string, payload: unknown): void
}

// ─── Backend module contract ─────────────────────────────────────────────

export interface PluginBackendModule {
	onActivate?(api: PluginRuntimeApi): Promise<void> | void
	onDeactivate?(api: PluginRuntimeApi): Promise<void> | void
	handlers?: Record<string, ExpressLikeHandler>
	commands?: Record<string, SlashCommandHandler>
}

export type ExpressLikeHandler = (
	req: {
		method: string
		path: string
		query: Record<string, string | string[] | undefined>
		body: unknown
		headers: Record<string, string | string[] | undefined>
	},
	res: {
		status(code: number): unknown
		json(value: unknown): unknown
		send(value: unknown): unknown
		end(): unknown
	},
) => Promise<unknown> | unknown

export type SlashCommandHandler = (
	args: string,
	ctx: {userId: string; sessionId: string},
) => Promise<string>

// ─── Helpers for callers ─────────────────────────────────────────────────

export function buildRuntimeApi(
	pluginId: string,
	manifest: PluginManifest,
	rawRedis: RawRedisLike,
	pgPool: pg.Pool,
	logger: PluginRuntimeLogger,
	emitEvent: (name: string, payload: unknown) => void,
): PluginRuntimeApi {
	const redisCaps = manifest.capabilities.redis ?? []
	const fsCaps = manifest.capabilities.filesystem ?? []
	return {
		pluginId,
		redis: makeScopedRedis(rawRedis, redisCaps, logger),
		pg: pgPool, // Postgres scoping is done via per-plugin role at install time
		fs: makeScopedFs(fsCaps, logger),
		log: logger,
		emitEvent,
	}
}
