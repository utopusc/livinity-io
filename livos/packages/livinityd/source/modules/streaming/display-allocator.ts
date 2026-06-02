/**
 * Phase 102-01 — DisplayAllocator (D-102-DISPLAY-ALLOCATOR).
 *
 * Range [10, 100) = 90 slots. Linear-walker; release returns slot to pool;
 * out-of-range silent no-op. Companion to streaming/port-allocator.ts.
 *
 * Hands out integer display numbers from `[10, 100)` for per-app Xvfb spawn
 * (D-102-PER-APP-XVFB). Wave 2 plans 102-04 (window-manager rewrite) and
 * 102-05 (native-app-binder) compose this allocator with XvfbSpawner to
 * stand up dedicated per-app X displays — each app gets its own :N display
 * + Xvfb + Chrome process + x11vnc stream, eliminating cross-window stacking
 * (Issue 2) and 1920x1080 coord drift (Issue 1).
 *
 * Replaces the string-returning legacy `webapps/display-allocator.ts`
 * (Phase 100-10-01 scaffolding). The new return type `number` matches
 * `PortAllocator.allocate(): number` so the two allocators compose
 * symmetrically in window-manager / native-binder spawn bodies.
 *
 * Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (D-102-SACRED) — never touched.
 */

export class DisplayRangeExhaustedError extends Error {
	code = 'DISPLAY_RANGE_EXHAUSTED'
	constructor(public range: {min: number; max: number}) {
		super(`display range [${range.min}, ${range.max}) is exhausted`)
		this.name = 'DisplayRangeExhaustedError'
	}
}

export interface DisplayAllocatorOpts {
	min?: number
	max?: number
}

/**
 * Phase 255-03 (D-255-WEBAPP-REGISTER / Pitfall 2) — disjoint allocator ranges
 * so a WebApp-allocated `:N` can NEVER collide with an MCP `computer_create_display`
 * allocated `:N` within a single boot. WebApps own [10, 60); the MCP create()
 * displayManager allocator floor (`allocatorStart`) is 60, so it hands out
 * [60, ..). The two allocators share one Redis `:N` namespace but their ranges
 * are provably disjoint (max <= floor). A unit test (window-manager.test.ts
 * T-255-09) locks this invariant. The :1 host display is below both ranges and
 * registered via registerExisting (no allocator advance), so it never collides.
 */
export const WEBAPP_DISPLAY_ALLOCATOR_RANGE = {min: 10, max: 60} as const
export const MCP_CREATE_ALLOCATOR_START = 60

/**
 * Linear-walking allocator over [min, max). On allocate(), advances a cursor
 * skipping in-use slots; wraps at max back to min. On release(), drops the
 * display from the in-use set. release() is idempotent and ignores out-of-range
 * values (no-op).
 */
export class DisplayAllocator {
	private readonly min: number
	private readonly max: number
	private cursor: number
	private readonly inUse = new Set<number>()

	constructor(opts: DisplayAllocatorOpts = {}) {
		this.min = opts.min ?? 10
		this.max = opts.max ?? 100
		if (!Number.isInteger(this.min) || !Number.isInteger(this.max)) {
			throw new Error(
				`DisplayAllocator: min/max must be integers (got min=${this.min}, max=${this.max})`,
			)
		}
		if (this.max <= this.min) {
			throw new Error(
				`DisplayAllocator: invalid range [${this.min}, ${this.max}) — max must be > min`,
			)
		}
		this.cursor = this.min
	}

	/**
	 * Allocate the next free display in the range. Skips in-use slots, wraps at
	 * max. Throws `DisplayRangeExhaustedError` when every slot is in use.
	 */
	allocate(): number {
		const capacity = this.max - this.min
		if (this.inUse.size >= capacity) {
			throw new DisplayRangeExhaustedError({min: this.min, max: this.max})
		}
		// Walk at most `capacity` candidates — guaranteed to find a free slot
		// because we already checked size < capacity above.
		for (let attempts = 0; attempts < capacity; attempts++) {
			const candidate = this.cursor
			this.cursor += 1
			if (this.cursor >= this.max) this.cursor = this.min
			if (!this.inUse.has(candidate)) {
				this.inUse.add(candidate)
				return candidate
			}
		}
		// Unreachable given the size check above, but guard anyway.
		throw new DisplayRangeExhaustedError({min: this.min, max: this.max})
	}

	/**
	 * Release a display back to the available pool. Idempotent — double-release
	 * is a no-op. Displays outside the allocator's [min, max) range are silently
	 * ignored (defensive — callers can release() unconditionally on cleanup
	 * paths without first checking ownership).
	 */
	release(display: number): void {
		if (!Number.isInteger(display)) return
		if (display < this.min || display >= this.max) return
		this.inUse.delete(display)
	}

	/** Number of displays currently allocated. */
	get inUseCount(): number {
		return this.inUse.size
	}

	/** Total slots in the range (max - min). */
	get capacity(): number {
		return this.max - this.min
	}
}
