// Phase 28 Plan 28-01 — deterministic per-container log color (DOC-13).
//
// Used by LogsViewer for the 4px left stripe AND the [container-name] prefix
// color. djb2 string hash mod 360 gives a hue; saturation 70 + lightness 55
// is the legibility band Tabler swatches use — vivid on both light AND dark
// themes without per-mode tweaks. NO React imports — pure module so it can
// run in unit tests under jsdom OR plain node.
//
// djb2 chosen over fnv-1a / murmur because: (a) we only need ~360 buckets;
// (b) djb2 is 6 lines and has well-known distribution properties; (c) every
// browser implements <<5 + char in O(1) without crypto deps.

function djb2(str: string): number {
	// Classic djb2: hash = ((hash << 5) + hash) + char. Seeded with 5381 per
	// Bernstein's original. We mask to 32 bits via `| 0` after each step so
	// the value stays within JS's safe-integer band (V8 compiles tighter
	// machine code on int32-shaped values).
	let hash = 5381
	for (let i = 0; i < str.length; i++) {
		hash = (((hash << 5) + hash) + str.charCodeAt(i)) | 0
	}
	// Force unsigned 32-bit. `| 0` keeps the sign — `>>> 0` strips it.
	return hash >>> 0
}

/**
 * Deterministic name → HSL color string. Same name always yields the same
 * output (across calls AND across reloads). Fixed S=70%, L=55% so the color
 * is legible on both dark and light themes.
 *
 * Used by LogsViewer's 4px left stripe + [container-name] prefix coloring
 * so two interleaved containers in the multiplexed feed are visually
 * distinguishable at a glance.
 */
export function colorForContainer(name: string): string {
	const hue = djb2(name) % 360
	return `hsl(${hue}, 70%, 55%)`
}
