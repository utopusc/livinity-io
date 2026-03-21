import {$} from 'execa'
import type Livinityd from '../../index.js'

type NativeAppState = 'unknown' | 'starting' | 'running' | 'stopping' | 'stopped' | 'ready'

export interface NativeAppConfig {
	id: string
	serviceName: string // systemd service name, e.g. 'livos-chrome'
	port: number // noVNC port to check health
	idleTimeoutMs: number // auto-stop after idle (default 30 min)
}

export class NativeApp {
	#livinityd: Livinityd
	logger: Livinityd['logger']
	id: string
	serviceName: string
	port: number
	state: NativeAppState = 'stopped'
	stateProgress = 0
	idleTimeoutMs: number
	#idleTimer: ReturnType<typeof setTimeout> | null = null

	constructor(livinityd: Livinityd, config: NativeAppConfig) {
		this.#livinityd = livinityd
		this.id = config.id
		this.serviceName = config.serviceName
		this.port = config.port
		this.idleTimeoutMs = config.idleTimeoutMs
		this.logger = livinityd.logger.createChildLogger(`native-${config.id}`)
	}

	async start(): Promise<boolean> {
		this.state = 'starting'
		this.logger.log(`Starting native app ${this.id} via systemctl`)
		try {
			await $`systemctl start ${this.serviceName}`
			// Wait for noVNC port to be available (up to 10 seconds)
			for (let i = 0; i < 20; i++) {
				try {
					await $({shell: true})`ss -tlnp | grep :${this.port}`
					break
				} catch {
					await new Promise((r) => setTimeout(r, 500))
				}
			}
			this.state = 'ready'
			this.resetIdleTimer()
			this.logger.log(`Native app ${this.id} started`)
			return true
		} catch (error) {
			this.state = 'stopped'
			this.logger.error(`Failed to start native app ${this.id}`, error)
			throw error
		}
	}

	async stop(): Promise<boolean> {
		this.state = 'stopping'
		this.clearIdleTimer()
		this.logger.log(`Stopping native app ${this.id} via systemctl`)
		try {
			await $`systemctl stop ${this.serviceName}`
			this.state = 'stopped'
			this.logger.log(`Native app ${this.id} stopped`)
			return true
		} catch (error) {
			this.logger.error(`Failed to stop native app ${this.id}`, error)
			this.state = 'unknown'
			throw error
		}
	}

	async restart(): Promise<boolean> {
		await this.stop()
		return this.start()
	}

	async getStatus(): Promise<NativeAppState> {
		try {
			const {stdout} = await $`systemctl is-active ${this.serviceName}`
			const status = stdout.trim()
			if (status === 'active') {
				this.state = 'ready'
			} else if (status === 'inactive' || status === 'failed') {
				this.state = 'stopped'
			} else {
				this.state = 'unknown'
			}
		} catch {
			this.state = 'stopped'
		}
		return this.state
	}

	resetIdleTimer() {
		this.clearIdleTimer()
		if (this.idleTimeoutMs > 0) {
			this.#idleTimer = setTimeout(async () => {
				this.logger.log(`Idle timeout reached for ${this.id}, stopping`)
				await this.stop().catch((e) => this.logger.error(`Idle stop failed for ${this.id}`, e))
			}, this.idleTimeoutMs)
		}
	}

	clearIdleTimer() {
		if (this.#idleTimer) {
			clearTimeout(this.#idleTimer)
			this.#idleTimer = null
		}
	}
}

// Registry of native app configurations
export const NATIVE_APP_CONFIGS: NativeAppConfig[] = [
	{
		id: 'chromium', // matches builtin-apps.ts id
		serviceName: 'livos-chrome',
		port: 6080,
		idleTimeoutMs: 30 * 60 * 1000, // 30 minutes
	},
]
