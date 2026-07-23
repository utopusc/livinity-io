/**
 * Phase 364-03 (VMENC-01) — the gate-fidelity TRIPWIRE for the hardware-encoded
 * VM screen surface.
 *
 * This is the single most important gate-fidelity point in the phase
 * (VMENC-RESEARCH §9). The realistic failure mode is NOT a wrong behavioral
 * assertion — it is a copy-paste of the `/vm/<id>/websockify` STRONG gate
 * drifting from the original over time (the 353 CR-01 privilege-reversal class:
 * a future edit swapping `verifySessionFull` for the weaker `verifyToken`, or a
 * `privateProcedure` sneaking into the admin-only vm router). A behavioral test
 * cannot prove that NEGATIVE; a source-regex over the exact branch can.
 *
 * The `/ws/vm-stream/<streamId>` WS branch is bracketed by two UNIQUE sentinel
 * comments; we slice ONLY that branch out of the (huge, multi-gate) server file
 * so the assertion can never be satisfied by the OTHER branches'
 * verifySessionFull / verifyToken usage elsewhere in the same file. This mirrors
 * vm-boundary.test.ts's readFileSync source-assertion idiom.
 *
 * The NEGATIVE assertions (no verifyToken in the branch, no privateProcedure in
 * the vm router) run against a COMMENT-STRIPPED copy of the source: the design
 * prose legitimately NAMES the primitives it deliberately avoids ("NOT the
 * weaker verifyToken…", "riding streaming's privateProcedure would be a
 * regression"), so a raw substring match would false-positive on the very
 * documentation that explains the gate. Stripping comments makes the tripwire
 * assert the CODE — which is exactly the regression it must catch.
 */

import {readFileSync} from 'node:fs'
import {describe, expect, test} from 'vitest'

/** Strip block (/* … *\/) and line (// …) comments so the tripwire asserts CODE, not prose. */
function stripComments(s: string): string {
	return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const serverSrc = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8')
const routerSrc = readFileSync(new URL('./trpc-router.ts', import.meta.url), 'utf8')

// Slice ONLY the vm-stream branch between the sentinels — NOT the whole file.
const START = '// ── VMENC vm-stream WS (strong-gated) START ──'
const END = '// ── VMENC vm-stream WS END ──'
const startIdx = serverSrc.indexOf(START)
const endIdx = serverSrc.indexOf(END)
const branch = startIdx >= 0 && endIdx >= 0 ? serverSrc.slice(startIdx, endIdx) : ''
const branchCode = stripComments(branch)
const routerCode = stripComments(routerSrc)

describe('vm-stream WS branch uses the STRONG gate, never the weak one — T-364-11/16', () => {
	test('both sentinel comments are present (the branch is sliceable)', () => {
		expect(startIdx).toBeGreaterThanOrEqual(0)
		expect(endIdx).toBeGreaterThan(startIdx)
		expect(branch.length).toBeGreaterThan(0)
	})

	test('the branch calls verifySessionFull (revocation/deactivation kills the stream)', () => {
		expect(branchCode).toContain('verifySessionFull')
	})

	test("the branch enforces the admin-role check (role !== 'admin' → 403)", () => {
		expect(branchCode).toMatch(/!==\s*'admin'/)
	})

	// The 353 CR-01 tripwire: the weaker verifyToken (signature+exp only, no
	// revocation, no admin gate — correct for the member /ws/stream path) must
	// NEVER be CALLED in the VM stream path. If a future edit rides that gate,
	// this fails the build, not the review. Asserted on comment-stripped code so
	// the branch's own explanatory prose (which names verifyToken to say it is
	// avoided) does not false-positive.
	test('the branch does NOT call verifyToken (the weak member gate must never appear in code here)', () => {
		expect(branchCode).not.toContain('verifyToken')
	})

	// Kind isolation (T-364-13): the route only ever attaches to a 'vm-fmp4'
	// session — never a member fmp4/vnc host-app stream.
	test("the branch attaches only to a 'vm-fmp4' session", () => {
		expect(branchCode).toContain("'vm-fmp4'")
	})
})

// Phase 367 (VMENC-03) — the input relay rides the ALREADY-ADMITTED vm-stream socket.
// The extension of the same tripwire: prove the ws.on('message') input handler exists
// ONLY inside the sentinel-bracketed strong-gated branch (it inherits the gate above it),
// that validation goes through the behaviorally-tested pure module (no inline ad-hoc
// parse), that persistent garbage is strike-enforced in-branch, and that NO second
// input route (which would need its own gate copy — the drift hazard) ever appears.
describe('the vm-stream input relay lives ONLY inside the gated branch — T-367-08', () => {
	test("the branch handles inbound frames (on('message') listener in-branch)", () => {
		expect(branchCode).toContain("on('message'")
	})

	test('the branch validates via parseVmInput (the tested pure module, not ad-hoc parsing)', () => {
		expect(branchCode).toContain('parseVmInput')
	})

	test('the branch relays via sendVmInput and enforces the strike limit with close(1008', () => {
		expect(branchCode).toContain('sendVmInput')
		expect(branchCode).toContain('close(1008')
	})

	// The relay must be callable from the gated branch ONLY. (parseVmInput legitimately
	// appears once outside as the top-of-file import — its absence is NOT asserted.)
	test('sendVmInput appears NOWHERE outside the sentinels (comment-stripped)', () => {
		const outsideCode = stripComments(serverSrc.slice(0, startIdx) + serverSrc.slice(endIdx))
		expect(outsideCode).not.toContain('sendVmInput')
	})

	test('NO /ws/vm-input route exists (no second gate copy, ever)', () => {
		expect(serverSrc).not.toMatch(/\/ws\/vm-input/)
	})
})

describe('the vm encode tRPC procedures are adminProcedure, never privateProcedure — T-364-12/16', () => {
	test('startEncodedScreen is registered as adminProcedure', () => {
		expect(routerCode).toMatch(/startEncodedScreen:\s*adminProcedure/)
	})
	test('stopEncodedScreen is registered as adminProcedure', () => {
		expect(routerCode).toMatch(/stopEncodedScreen:\s*adminProcedure/)
	})
	// The whole vm router is admin-only (VMSEC-02 — no member-VM surface). A
	// privateProcedure appearing in CODE (an import or a `: privateProcedure`
	// registration) would be the privilege regression VMENC-RESEARCH §9 warns
	// about. Asserted on comment-stripped code so the file's design prose (which
	// documents the deliberate absence of a member procedure) does not
	// false-positive.
	test('the vm router CODE contains NO privateProcedure (admin-only by construction)', () => {
		expect(routerCode).not.toContain('privateProcedure')
	})
})
