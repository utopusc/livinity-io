// Phase 343-01 RESIL-01 — debug-mode lifecycle unit tests.
//
// Covers App.enterDebugMode / exitDebugMode / startInDebugMode (the SHARED debug-start
// path B1 also uses):
//   - enter: captures the stash ONCE, flips debugMode, patches, stop+start WITHOUT a
//     health poll, lands state 'debug'.
//   - enter when already in debug: idempotent — the stash is NOT re-captured.
//   - exit: delete debugMode → patch (restore) → delete stash → restart → non-'debug'.
//   - exit ordering: debugMode deleted BEFORE the patch; stash deleted AFTER the patch.
//   - B1: the shared debug-start path (what the boot loop calls) lands 'debug' and NEVER
//     polls container health.
//
// The host GPU probes + app-script + health-poll are mocked so the App methods touch no
// disk / docker / dbus (offline host).

import {beforeEach, describe, expect, test, vi} from 'vitest'

vi.mock('../system/gpu.js', () => ({
	detectGpu: vi.fn(),
	isNvidiaToolkitConfigured: vi.fn(),
	detectNvidiaGpu: vi.fn(),
}))

// Mock the app-script default export (docker compose stop/start) + the health poll so the
// methods never shell out / poll docker on the offline host. vi.hoisted keeps the fns
// available to the hoisted vi.mock factories.
const {mockAppScript, mockPollContainerHealth} = vi.hoisted(() => ({
	mockAppScript: vi.fn().mockResolvedValue({stdout: '', stderr: ''}),
	mockPollContainerHealth: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./legacy-compat/app-script.js', () => ({default: mockAppScript}))
vi.mock('./health-poll.js', () => ({pollContainerHealth: mockPollContainerHealth}))

import App from './app.js'

const childLogger = {log: vi.fn(), error: vi.fn()}
const fakeLivinityd = {
	dataDirectory: '/tmp/livinity-debug-test',
	logger: {createChildLogger: () => childLogger},
	ai: {redis: {get: vi.fn().mockResolvedValue(null)}},
} as any

// Build an App with an in-memory store + spied readCompose/patchComposeFile so the methods
// exercise their real control flow without disk/docker. `store` is a plain object; get/set/
// delete are vi.fn wrappers over it so call-order + call-count can be asserted.
function makeApp(opts: {compose?: any; initialStore?: Record<string, unknown>} = {}) {
	const app = new App(fakeLivinityd, 'gitea')
	const backing: Record<string, unknown> = {...(opts.initialStore ?? {})}
	const get = vi.fn(async (key: string) => backing[key])
	const set = vi.fn(async (key: string, val: unknown) => {
		backing[key] = val
	})
	const del = vi.fn(async (key: string) => {
		delete backing[key]
	})
	vi.spyOn(app.store, 'get').mockImplementation(get as any)
	vi.spyOn(app.store, 'set').mockImplementation(set as any)
	vi.spyOn(app.store, 'delete').mockImplementation(del as any)
	vi.spyOn(app, 'readCompose').mockResolvedValue(
		(opts.compose ?? {services: {gitea: {image: 'gitea/gitea:latest'}}}) as any,
	)
	const patchComposeFile = vi.spyOn(app, 'patchComposeFile').mockResolvedValue(undefined as any)
	return {app, get, set, del, patchComposeFile, backing}
}

beforeEach(() => {
	mockAppScript.mockClear()
	mockPollContainerHealth.mockClear()
	childLogger.log.mockReset()
	childLogger.error.mockReset()
})

describe('App.enterDebugMode', () => {
	test('captures the stash from the live main service, flips debugMode, patches, starts without health poll, lands debug', async () => {
		const {app, set, patchComposeFile} = makeApp({
			compose: {
				services: {
					gitea: {image: 'gitea/gitea:latest', entrypoint: ['/usr/bin/entrypoint'], command: ['web'], healthcheck: {test: ['CMD', 'curl']}},
				},
			},
		})

		const result = await app.enterDebugMode()

		expect(result).toBe(true)
		expect(app.state).toBe('debug')
		// Stash captured from the CURRENT compose values.
		expect(set).toHaveBeenCalledWith('debugStash', {
			entrypoint: ['/usr/bin/entrypoint'],
			command: ['web'],
			healthcheck: {test: ['CMD', 'curl']},
		})
		expect(set).toHaveBeenCalledWith('debugMode', true)
		expect(patchComposeFile).toHaveBeenCalledTimes(1)
		// stop + start ran; health was NEVER polled (nothing serves on sleep-infinity).
		expect(mockAppScript).toHaveBeenCalledTimes(2)
		expect(mockPollContainerHealth).not.toHaveBeenCalled()
	})

	test('captures null for entrypoint/command/healthcheck absent on the main service', async () => {
		const {app, set} = makeApp({compose: {services: {gitea: {image: 'gitea/gitea:latest'}}}})

		await app.enterDebugMode()

		expect(set).toHaveBeenCalledWith('debugStash', {entrypoint: null, command: null, healthcheck: null})
	})

	test('idempotent: enter when debugMode already true does NOT re-capture the stash', async () => {
		const {app, set, patchComposeFile} = makeApp({initialStore: {debugMode: true}})

		const result = await app.enterDebugMode()

		expect(result).toBe(true)
		// No re-capture, no re-flip, no patch/start — pure no-op.
		expect(set).not.toHaveBeenCalled()
		expect(patchComposeFile).not.toHaveBeenCalled()
		expect(mockAppScript).not.toHaveBeenCalled()
	})
})

describe('App.exitDebugMode', () => {
	test('deletes debugMode, patches (restore), deletes stash, restarts, lands a non-debug state', async () => {
		const {app, del, patchComposeFile} = makeApp({
			initialStore: {debugMode: true, debugStash: {entrypoint: null, command: null, healthcheck: null}},
		})

		const result = await app.exitDebugMode()

		expect(result).toBe(true)
		expect(app.state).not.toBe('debug')
		expect(app.state).toBe('ready')
		expect(del).toHaveBeenCalledWith('debugMode')
		expect(del).toHaveBeenCalledWith('debugStash')
		expect(patchComposeFile).toHaveBeenCalled()
	})

	test('ordering: debugMode deleted BEFORE patch (restore branch taken); stash deleted AFTER patch', async () => {
		const order: string[] = []
		const {app, del, patchComposeFile} = makeApp({
			initialStore: {debugMode: true, debugStash: {entrypoint: null, command: null, healthcheck: null}},
		})
		del.mockImplementation(async (key: string) => {
			order.push(`delete:${key}`)
		})
		patchComposeFile.mockImplementation(async () => {
			order.push('patch')
		})

		await app.exitDebugMode()

		expect(order).toEqual(['delete:debugMode', 'patch', 'delete:debugStash'])
	})
})

describe('App.startInDebugMode (B1 shared boot-reentry path)', () => {
	test('lands state debug, patches + stop/start, and NEVER polls container health', async () => {
		const {app, patchComposeFile} = makeApp({initialStore: {debugMode: true}})

		const result = await app.startInDebugMode()

		expect(result).toBe(true)
		expect(app.state).toBe('debug')
		expect(patchComposeFile).toHaveBeenCalledTimes(1)
		expect(mockAppScript).toHaveBeenCalledTimes(2)
		expect(mockPollContainerHealth).not.toHaveBeenCalled()
	})

	test('appScript throwing before success unwedges to ready and re-throws (mirrors restart guard)', async () => {
		const {app} = makeApp({initialStore: {debugMode: true}})
		mockAppScript.mockRejectedValueOnce(new Error('compose stop failed'))

		await expect(app.startInDebugMode()).rejects.toThrow('compose stop failed')
		expect(app.state).toBe('ready')
	})
})

// 343-review WARN-01: a failed exit (debugMode deleted, but patchComposeFile threw before the
// stash was cleared → compose left on sleep-infinity, stash still present) must NOT let a re-enter
// overwrite the ORIGINAL stash with the ['sleep','infinity'] suppression literal — otherwise the
// next exit would "restore" sleep-infinity permanently and wedge the app frozen forever.
describe('343-review WARN-01: enterDebugMode never re-captures a suppressed compose', () => {
	test('failed-exit then re-enter keeps the ORIGINAL stash, so a later exit restores the real entrypoint (never sleep-infinity)', async () => {
		const {app, backing} = makeApp({
			compose: {
				services: {
					gitea: {image: 'gitea/gitea:latest', entrypoint: ['/usr/bin/entrypoint'], command: ['web'], healthcheck: {test: ['CMD', 'curl']}},
				},
			},
		})

		// 1. Enter debug: the ORIGINAL entrypoint is captured into the stash.
		await app.enterDebugMode()
		expect(backing.debugStash).toEqual({
			entrypoint: ['/usr/bin/entrypoint'],
			command: ['web'],
			healthcheck: {test: ['CMD', 'curl']},
		})

		// 2. Simulate a FAILED exit: exitDebugMode deleted debugMode, then patchComposeFile threw
		//    BEFORE the stash was cleared → debugMode absent, stash still present, and the on-disk
		//    compose is left on the sleep-infinity suppression.
		delete backing.debugMode
		vi.spyOn(app, 'readCompose').mockResolvedValue({
			services: {gitea: {image: 'gitea/gitea:latest', entrypoint: ['sleep', 'infinity'], command: [], healthcheck: {disable: true}}},
		} as any)

		// 3. Admin re-enters. The guard sees a surviving stash (AND a suppressed on-disk entrypoint)
		//    → it must NOT re-capture; the ORIGINAL stash survives untouched.
		await app.enterDebugMode()
		expect(app.state).toBe('debug')
		expect(backing.debugStash).toEqual({
			entrypoint: ['/usr/bin/entrypoint'],
			command: ['web'],
			healthcheck: {test: ['CMD', 'curl']},
		})
		expect((backing.debugStash as {entrypoint: unknown}).entrypoint).not.toEqual(['sleep', 'infinity'])

		// 4. A clean exit now restores the ORIGINAL entrypoint (the stash present at restore time is
		//    the original), then clears it — never sleep-infinity permanently.
		let stashAtRestore: unknown
		vi.spyOn(app, 'patchComposeFile').mockImplementation(async () => {
			stashAtRestore = backing.debugStash
		})
		await app.exitDebugMode()
		expect(stashAtRestore).toEqual({
			entrypoint: ['/usr/bin/entrypoint'],
			command: ['web'],
			healthcheck: {test: ['CMD', 'curl']},
		})
		expect(backing.debugStash).toBeUndefined()
		expect(app.state).toBe('ready')
	})

	test('re-enter with the stash absent but the on-disk entrypoint already suppressed still does NOT capture sleep-infinity', async () => {
		const {app, backing, set} = makeApp({
			compose: {
				services: {
					gitea: {image: 'gitea/gitea:latest', entrypoint: ['sleep', 'infinity'], command: [], healthcheck: {disable: true}},
				},
			},
		})

		await app.enterDebugMode()

		expect(app.state).toBe('debug')
		// The suppression literal was NEVER mistaken for the original + captured.
		expect(set).not.toHaveBeenCalledWith('debugStash', expect.anything())
		expect(backing.debugStash).toBeUndefined()
	})
})

// 343-review WARN-02: a compose-mutating accessor (setResourceLimits/setGpuAccess/…) patch-THEN-
// restarts; patchComposeFile re-applies the sleep-infinity suppression, so the recreated container
// is STILL frozen. The shared restart() path must land 'debug' (not 'ready') when the debugMode
// store key is set, or the app's state would lie about a frozen container.
describe('343-review WARN-02: restart preserves the debug state', () => {
	test('restart() on a debug app lands state debug, not ready', async () => {
		const {app} = makeApp({initialStore: {debugMode: true}})
		app.state = 'debug'

		const result = await app.restart()

		expect(result).toBe(true)
		expect(app.state).toBe('debug')
	})

	test('restart() with debugMode unset still lands ready (normal path unchanged)', async () => {
		const {app} = makeApp()

		const result = await app.restart()

		expect(result).toBe(true)
		expect(app.state).toBe('ready')
	})
})
