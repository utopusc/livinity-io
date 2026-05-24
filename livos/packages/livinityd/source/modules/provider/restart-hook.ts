/**
 * Phase 204-01 — `sudo systemctl restart liv-claw-gateway` hook.
 *
 * Invoked by the `provider.config.set` / `delete` tRPC mutations after the
 * env file has been regenerated. The narrow sudoers drop-in shipped by Plan
 * 204-02 (`/etc/sudoers.d/livos-claw-gateway`) grants `bruce` NOPASSWD on
 * exactly these two commands:
 *
 *   /bin/systemctl restart liv-claw-gateway
 *   /bin/systemctl status liv-claw-gateway
 *
 * INV-204-07 — nothing else.
 *
 * The hook returns a structured result rather than throwing:
 *   - `{ok: true}` — restart kicked off (no guarantee gateway is back up;
 *     the UI's 30s health-poll is the source of truth for that).
 *   - `{ok: false, reason}` — sudo unavailable / non-zero exit / timeout.
 *     The router surfaces `restartRequired: true` in its response, and the
 *     UI renders the "SSH and restart manually" banner (T-204-05 graceful
 *     degradation).
 *
 * NEVER throws. Restart failure is a degraded-but-recoverable state, not
 * a hard error — the Redis write already succeeded, and the operator can
 * recover by SSHing in.
 */

import {spawn} from 'child_process'

export interface RestartHookLogger {
	info(msg: string): void
	warn(msg: string, error?: unknown): void
}

export interface RestartHookOptions {
	logger?: RestartHookLogger
	/** Override sudo binary path (tests). */
	sudoBinary?: string
	/** Override timeout (tests). */
	timeoutMs?: number
}

export type RestartHookResult =
	| {ok: true}
	| {ok: false; reason: string}

export type RestartHook = () => Promise<RestartHookResult>

/**
 * Build a restart hook closure. The hook closes over the logger + sudo
 * binary path; calling it shells out to `sudo systemctl restart
 * liv-claw-gateway`.
 */
export function createRestartHook(opts: RestartHookOptions = {}): RestartHook {
	const logger = opts.logger ?? {
		info: () => undefined,
		warn: () => undefined,
	}
	const sudoBinary = opts.sudoBinary ?? 'sudo'
	const timeoutMs = opts.timeoutMs ?? 10_000

	return async () => {
		return new Promise<RestartHookResult>((resolve) => {
			const args = ['/bin/systemctl', 'restart', 'liv-claw-gateway']
			let settled = false
			const settle = (result: RestartHookResult): void => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				resolve(result)
			}

			let stderr = ''
			const child = spawn(sudoBinary, args, {
				stdio: ['ignore', 'pipe', 'pipe'],
				windowsHide: true,
			})

			const timer = setTimeout(() => {
				try {
					child.kill('SIGTERM')
				} catch {
					/* best-effort */
				}
				logger.warn(
					`[provider-restart-hook] sudo systemctl restart liv-claw-gateway timed out after ${timeoutMs}ms`,
				)
				settle({ok: false, reason: `timeout after ${timeoutMs}ms`})
			}, timeoutMs)

			child.stderr?.on('data', (chunk: Buffer) => {
				stderr += chunk.toString('utf8')
			})

			child.on('error', (err: Error) => {
				// Fires for ENOENT (sudo not on PATH) and EACCES.
				const reason = err.message || 'sudo spawn failed'
				logger.warn(
					`[provider-restart-hook] could not spawn sudo: ${reason}`,
					err,
				)
				settle({ok: false, reason})
			})

			child.on('close', (code) => {
				if (code === 0) {
					logger.info(
						'[provider-restart-hook] sudo systemctl restart liv-claw-gateway succeeded',
					)
					settle({ok: true})
					return
				}
				const reason =
					stderr.trim().slice(0, 200) ||
					`sudo exited with code ${code ?? 'unknown'}`
				logger.warn(
					`[provider-restart-hook] sudo systemctl restart liv-claw-gateway failed: ${reason}`,
				)
				settle({ok: false, reason})
			})
		})
	}
}
