/**
 * Phase 339-02 (STORD-02, D-339-2) — LUKS tRPC route + rate-limit tests.
 *
 * Pins the destructive trust boundary of the luks* routes WITHOUT ever reaching a
 * live cryptsetup/mkfs/mount (runLuks is inline in routes.ts and spawns sudo — every
 * assertion below rejects BEFORE it):
 *   V4 — every route is admin-gated (a non-admin member is refused before the resolver).
 *   V5 — every device input is DEVICE_ID_RE-zod-constrained before the wrapper.
 *   STEP-UP — luksFormat additionally demands a fresh step-up grant (fails closed
 *             without one), and re-checks membership / assertNotOsDisk / pool-member
 *             / already-encrypted BEFORE runLuks.
 *   RATE-LIMIT — the pure isRateLimited window check (10-per-15-min, 334 pattern).
 *
 * The eligibility module + assertNotOsDisk are mocked so the guard order is exercised
 * deterministically; runLuks is never reached (Windows host, no live disk).
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import {describe, beforeEach, expect, test, vi} from 'vitest'

const getLuksEligibleDisksMock = vi.fn()
const assertNotOsDiskMock = vi.fn()

vi.mock('../storage-pool/luks-eligibility.js', () => ({
	getLuksEligibleDisks: (...args: unknown[]) => getLuksEligibleDisksMock(...args),
	makeLuksEligibilityDeps: () => ({}),
}))
vi.mock('../storage-pool/root-disk.js', () => ({
	assertNotOsDisk: (...args: unknown[]) => assertNotOsDiskMock(...args),
}))

// Import AFTER the mocks are registered.
import system, {isRateLimited} from './routes.js'

function makeStubLivinityd(store?: {encryptedDisks?: unknown; storagePool?: unknown}) {
	let enc = store?.encryptedDisks
	const pool = store?.storagePool
	return {
		store: {
			get: async (k: string) => (k === 'encryptedDisks' ? enc : k === 'storagePool' ? pool : undefined),
			set: async (k: string, v: unknown) => {
				if (k === 'encryptedDisks') enc = v
				return true
			},
		},
		notifications: {add: async () => {}, clear: async () => {}},
		files: {},
	}
}

function makeCtx(opts: {role?: string; grant?: boolean; store?: unknown; userId?: string} = {}) {
	const userId = opts.userId ?? 'admin-1'
	return {
		currentUser: {id: userId, username: 'admin', role: opts.role ?? 'admin'},
		dangerouslyBypassAuthentication: true,
		logger: {error() {}, info() {}, warn() {}, verbose() {}, log() {}},
		livinityd: makeStubLivinityd(opts.store),
		request: opts.grant ? {cookies: {LIVINITY_STEPUP: 'grant-token'}} : undefined,
		server: opts.grant ? {verifyStepUpGrant: async () => ({userId, method: 'totp'})} : undefined,
	}
}

const caller = (opts?: Parameters<typeof makeCtx>[0]) => system.createCaller(makeCtx(opts))

beforeEach(() => {
	getLuksEligibleDisksMock.mockReset()
	assertNotOsDiskMock.mockReset()
	getLuksEligibleDisksMock.mockResolvedValue([])
	assertNotOsDiskMock.mockResolvedValue(undefined)
})

describe('luks router — namespace shape', () => {
	test('exposes list-eligible / list / status / format / open / close', () => {
		const procs = (system as any)._def?.procedures ?? {}
		for (const name of ['luksListEligible', 'luksList', 'luksStatus', 'luksFormat', 'luksOpen', 'luksClose']) {
			expect(procs[name]).toBeDefined()
		}
	})
})

describe('luks routes are admin-gated (V4)', () => {
	test('luksOpen rejects a non-admin (member) before the resolver', async () => {
		await expect(caller({role: 'member'}).luksOpen({deviceId: 'sdb', passphrase: 'x'})).rejects.toThrow()
	})
	test('luksClose rejects a non-admin', async () => {
		await expect(caller({role: 'member'}).luksClose({deviceId: 'sdb'})).rejects.toThrow()
	})
	test('luksList rejects a non-admin', async () => {
		await expect(caller({role: 'member'}).luksList()).rejects.toThrow()
	})
	test('luksListEligible rejects a non-admin', async () => {
		await expect(caller({role: 'member'}).luksListEligible()).rejects.toThrow()
	})
	test('luksStatus rejects a non-admin', async () => {
		await expect(caller({role: 'member'}).luksStatus({deviceId: 'sdb'})).rejects.toThrow()
	})
	test('luksFormat rejects a non-admin (role gate before step-up)', async () => {
		await expect(
			caller({role: 'member'}).luksFormat({deviceId: 'sdb', passphrase: 'correct-horse'}),
		).rejects.toThrow()
	})
})

describe('DEVICE_ID_RE zod rejects a malformed deviceId before the wrapper (V5)', () => {
	const BAD_IDS = ['', 'sda1', 'sda; reboot', '../../dev/sda', '/dev/sda', 'nvme0', 'SDA', 'sdaa ']

	test('luksOpen refuses every malformed device id (admin caller — only zod can reject)', async () => {
		for (const bad of BAD_IDS) {
			await expect(caller().luksOpen({deviceId: bad, passphrase: 'x'})).rejects.toThrow()
		}
	})
	test('luksClose refuses a malformed device id', async () => {
		await expect(caller().luksClose({deviceId: 'sda; rm -rf /'})).rejects.toThrow()
	})
	test('luksStatus refuses a malformed device id', async () => {
		await expect(caller().luksStatus({deviceId: 'not-a-device'})).rejects.toThrow()
	})
})

describe('luksFormat step-up + guard chain (rejects BEFORE runLuks)', () => {
	test('admin WITHOUT a step-up grant is refused (fails closed)', async () => {
		await expect(caller({grant: false}).luksFormat({deviceId: 'sdb', passphrase: 'correct-horse'})).rejects.toThrow()
		expect(getLuksEligibleDisksMock).not.toHaveBeenCalled()
	})

	test('a malformed device id is refused at the zod boundary even with a grant', async () => {
		await expect(caller({grant: true}).luksFormat({deviceId: 'sda; reboot', passphrase: 'correct-horse'})).rejects.toThrow()
	})

	test('a passphrase shorter than 12 chars is refused (zod min)', async () => {
		await expect(caller({grant: true}).luksFormat({deviceId: 'sdb', passphrase: 'short'})).rejects.toThrow()
	})

	test('a device NOT in the eligible set is refused (membership guard) before runLuks', async () => {
		getLuksEligibleDisksMock.mockResolvedValue([{id: 'sdc', model: 'x', size: 1, transport: 'unknown'}])
		await expect(caller({grant: true}).luksFormat({deviceId: 'sdb', passphrase: 'correct-horse'})).rejects.toThrow()
		expect(assertNotOsDiskMock).not.toHaveBeenCalled() // rejected at membership, before the TOCTOU re-check
	})

	test('an OS-disk TOCTOU re-check throw is refused before runLuks', async () => {
		getLuksEligibleDisksMock.mockResolvedValue([{id: 'sdb', model: 'x', size: 1, transport: 'unknown'}])
		assertNotOsDiskMock.mockRejectedValue(new Error('[refusing OS disk]'))
		await expect(caller({grant: true}).luksFormat({deviceId: 'sdb', passphrase: 'correct-horse'})).rejects.toThrow()
	})

	test('a pool-member disk is hard-blocked (belt-and-braces) before runLuks', async () => {
		getLuksEligibleDisksMock.mockResolvedValue([{id: 'sdb', model: 'x', size: 1, transport: 'unknown'}])
		const c = caller({grant: true, store: {storagePool: {members: [{deviceId: 'sdb', role: 'data'}]}}})
		await expect(c.luksFormat({deviceId: 'sdb', passphrase: 'correct-horse'})).rejects.toThrow()
	})

	test('an already-encrypted disk is hard-blocked before runLuks', async () => {
		getLuksEligibleDisksMock.mockResolvedValue([{id: 'sdb', model: 'x', size: 1, transport: 'unknown'}])
		const c = caller({
			grant: true,
			store: {encryptedDisks: [{deviceId: 'sdb', mountpoint: '/mnt/encrypted/sdb', createdAt: 1}]},
		})
		await expect(c.luksFormat({deviceId: 'sdb', passphrase: 'correct-horse'})).rejects.toThrow()
	})
})

describe('isRateLimited — pure unlock-throttle window (334 10-per-15-min)', () => {
	const WINDOW = 15 * 60_000
	const now = 1_000_000_000

	test('under the max within the window → NOT limited', () => {
		const stamps = Array.from({length: 9}, (_, i) => now - i * 1000)
		expect(isRateLimited(stamps, now, WINDOW, 10)).toBe(false)
	})

	test('at the max within the window → limited (the 10th is blocked)', () => {
		const stamps = Array.from({length: 10}, (_, i) => now - i * 1000)
		expect(isRateLimited(stamps, now, WINDOW, 10)).toBe(true)
	})

	test('entries older than the window are pruned (do not count)', () => {
		// 10 stamps but all older than 15 min → none count → not limited.
		const stamps = Array.from({length: 10}, (_, i) => now - WINDOW - 1 - i * 1000)
		expect(isRateLimited(stamps, now, WINDOW, 10)).toBe(false)
	})

	test('mixed: only in-window entries count toward the max', () => {
		const recent = Array.from({length: 9}, (_, i) => now - i * 1000) // 9 in-window
		const stale = Array.from({length: 5}, (_, i) => now - WINDOW - 1 - i * 1000) // 5 stale
		expect(isRateLimited([...recent, ...stale], now, WINDOW, 10)).toBe(false)
		expect(isRateLimited([...recent, now, ...stale], now, WINDOW, 10)).toBe(true) // 10 in-window
	})

	test('an empty history is never limited (cleared-on-success semantics)', () => {
		expect(isRateLimited([], now, WINDOW, 10)).toBe(false)
	})
})
