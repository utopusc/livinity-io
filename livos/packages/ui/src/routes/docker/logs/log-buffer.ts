// Phase 28 Plan 28-01 — bounded ring-buffer push helper (DOC-13).
//
// pushBounded returns a NEW array (immutable shape) so React detects the
// state update via reference equality. When the buffer is at capacity, the
// oldest entry is dropped (FIFO semantics).
//
// MAX_LINES_PER_CONTAINER bounds memory usage: at 5000 lines × ~200 bytes/line
// × 25 containers (T-28-02 multiplex cap) ≈ 25 MB worst case (T-28-05). The
// buffer is kept per-container, not global, so a chatty container can't
// starve a quiet one out of view.

export const MAX_LINES_PER_CONTAINER = 5000

/**
 * Append `item` to `buf`, returning a NEW array. If `buf.length >= cap`,
 * drop enough leading entries so the result has exactly `cap` items
 * (FIFO drop-oldest). Never mutates `buf` — referential immutability is
 * load-bearing for React's setState detection.
 */
export function pushBounded<T>(buf: T[], item: T, cap: number): T[] {
	if (buf.length < cap) {
		return [...buf, item]
	}
	// At-or-over capacity: keep the last (cap-1) items + the new one. The
	// `slice(buf.length - cap + 1)` math handles both `length === cap` (drop
	// 1) and `length > cap` (drop more) — defensive against an upstream caller
	// somehow handing us an over-cap buffer.
	return [...buf.slice(buf.length - cap + 1), item]
}
