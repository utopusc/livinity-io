/**
 * Phase 347-01 (PWR-01, D-347-2) — power-profile tRPC route tests.
 *
 * Pins the trust boundary of the powerProfile* routes WITHOUT a live sudo/powerprofilesctl:
 *   V4 — both routes are admin-gated (a non-admin member is refused before the resolver).
 *   ZOD — powerProfileSet rejects any profile NOT in the z.enum(['balanced','power-saver',
 *         'performance']) at the input boundary, BEFORE spawn is ever reached.
 *   MIRROR — an admin sets a valid profile WITHOUT any lockoutAcknowledged input and the
 *            {active} profile is mirrored into the display-only `power` store key. WARN-4:
 *            child_process.spawn is MOCKED to emit close(0) so runPower returns {ok:true}
 *            and the store-mirror branch is genuinely exercised offline (not the live-only
 *            {ok:false} degrade path on a Windows host).
 *   NO-ACK — powerProfileSet needs NO lockoutAcknowledged (contrast powerScheduleSet, which
 *            throws without its z.literal(true) ack) — proves the reversibility posture.
 *
 * spawn is the ONLY external effect; the admin-gate + zod tests reject before it, and the
 * mirror tests drive it through a controllable fake child.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import {EventEmitter} from 'events'
import {describe, beforeEach, expect, test, vi} from 'vitest'

const spawnMock = vi.fn()

// Mock child_process but keep every other export intact — routes.ts (and its transitive
// imports) pull additional symbols from child_process; spreading the actual module avoids
// breaking those at load while overriding ONLY spawn (the runPower effect under test).
vi.mock('child_process', async (importActual) => {
	const actual = await importActual<typeof import('child_process')>()
	return {...actual, spawn: (...args: unknown[]) => spawnMock(...args)}
})

// Import AFTER the mock is registered.
import system from './routes.js'

// A controllable fake ChildProcess: emits optional stdout/stderr then `close` with `code`
// on the next tick (after runPower has attached its listeners).
function makeChild({code = 0, stdout = '', stderr = ''} = {}) {
	const child = new EventEmitter() as EventEmitter & {stdout: EventEmitter; stderr: EventEmitter; kill: () => void}
	child.stdout = new EventEmitter()
	child.stderr = new EventEmitter()
	child.kill = () => {}
	process.nextTick(() => {
		if (stdout) child.stdout.emit('data', Buffer.from(stdout))
		if (stderr) child.stderr.emit('data', Buffer.from(stderr))
		child.emit('close', code)
	})
	return child
}

function makeStubLivinityd(initialPower?: unknown) {
	const store: {power?: unknown} = {power: initialPower}
	return {
		store: {
			get: async (k: string) => (k === 'power' ? store.power : undefined),
			set: async (k: string, v: unknown) => {
				if (k === 'power') store.power = v
				return true
			},
		},
		__store: store,
		notifications: {add: async () => {}, clear: async () => {}},
		files: {},
	}
}

function makeCtx(opts: {role?: string; livinityd?: unknown} = {}) {
	return {
		currentUser: {id: 'admin-1', username: 'admin', role: opts.role ?? 'admin'},
		dangerouslyBypassAuthentication: true,
		logger: {error() {}, info() {}, warn() {}, verbose() {}, log() {}},
		livinityd: opts.livinityd ?? makeStubLivinityd(),
		request: undefined,
		server: undefined,
	}
}

const caller = (opts?: Parameters<typeof makeCtx>[0]) => system.createCaller(makeCtx(opts))

beforeEach(() => {
	spawnMock.mockReset()
	// Default: wrapper succeeds (exit 0) — profile-set/get happy path.
	spawnMock.mockImplementation(() => makeChild({code: 0, stdout: 'ok\n'}))
})

describe('powerProfile router — namespace shape', () => {
	test('exposes powerProfileSet + powerProfileGet', () => {
		const procs = (system as any)._def?.procedures ?? {}
		expect(procs.powerProfileSet).toBeDefined()
		expect(procs.powerProfileGet).toBeDefined()
	})
})

describe('powerProfile routes are admin-gated (V4)', () => {
	test('powerProfileSet rejects a non-admin (member) before the resolver', async () => {
		await expect(caller({role: 'member'}).powerProfileSet({profile: 'balanced'})).rejects.toThrow()
		expect(spawnMock).not.toHaveBeenCalled()
	})
	test('powerProfileGet rejects a non-admin', async () => {
		await expect(caller({role: 'member'}).powerProfileGet()).rejects.toThrow()
		expect(spawnMock).not.toHaveBeenCalled()
	})
})

describe('powerProfileSet zod-enum rejects an out-of-enum profile before spawn', () => {
	const BAD = ['turbo', '', 'BALANCED', 'balanced; reboot', 'power_saver', 'performance ']

	test('every non-enum profile is refused at the zod boundary (admin caller)', async () => {
		for (const bad of BAD) {
			spawnMock.mockClear()
			await expect(caller().powerProfileSet({profile: bad})).rejects.toThrow()
			expect(spawnMock).not.toHaveBeenCalled()
		}
	})
})

describe('powerProfileSet applies + mirrors {active} WITHOUT a lockout ack (WARN-4, spawn mocked)', () => {
	for (const profile of ['balanced', 'power-saver', 'performance']) {
		test(`accepts '${profile}' (no lockoutAcknowledged) and mirrors it into power.profiles`, async () => {
			const liv = makeStubLivinityd({wol: ['eth0']}) // pre-existing state must survive the merge
			const res = await system.createCaller(makeCtx({livinityd: liv})).powerProfileSet({profile})
			expect(res.ok).toBe(true)
			// The store-mirror branch (result.ok) ran offline because spawn emitted close(0).
			expect(liv.__store.power.profiles).toEqual({active: profile})
			expect(liv.__store.power.wol).toEqual(['eth0']) // existing field preserved, not clobbered
			expect(typeof liv.__store.power.lastAppliedAt).toBe('number')
			// The wrapper was invoked with the exact validated argv (no injection surface).
			expect(spawnMock).toHaveBeenCalledWith(
				'sudo',
				['-n', expect.stringContaining('livos-power.sh'), 'profile-set', profile],
				expect.any(Object),
			)
		})
	}

	test('a failing wrapper (exit 1) does NOT mirror into the store', async () => {
		spawnMock.mockImplementation(() => makeChild({code: 1, stderr: 'powerprofilesctl not installed'}))
		const liv = makeStubLivinityd({})
		const res = await system.createCaller(makeCtx({livinityd: liv})).powerProfileSet({profile: 'balanced'})
		expect(res.ok).toBe(false)
		expect(liv.__store.power?.profiles).toBeUndefined() // store write only happens on ok
	})
})

describe('reversibility posture — no acknowledgment gate (contrast powerScheduleSet)', () => {
	test('powerProfileSet resolves with NO lockoutAcknowledged input', async () => {
		// The input object carries ONLY {profile} — no ack key — and still resolves.
		const res = await caller().powerProfileSet({profile: 'performance'})
		expect(res.ok).toBe(true)
	})
	test('powerScheduleSet (the irreversible sibling) REJECTS without lockoutAcknowledged', async () => {
		await expect(caller().powerScheduleSet({shutdown: '23:00', wake: '07:00'})).rejects.toThrow()
	})
})

describe('powerProfileGet is a read-only query (no store write)', () => {
	test('an admin gets the wrapper stdout and no store mutation occurs', async () => {
		const liv = makeStubLivinityd({profiles: {active: 'balanced'}})
		const res = await system.createCaller(makeCtx({livinityd: liv})).powerProfileGet()
		expect(res.ok).toBe(true)
		expect(liv.__store.power).toEqual({profiles: {active: 'balanced'}}) // unchanged
		expect(spawnMock).toHaveBeenCalledWith(
			'sudo',
			['-n', expect.stringContaining('livos-power.sh'), 'profile-get'],
			expect.any(Object),
		)
	})
})
