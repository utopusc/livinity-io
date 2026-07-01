import {afterEach, beforeEach, expect, test, vi} from 'vitest'

// Fake docker state, keyed by container name. Each entry drives the two
// `docker inspect` calls the monitor issues per app.
const dockerState = new Map<string, {status: string; health: string}>()

vi.mock('execa', () => ({
	$: async (parts: TemplateStringsArray, ...args: string[]) => {
		const containerName = args[args.length - 1]
		const entry = dockerState.get(containerName)
		if (!entry) throw new Error(`No such container: ${containerName}`)
		const wantsHealth = parts.join('').includes('Health')
		return {stdout: wantsHealth ? entry.health : entry.status}
	},
}))

const {startAppHealthMonitor} = await import('./health-monitor.js')

type FakeApp = {id: string; state: string; getMainContainerName: () => Promise<string | undefined>}

function makeApp(id: string, state: string): FakeApp {
	return {id, state, getMainContainerName: async () => `${id}_main_1`}
}

const logger = {log: () => {}, error: () => {}}
let stop: (() => void) | undefined

beforeEach(() => {
	vi.useFakeTimers()
	dockerState.clear()
})

afterEach(() => {
	stop?.()
	stop = undefined
	vi.useRealTimers()
})

test('unhealthy → ready recovers on the FIRST good sample', async () => {
	const app = makeApp('umami', 'unhealthy')
	dockerState.set('umami_main_1', {status: 'running', health: 'healthy'})
	stop = startAppHealthMonitor({getApps: () => [app as never], logger, intervalMs: 1000})
	await vi.advanceTimersByTimeAsync(1000)
	expect(app.state).toBe('ready')
})

test('ready → unhealthy only after 3 consecutive bad samples (flap suppression)', async () => {
	const app = makeApp('n8n', 'ready')
	dockerState.set('n8n_main_1', {status: 'running', health: 'unhealthy'})
	stop = startAppHealthMonitor({getApps: () => [app as never], logger, intervalMs: 1000})
	await vi.advanceTimersByTimeAsync(1000)
	expect(app.state).toBe('ready')
	await vi.advanceTimersByTimeAsync(1000)
	expect(app.state).toBe('ready')
	await vi.advanceTimersByTimeAsync(1000)
	expect(app.state).toBe('unhealthy')
})

test('a good sample resets the bad streak', async () => {
	const app = makeApp('pastefy', 'ready')
	dockerState.set('pastefy_main_1', {status: 'exited', health: '<no value>'})
	stop = startAppHealthMonitor({getApps: () => [app as never], logger, intervalMs: 1000})
	await vi.advanceTimersByTimeAsync(2000) // 2 bad samples
	dockerState.set('pastefy_main_1', {status: 'running', health: '<no value>'})
	await vi.advanceTimersByTimeAsync(1000) // good — streak cleared
	dockerState.set('pastefy_main_1', {status: 'exited', health: '<no value>'})
	await vi.advanceTimersByTimeAsync(2000) // only 2 bad again
	expect(app.state).toBe('ready')
})

test('transient and stopped states are never judged', async () => {
	const installing = makeApp('gitea', 'installing')
	const stopped = makeApp('jellyfin', 'stopped')
	dockerState.set('gitea_main_1', {status: 'exited', health: '<no value>'})
	dockerState.set('jellyfin_main_1', {status: 'exited', health: '<no value>'})
	stop = startAppHealthMonitor({getApps: () => [installing as never, stopped as never], logger, intervalMs: 1000})
	await vi.advanceTimersByTimeAsync(5000)
	expect(installing.state).toBe('installing')
	expect(stopped.state).toBe('stopped')
})

test('pending verdicts are neutral — no flip either way', async () => {
	const app = makeApp('campfire', 'ready')
	dockerState.set('campfire_main_1', {status: 'restarting', health: '<no value>'})
	stop = startAppHealthMonitor({getApps: () => [app as never], logger, intervalMs: 1000})
	await vi.advanceTimersByTimeAsync(5000)
	expect(app.state).toBe('ready')
})

test('inspect failure skips the sample (never judged on missing evidence)', async () => {
	const app = makeApp('ghost', 'ready')
	// no dockerState entry → mock throws like a missing container
	stop = startAppHealthMonitor({getApps: () => [app as never], logger, intervalMs: 1000})
	await vi.advanceTimersByTimeAsync(5000)
	expect(app.state).toBe('ready')
})

test('compare-and-set: a lifecycle op racing the tick wins', async () => {
	const app = makeApp('vaultwarden', 'unhealthy')
	dockerState.set('vaultwarden_main_1', {status: 'running', health: 'healthy'})
	// Simulate a restart op grabbing the app between sample and write: the
	// getMainContainerName hook flips state mid-tick.
	app.getMainContainerName = async () => {
		app.state = 'restarting'
		return 'vaultwarden_main_1'
	}
	stop = startAppHealthMonitor({getApps: () => [app as never], logger, intervalMs: 1000})
	await vi.advanceTimersByTimeAsync(1000)
	expect(app.state).toBe('restarting')
})
