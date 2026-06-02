/**
 * Phase 255-01 (Wave 0 RED) — `displays.screenshot` authorization + dataUrl
 * contract.
 *
 * RED-before-GREEN (Nyquist): the `displays.screenshot` procedure does NOT
 * exist yet on `displaysRouter` — only `displays.list` and
 * `displays.getVncUrl` are mounted (trpc-router.ts). The GREEN comes in plan
 * 255-02, which adds a `query` returning {dataUrl, width, height} after the
 * same canAccessDisplay auth block getVncUrl uses, backed by a
 * subprocess-scoped captureScreenshot({display}). Until then:
 *
 *   - Tests 1-3 (PURE auth matrix) PASS today — they exercise the already-
 *     exported `canAccessDisplay` (trpc-router.ts:64-72), locking the exact
 *     authorization contract the screenshot handler MUST reuse.
 *   - Tests 4-6 (HANDLER shape) FAIL today (RED) because
 *     `displaysRouter._def.procedures.screenshot` is undefined — the handler
 *     is unimplemented. These are the GREEN gate for 255-02.
 *
 * Why a query (not a mutation): the displays-popover polls each card via
 * useQuery({enabled: open, refetchInterval: 2000}), so no httpOnlyPaths entry
 * is needed (unlike getVncUrl, which spawns a survive-reconnect x11vnc).
 */

import {beforeEach, describe, expect, it, vi} from 'vitest'

import {canAccessDisplay, displaysRouter} from '../trpc-router.js'

// The screenshot handler (255-02 GREEN) will call captureScreenshot({display}).
// Stub it now so the handler-shape tests assert the dataUrl wrap, not the
// real maim/scrot subprocess. Returns the JPEG-transcode shape the existing
// native module produces (sharp q60 → image/jpeg).
vi.mock('../native/screenshot.js', () => ({
	captureScreenshot: vi.fn().mockResolvedValue({
		base64: 'AAAA',
		mimeType: 'image/jpeg',
		width: 1280,
		height: 720,
	}),
}))

// ── Tests 1-3: PURE auth matrix (canAccessDisplay) ───────────────────
//
// The screenshot route MUST reuse canAccessDisplay verbatim (PATTERNS.md
// "Display authorization — REUSE, do not rebuild"). These three lock the
// contract a foreign member is FORBIDDEN, an admin bypasses, and host/shared
// is open — identical to getVncUrl's contract.

describe('displays.screenshot — authorization matrix (canAccessDisplay reuse)', () => {
	it('Test 1: a foreign member cannot screenshot another user’s display', () => {
		expect(
			canAccessDisplay({ownerSession: 'userB', callerSession: 'userA', callerRole: 'member'}),
		).toBe(false)
	})

	it('Test 2: 254-06 admin bypass holds for screenshots', () => {
		expect(
			canAccessDisplay({ownerSession: 'userB', callerSession: 'userA', callerRole: 'admin'}),
		).toBe(true)
	})

	it('Test 3: host/shared (empty owner_session) :1 screenshot is allowed', () => {
		expect(
			canAccessDisplay({ownerSession: '', callerSession: 'userA', callerRole: 'member'}),
		).toBe(true)
	})
})

// ── Tests 4-6: HANDLER shape (displays.screenshot) ───────────────────
//
// These drive the UNIMPLEMENTED procedure. `displaysRouter._def.procedures`
// is the tRPC v10 internal procedure map; `.screenshot` is undefined until
// 255-02 mounts it, so resolving it throws → RED for the right reason
// (missing handler), not a pre-existing breakage.

/** Resolve the screenshot procedure's resolver fn, or throw if unmounted. */
function getScreenshotResolver(): (opts: {ctx: unknown; input: unknown}) => Promise<unknown> {
	const procs = (displaysRouter as unknown as {_def: {procedures: Record<string, unknown>}})._def
		.procedures
	const proc = procs.screenshot as
		| {_def?: {resolver?: (opts: {ctx: unknown; input: unknown}) => Promise<unknown>}}
		| undefined
	if (!proc || typeof proc._def?.resolver !== 'function') {
		// RED: 255-02 not yet implemented. The thrown message names the gap so
		// the failure is unambiguous.
		throw new Error('displays.screenshot procedure is not mounted on displaysRouter')
	}
	return proc._def.resolver
}

function makeFakeDisplayManager(record: {display: string; owner_session: string; width: number; height: number}) {
	return {
		list: vi.fn().mockResolvedValue([record]),
	}
}

function makeCtx(over: Record<string, unknown> = {}): unknown {
	return {
		currentUser: {id: 'userA', role: 'member'},
		livinityd: {
			displayManager: makeFakeDisplayManager({
				display: ':10',
				owner_session: 'userA',
				width: 1280,
				height: 720,
			}),
		},
		logger: {log() {}},
		...over,
	}
}

describe('displays.screenshot — handler shape (RED until 255-02)', () => {
	let resolve: (opts: {ctx: unknown; input: unknown}) => Promise<unknown>

	beforeEach(() => {
		// Throws here (RED) until 255-02 mounts displays.screenshot.
		resolve = getScreenshotResolver()
	})

	it('Test 4: no ctx.currentUser → throws UNAUTHORIZED', async () => {
		await expect(
			resolve({ctx: makeCtx({currentUser: undefined}), input: {display: ':10'}}),
		).rejects.toMatchObject({code: 'UNAUTHORIZED'})
	})

	it('Test 5: displayManager undefined → throws SERVICE_UNAVAILABLE', async () => {
		await expect(
			resolve({
				ctx: makeCtx({livinityd: {displayManager: undefined}}),
				input: {display: ':10'},
			}),
		).rejects.toMatchObject({code: 'SERVICE_UNAVAILABLE'})
	})

	it('Test 6: an owned display returns {dataUrl: data:image/jpeg;base64,…, width, height}', async () => {
		const result = (await resolve({ctx: makeCtx(), input: {display: ':10'}})) as {
			dataUrl: string
			width: number
			height: number
		}
		expect(result.dataUrl).toMatch(/^data:image\/jpeg;base64,/)
		expect(typeof result.width).toBe('number')
		expect(typeof result.height).toBe('number')
	})
})
