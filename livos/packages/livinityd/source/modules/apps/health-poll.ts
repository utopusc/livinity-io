import {$} from 'execa'

export type HealthVerdict = 'ready' | 'pending' | 'unhealthy' | 'failed'

// Pure classifier for a single `docker inspect` sample. `health` is the raw
// docker output: 'healthy' | 'unhealthy' | 'starting' | '<no value>' (no healthcheck).
export function classifyInspect({status, health}: {status: string; health: string}): HealthVerdict {
	const hasHealthcheck = health !== '' && health !== '<no value>'
	if (status === 'running') {
		if (!hasHealthcheck) return 'ready'
		if (health === 'healthy') return 'ready'
		if (health === 'unhealthy') return 'unhealthy'
		return 'pending' // 'starting'
	}
	if (status === 'restarting' || status === 'created') return 'pending'
	// 'exited' | 'dead' | 'removing' | 'paused' | unknown → the container is not coming up
	return 'failed'
}

export interface PollOptions {
	timeoutMs?: number // total wall-clock budget (default 90_000)
	intervalMs?: number // gap between samples (default 3_000)
	logger?: {log: (m: string) => void; error: (m: string, e?: unknown) => void}
}

// Poll a container until it is ready / terminally failed / the budget expires.
// Returns 'ready' on success; throws on terminal failure or timeout so the
// caller can land an error state instead of a false 'ready'.
export async function pollContainerHealth(containerName: string, opts: PollOptions = {}): Promise<HealthVerdict> {
	const timeoutMs = opts.timeoutMs ?? 90_000
	const intervalMs = opts.intervalMs ?? 3_000
	const deadline = Date.now() + timeoutMs
	let last: HealthVerdict = 'pending'
	let unhealthySeen = 0
	while (Date.now() < deadline) {
		let status = ''
		let health = ''
		try {
			// execa `$` arg-arrays (no shell:true) — containerName is a single arg
			;({stdout: status} = await $`docker inspect -f {{.State.Status}} ${containerName}`)
			// A container WITHOUT a healthcheck has no `.State.Health`, so this template
			// errors ("map has no entry for key Health") on modern docker (29.x). Swallow
			// it → health='' → classifyInspect treats it as 'ready'. Without the `.catch`
			// the whole try aborted, wedging the poll to its 120s timeout + a false
			// 'unhealthy' for every healthcheck-less app (duplicati, etc.).
			;({stdout: health} = await $`docker inspect -f {{.State.Health.Status}} ${containerName}`.catch(() => ({stdout: ''})))
		} catch {
			// container does not exist yet (compose still scheduling) → treat as pending
			opts.logger?.log(`[health] inspect not ready for ${containerName} yet`)
			await new Promise((r) => setTimeout(r, intervalMs))
			continue
		}
		last = classifyInspect({status: status.trim(), health: health.trim()})
		if (last === 'ready') {
			opts.logger?.log(`[health] ${containerName} is ready`)
			return 'ready'
		}
		if (last === 'failed') {
			throw new Error(`Container ${containerName} failed to start (docker status=${status.trim()})`)
		}
		if (last === 'unhealthy') {
			// tolerate a couple of transient unhealthy samples before giving up
			if (++unhealthySeen >= 3) {
				throw new Error(`Container ${containerName} is unhealthy`)
			}
		}
		await new Promise((r) => setTimeout(r, intervalMs))
	}
	throw new Error(`Container ${containerName} did not become ready within ${timeoutMs}ms (last=${last})`)
}
