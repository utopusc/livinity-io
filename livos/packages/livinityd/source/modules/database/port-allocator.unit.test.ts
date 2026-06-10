// Phase 263.5-0 — host-aware port allocator unit tests.
//
// Locks down the PURE selection algorithm `nextFreePort` that backs
// `allocatePort()` (database/index.ts). The DB + `ss` wiring lives in
// allocatePort; the collision logic lives here and is tested in isolation
// (mirrors the chrome-launch.ts / host-allowlist.ts factory-extraction pattern
// from Phase 263).
//
// Root cause being fixed (port-collision v3 plan §2.1/§2.2): the old allocator
// did `SELECT MAX(port)+1` over its own table — blind to host-bound ports and
// non-atomic across concurrent installs. `nextFreePort` must:
//   A: skip ports already in the DB (usedPorts)
//   B: skip host-bound ports (injected probe) — the actual bug
//   C: skip in-flight reserved ports (concurrent-install race bridge)
//   D: ignore EXPIRED reservations (self-heal after a failed install)
//   E: reuse a freed interior gap (old MAX+1 leaked them forever)
//   F: respect the floor
//   G: throw when the range is exhausted (no silent 0/NaN)
//   H: pick the lowest free port deterministically

import {describe, it, expect} from 'vitest'

import {nextFreePort, PORT_FLOOR} from './index.js'

const neverBound = async () => false

describe('nextFreePort — host-aware port selection', () => {
	it('A: skips ports already taken in the DB', async () => {
		const used = new Set<number>([PORT_FLOOR, PORT_FLOOR + 1])
		const port = await nextFreePort({
			usedPorts: used,
			reserved: new Map(),
			isPortInUse: neverBound,
			now: 0,
		})
		expect(port).toBe(PORT_FLOOR + 2)
	})

	it('B: skips a host-bound port the DB never saw (the core bug)', async () => {
		const boundPort = PORT_FLOOR // pretend a system service / manual container holds the floor
		const port = await nextFreePort({
			usedPorts: new Set(),
			reserved: new Map(),
			isPortInUse: async (p) => p === boundPort,
			now: 0,
		})
		expect(port).toBe(PORT_FLOOR + 1)
	})

	it('C: skips a port reserved by a concurrent in-flight install', async () => {
		const reserved = new Map<number, number>([[PORT_FLOOR, 10_000]])
		const port = await nextFreePort({
			usedPorts: new Set(),
			reserved,
			isPortInUse: neverBound,
			now: 5_000, // before expiry → still reserved
		})
		expect(port).toBe(PORT_FLOOR + 1)
	})

	it('D: ignores an EXPIRED reservation (self-heal after a failed install)', async () => {
		const reserved = new Map<number, number>([[PORT_FLOOR, 10_000]])
		const port = await nextFreePort({
			usedPorts: new Set(),
			reserved,
			isPortInUse: neverBound,
			now: 20_000, // after expiry → port is free again
		})
		expect(port).toBe(PORT_FLOOR)
	})

	it('E: reuses a freed interior gap instead of climbing (old MAX+1 leaked it)', async () => {
		// DB holds floor, floor+2, floor+3 — floor+1 was uninstalled and should be reused.
		const used = new Set<number>([PORT_FLOOR, PORT_FLOOR + 2, PORT_FLOOR + 3])
		const port = await nextFreePort({
			usedPorts: used,
			reserved: new Map(),
			isPortInUse: neverBound,
			now: 0,
		})
		expect(port).toBe(PORT_FLOOR + 1)
	})

	it('F: respects an explicit floor', async () => {
		const port = await nextFreePort({
			usedPorts: new Set(),
			reserved: new Map(),
			isPortInUse: neverBound,
			floor: 20_000,
			ceiling: 20_010,
			now: 0,
		})
		expect(port).toBe(20_000)
	})

	it('G: throws when the range is exhausted (no silent fallback)', async () => {
		await expect(
			nextFreePort({
				usedPorts: new Set(),
				reserved: new Map(),
				isPortInUse: async () => true, // every port bound
				floor: 20_000,
				ceiling: 20_003,
				now: 0,
			}),
		).rejects.toThrow(/No free port/)
	})

	it('H: combines all three exclusions and picks the lowest free port', async () => {
		const used = new Set<number>([PORT_FLOOR]) // DB-taken
		const reserved = new Map<number, number>([[PORT_FLOOR + 1, 10_000]]) // in-flight
		const port = await nextFreePort({
			usedPorts: used,
			reserved,
			isPortInUse: async (p) => p === PORT_FLOOR + 2, // host-bound
			now: 0,
		})
		expect(port).toBe(PORT_FLOOR + 3)
	})
})
