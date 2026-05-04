/**
 * Phase 74 Plan 01 (F2 token-cadence streaming).
 *
 * Shared UTF-8-safe text slicer + cadence helpers used by BOTH broker SSE
 * adapters (`openai-sse-adapter.ts` and `sse-adapter.ts`) so the same
 * implementation is exercised on the Anthropic `/v1/messages` and the
 * OpenAI `/v1/chat/completions` wire paths.
 *
 * Why broker-side, not upstream:
 *   The sacred file `nexus/packages/core/src/sdk-agent-runner.ts`
 *   (SHA `4f868d318abff71f8c8bfbcf443b2393a553018b`) emits text in
 *   block-aggregated `AgentEvent.chunk` payloads. External clients
 *   (Cursor, Continue.dev, Open WebUI) see this as "bursts" instead of
 *   token-by-token cadence. Slicing here lets the broker pace the wire
 *   without modifying the runner.
 *
 * Env-configurable:
 *   - `LIV_BROKER_SLICE_BYTES`     default 24, clamp [8, 256]
 *   - `LIV_BROKER_SLICE_DELAY_MS`  default 15, clamp [0, 200]
 *
 * Slicing applies ONLY to text-content delta chunks. `final_answer`,
 * `error`, and the SSE terminal trio are emitted unsliced.
 */

const SLICE_BYTES_DEFAULT = 24
const SLICE_BYTES_MIN = 8
const SLICE_BYTES_MAX = 256
const SLICE_DELAY_MS_DEFAULT = 15
const SLICE_DELAY_MS_MIN = 0
const SLICE_DELAY_MS_MAX = 200

function clamp(raw: string | undefined, lo: number, hi: number, fallback: number, label: string): number {
	if (raw === undefined) return fallback
	const n = Number.parseInt(raw, 10)
	if (!Number.isFinite(n) || n < lo || n > hi) {
		// One-shot warn at module load if env is set but out-of-range / unparseable.
		// eslint-disable-next-line no-console
		console.warn(
			`[liv-broker] ${label}=${JSON.stringify(raw)} out of [${lo},${hi}] — using ${fallback}`,
		)
		return fallback
	}
	return n
}

export const SLICE_BYTES: number = clamp(
	process.env.LIV_BROKER_SLICE_BYTES,
	SLICE_BYTES_MIN,
	SLICE_BYTES_MAX,
	SLICE_BYTES_DEFAULT,
	'LIV_BROKER_SLICE_BYTES',
)

export const SLICE_DELAY_MS: number = clamp(
	process.env.LIV_BROKER_SLICE_DELAY_MS,
	SLICE_DELAY_MS_MIN,
	SLICE_DELAY_MS_MAX,
	SLICE_DELAY_MS_DEFAULT,
	'LIV_BROKER_SLICE_DELAY_MS',
)

/**
 * UTF-8-safe slice of `text` into chunks of approximately `maxBytes` bytes.
 * Never splits mid-codepoint: when the candidate end-offset lands inside a
 * UTF-8 continuation byte (high bits `10xxxxxx`), we walk the offset
 * back to the nearest codepoint boundary.
 *
 * Behaviour:
 *   - Empty / non-string text → returns `[]` (caller decides how to handle).
 *   - Text with byteLength <= maxBytes → returns `[text]` unchanged.
 *   - Otherwise: greedy slicing, never splitting mid-codepoint.
 *
 * The returned slices, when concatenated, equal the input string exactly.
 */
export function sliceUtf8(text: string, maxBytes: number = SLICE_BYTES): string[] {
	if (typeof text !== 'string' || text.length === 0) return []
	const buf = Buffer.from(text, 'utf8')
	if (buf.byteLength <= maxBytes) return [text]
	const out: string[] = []
	let i = 0
	while (i < buf.byteLength) {
		let end = Math.min(i + maxBytes, buf.byteLength)
		// If end is mid-stream (not the absolute end) AND the byte at `end` is a
		// UTF-8 continuation byte (0b10xxxxxx), walk back to the codepoint start.
		while (end > i && end < buf.byteLength && (buf[end]! & 0b11000000) === 0b10000000) {
			end--
		}
		// Defensive: if walking back collapsed the slice (extreme: single 4-byte
		// codepoint with maxBytes < 4), force-emit the full codepoint to make
		// progress. This is a safety valve — not reachable with maxBytes >= 8
		// (our clamp lower-bound).
		if (end === i) {
			end = i + 1
			while (end < buf.byteLength && (buf[end]! & 0b11000000) === 0b10000000) end++
		}
		out.push(buf.subarray(i, end).toString('utf8'))
		i = end
	}
	return out
}

/** Async sleep helper used to pace inter-slice emission. */
export function sleep(ms: number): Promise<void> {
	if (ms <= 0) return Promise.resolve()
	return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
