// Phase 342 — App lifecycle depth (APPD-01 maintenance-window + APPD-02 CPU pinning).
//
// PURE module — no daemon/disk/FileStore imports. Exports the three side-effect-free
// helpers consumed by the scheduler (isWithinUpdateWindow) and the admin routes
// (validateCpuSet / validateUpdateWindow semantic guards before persist).

// Parse an "HH:MM" 24h box-local time to minutes-since-midnight. Returns null on any
// malformed input (defensive — the route zod-shapes window strings but the scheduler
// reads raw store values, so isWithinUpdateWindow must never throw on a corrupt read).
function hhmmToMinutes(s: string): number | null {
	const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s)
	if (!m) return null
	return Number(m[1]) * 60 + Number(m[2])
}

// 342-01 APPD-01: is `now` inside [start, end)? START-INCLUSIVE, END-EXCLUSIVE.
// Wrap-past-midnight allowed (start > end, e.g. 23:00→02:00). Any malformed time or
// start===end → false (defensive; the route rejects those before persist).
export function isWithinUpdateWindow(now: Date, window: {start: string; end: string}): boolean {
	const startMin = hhmmToMinutes(window.start)
	const endMin = hhmmToMinutes(window.end)
	if (startMin == null || endMin == null) return false
	if (startMin === endMin) return false
	const nowMin = now.getHours() * 60 + now.getMinutes()
	if (startMin < endMin) {
		// Non-wrap window: a single contiguous span.
		return nowMin >= startMin && nowMin < endMin
	}
	// Wrap-past-midnight window: two spans [start, 24:00) and [00:00, end).
	return nowMin >= startMin || nowMin < endMin
}

// 342-01 APPD-02: SEMANTIC validation of a cpuset string (the route zod already shaped
// it as `\d{1,3}(-\d{1,3})?(,…)*`). Returns an error string, or null when valid. A bad
// cpuset makes `compose up` refuse and BRICKS the app until cleared (same failure class
// as the 326 WR-02 6MB memory floor) — reject before persist. CPUs are 0-indexed, so the
// valid max index is coreCount-1; a range `a-b` requires a <= b.
export function validateCpuSet(spec: string, coreCount: number): string | null {
	for (const token of spec.split(',')) {
		// INFO-01 (defense-in-depth): reject an empty segment BEFORE Number() coercion —
		// Number('') === 0, so "0,,2" / ",0" / "" would otherwise pass as a valid index 0 if a
		// future caller ever bypasses the route regex pre-gate. Reject empty tokens outright.
		if (token === '') {
			return 'Empty CPU segment is not allowed (stray or leading/trailing comma)'
		}
		const parts = token.split('-')
		if (parts.length === 1) {
			const idx = Number(parts[0])
			if (!Number.isInteger(idx) || idx < 0 || idx >= coreCount) {
				return `CPU index ${idx} is out of range (this box has ${coreCount} core(s): valid 0-${coreCount - 1})`
			}
		} else {
			// INFO-01: reject an empty range endpoint ("0-" / "-2") — Number('') === 0 would
			// otherwise coerce a missing endpoint to a spurious 0 and pass validation.
			if (parts[0] === '' || parts[1] === '') {
				return `CPU range ${token} has an empty endpoint`
			}
			const a = Number(parts[0])
			const b = Number(parts[1])
			if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= coreCount || b >= coreCount) {
				return `CPU range ${token} is out of range (this box has ${coreCount} core(s): valid 0-${coreCount - 1})`
			}
			if (a > b) {
				return `CPU range ${token} is descending (start must be <= end)`
			}
		}
	}
	return null
}

// 342-01 APPD-01: SEMANTIC validation of a maintenance window before persist. Returns an
// error string, or null when valid. Rejects malformed HH:MM, start===end (inert), and any
// span shorter than 30 minutes (guarantees ≥1 tick of the */15 app-update-window job falls
// inside — D-342-3). Wrap-past-midnight is a valid span (duration = 1440 - start + end).
export function validateUpdateWindow(window: {start: string; end: string}): string | null {
	const startMin = hhmmToMinutes(window.start)
	const endMin = hhmmToMinutes(window.end)
	if (startMin == null || endMin == null) return 'Invalid time format (expected HH:MM, 24-hour)'
	if (startMin === endMin) return 'Window start and end must differ'
	const duration = startMin < endMin ? endMin - startMin : 1440 - startMin + endMin
	if (duration < 30) return 'Window must be at least 30 minutes'
	return null
}
