// Minimal Redis module — replaces the deleted AiModule.
//
// The AiModule that lived at modules/ai/index.ts owned the shared ioredis
// client used by virtually every subsystem (capabilities seed, tunnel client,
// native-app config store, McpConfigManager, vault items, etc.). When the AI
// Chat tear-out removed modules/ai/, the rest of livinityd still needs that
// Redis connection. This module is the smallest possible replacement: it
// connects to Redis on start(), exposes the client as `redis`, and provides
// the `abortDeviceSessions` no-op hook DeviceBridge expects.
//
// Future LangGraph + API integration should NOT add chat logic here — it can
// instantiate its own module that consumes this Redis connection.

import {Redis} from 'ioredis'

import type Livinityd from '../index.js'

export interface RedisModuleOptions {
	livinityd: Livinityd
	redisUrl?: string
}

export default class RedisModule {
	livinityd: Livinityd
	logger: Livinityd['logger']
	redis!: Redis
	private redisUrl: string

	constructor({livinityd, redisUrl}: RedisModuleOptions) {
		this.livinityd = livinityd
		this.logger = livinityd.logger.createChildLogger('redis')
		this.redisUrl = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379'
	}

	async start(): Promise<void> {
		this.redis = new Redis(this.redisUrl, {maxRetriesPerRequest: null})
		this.redis.on('connect', () => this.logger.log('Redis connected'))
		this.redis.on('error', (err: Error) => this.logger.error('Redis error', err))
		this.logger.log('Redis module started')
	}

	async stop(): Promise<void> {
		if (this.redis) await this.redis.quit()
		this.logger.log('Redis module stopped')
	}

	/**
	 * No-op kept for back-compat with DeviceBridge's emergency-stop hook. The
	 * old AiModule aborted in-flight computer-use sessions here; with computer-
	 * use removed there's nothing to abort. The hook is still called by the
	 * device-bridge so we keep the method signature.
	 */
	abortDeviceSessions(_deviceId: string): void {
		// no-op
	}
}
