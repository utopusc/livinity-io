/**
 * Phase 100-10-01 — DisplayAllocator (D-100-10-A).
 *
 * Allocates and releases X display numbers starting at :10. Per-WebApp
 * displays eliminate cross-window stacking (Issue 2 from 100-10-CONTEXT)
 * and let `x11vnc -display :N` capture the entire display so Chrome's full
 * pixels are streamed regardless of window state (Issue 1).
 *
 * Free numbers are reused before climbing higher — `release(:11)` followed
 * by `allocate()` returns `:11` again, not `:13`. Unknown release calls are
 * silent no-ops (e.g., a stale close path racing with a respawn shouldn't
 * throw).
 *
 * Lifecycle: WebAppWindowManager.spawn() calls allocate() before Chrome
 * spawn; close() calls release() after Chrome teardown. The allocator does
 * not own Xvfb / fluxbox lifecycle itself — those are spawned per-display
 * by window-manager when an allocation occurs.
 *
 * Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (D-100-SACRED) — never touched.
 */
import {EventEmitter} from 'node:events'

export interface DisplayAllocator extends EventEmitter {
	allocate(): string
	release(display: string): void
	inUse(): string[]
}

/** First display number handed out. `:0` reserved for GNOME, `:1` for the
 * legacy 100-08-01 single-display Xvfb fallback (back-compat path). Per-WebApp
 * displays start at `:10` to leave headroom for ad-hoc operator use of `:2..:9`. */
const BASE = 10

export function createDisplayAllocator(): DisplayAllocator {
	const allocated = new Set<number>()
	const ee = new EventEmitter() as DisplayAllocator

	ee.allocate = () => {
		// Walk from BASE upward to find the smallest free slot. This naturally
		// reuses released slots before climbing — the test suite's
		// T-10-01-02 lock.
		let n = BASE
		while (allocated.has(n)) n++
		allocated.add(n)
		const display = `:${n}`
		ee.emit('display:allocated', {display})
		return display
	}

	ee.release = (display: string) => {
		const n = Number(display.replace(/^:/, ''))
		if (!Number.isFinite(n) || !allocated.has(n)) {
			// Unknown release — silent no-op (T-10-01-03 lock).
			return
		}
		allocated.delete(n)
		ee.emit('display:released', {display})
	}

	ee.inUse = () => Array.from(allocated).sort((a, b) => a - b).map((n) => `:${n}`)

	return ee
}
