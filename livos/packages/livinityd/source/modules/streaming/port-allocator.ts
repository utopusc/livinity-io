/**
 * Phase 101-02 — per-app x11vnc stream port allocator.
 *
 * Replaces the inline `VNC_PORT_COUNTER` block at stream-manager.ts:43-49
 * (Phase 99 pattern) with an explicit `release()`-supporting allocator that
 * caps at 100 concurrent slots per D-101-PORT-ALLOC / D-101-PORT-RANGE-EXTEND.
 *
 * Range default [15900, 16000) — 100 slots. The previous inline counter wrapped
 * silently at 16100 and never recycled closed ports; this allocator hands out
 * distinct ports across the live range and `release()` returns them to the pool.
 *
 * Constructor options allow narrower ranges (used by tests). All accounting is
 * purely in-memory — the allocator does not bind sockets; the bind race for the
 * x11vnc process is covered by `attachVncBridge`'s 3×100ms retry (Pitfall 4
 * mitigation in vnc-bridge.ts).
 */

export class PortRangeExhaustedError extends Error {
	code = 'PORT_RANGE_EXHAUSTED'
	constructor(public range: {min: number; max: number}) {
		super(`port range [${range.min}, ${range.max}) is exhausted`)
		this.name = 'PortRangeExhaustedError'
	}
}

export interface PortAllocatorOpts {
	min?: number
	max?: number
}

/**
 * Linear-walking allocator over [min, max). On allocate(), advances a cursor
 * skipping in-use slots; wraps at max back to min. On release(), drops the
 * port from the in-use set. release() is idempotent and ignores out-of-range
 * values (no-op).
 */
export class PortAllocator {
	private readonly min: number
	private readonly max: number
	private cursor: number
	private readonly inUse = new Set<number>()

	constructor(opts: PortAllocatorOpts = {}) {
		this.min = opts.min ?? 15900
		this.max = opts.max ?? 16000
		if (!Number.isInteger(this.min) || !Number.isInteger(this.max)) {
			throw new Error(
				`PortAllocator: min/max must be integers (got min=${this.min}, max=${this.max})`,
			)
		}
		if (this.max <= this.min) {
			throw new Error(
				`PortAllocator: invalid range [${this.min}, ${this.max}) — max must be > min`,
			)
		}
		this.cursor = this.min
	}

	/**
	 * Allocate the next free port in the range. Skips in-use slots, wraps at
	 * max. Throws `PortRangeExhaustedError` when every slot is in use.
	 */
	allocate(): number {
		const capacity = this.max - this.min
		if (this.inUse.size >= capacity) {
			throw new PortRangeExhaustedError({min: this.min, max: this.max})
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
		throw new PortRangeExhaustedError({min: this.min, max: this.max})
	}

	/**
	 * Mark an already-known port as in-use WITHOUT advancing the cursor — the
	 * boot-priming primitive. Used to re-declare ports that were persisted before
	 * this (in-memory) allocator was constructed (e.g. VM registry records after a
	 * daemon restart), so a subsequent allocate() never re-hands-out a port that a
	 * live container already binds. Idempotent; out-of-range values are ignored
	 * (defensive — callers can reserve() unconditionally while priming).
	 */
	reserve(port: number): void {
		if (!Number.isInteger(port)) return
		if (port < this.min || port >= this.max) return
		this.inUse.add(port)
	}

	/**
	 * Release a port back to the available pool. Idempotent — double-release
	 * is a no-op. Ports outside the allocator's [min, max) range are silently
	 * ignored (defensive — callers can release() unconditionally on cleanup
	 * paths without first checking ownership).
	 */
	release(port: number): void {
		if (!Number.isInteger(port)) return
		if (port < this.min || port >= this.max) return
		this.inUse.delete(port)
	}

	/** Number of ports currently allocated. */
	get inUseCount(): number {
		return this.inUse.size
	}

	/** Total slots in the range (max - min). */
	get capacity(): number {
		return this.max - this.min
	}
}
