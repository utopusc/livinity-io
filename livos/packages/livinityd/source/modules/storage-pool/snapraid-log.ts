// =========================================================================
// snapraid-log.ts — PURE `--log` structured-tag parser (Phase 318, POOL-03, D-04).
//
// livinityd's SOLE contract for reading snapraid output. Every snapraid
// invocation runs with `--log ">&1"`, which emits machine-readable
// `NAME:VALUE:VALUE…` tag lines interleaved with human console text. This
// module reads ONLY those structured tags — it NEVER scrapes human console
// text (D-04, an explicit anti-pattern: console formatting is not a documented
// stable contract; the `summary:*` tag format IS).
//
// ★ PURITY (by design): this module performs ZERO I/O — no execa, no fs, no
//   network. All shell-out lives in snapraid-cli.ts (318-04). Because it is a
//   set of pure string→struct functions, it is fully offline-testable with
//   fixture logs (snapraid-log.test.ts) and deterministic.
//
// ★ SAFETY (threat T-318-04): snapraid stdout is UNTRUSTED — a corrupted,
//   truncated, or attacker-influenced filesystem can produce odd log lines.
//   Every parser uses strict ANCHORED per-line regexes, IGNORES any line that
//   matches no tag, defaults numeric fields to 0 and exit to null when a tag is
//   absent, and can NEVER throw. A non-digit count (e.g. `summary:removed:xyz`)
//   fails the `\d+` anchor and is treated as absent — never NaN in the struct.
//   This guarantees the freeze gate (D-08) and replacement HARD-STOP (D-11)
//   receive correct values even from garbage input.
// =========================================================================

// --- diff (drives the D-08 safety-freeze mass-deletion gate) ---------------

export type DiffExit = 'equal' | 'diff' | 'unsynced' | null

export interface DiffResult {
	counts: {added: number; removed: number; updated: number; moved: number}
	exit: DiffExit
}

const DIFF_COUNT_RE = /^summary:(added|removed|updated|moved):(\d+)$/
const DIFF_EXIT_RE = /^summary:exit:(equal|diff|unsynced)$/

export function parseDiff(log: string): DiffResult {
	const counts = {added: 0, removed: 0, updated: 0, moved: 0}
	let exit: DiffExit = null
	for (const line of splitLines(log)) {
		const m = DIFF_COUNT_RE.exec(line)
		if (m) {
			counts[m[1] as keyof typeof counts] = Number(m[2])
			continue
		}
		const e = DIFF_EXIT_RE.exec(line)
		if (e) exit = e[1] as Exclude<DiffExit, null>
	}
	return {counts, exit}
}

// --- sync / scrub (identical error-tag family) ----------------------------

export type SyncScrubExit = 'ok' | 'warning' | 'error' | null

export interface SyncScrubResult {
	errorIo: number
	errorData: number
	errorSoft: number
	exit: SyncScrubExit
}

const SYNC_ERROR_RE = /^summary:(error_io|error_data|error_soft):(\d+)$/
const SYNC_EXIT_RE = /^summary:exit:(ok|warning|error)$/

export function parseSyncScrub(log: string): SyncScrubResult {
	const result: SyncScrubResult = {errorIo: 0, errorData: 0, errorSoft: 0, exit: null}
	for (const line of splitLines(log)) {
		const m = SYNC_ERROR_RE.exec(line)
		if (m) {
			if (m[1] === 'error_io') result.errorIo = Number(m[2])
			else if (m[1] === 'error_data') result.errorData = Number(m[2])
			else result.errorSoft = Number(m[2])
			continue
		}
		const e = SYNC_EXIT_RE.exec(line)
		if (e) result.exit = e[1] as SyncScrubExit
	}
	return result
}

// --- status (scrub-age badge + per-disk usage) ----------------------------

export type StatusExit = 'ok' | 'bad' | 'unsynced' | null

export interface StatusResult {
	scrubOldestDays: number | null
	diskUsePercent: Record<string, number>
	exit: StatusExit
}

const STATUS_SCRUB_OLDEST_RE = /^summary:scrub_oldest_days:(\d+)$/
// Disk name is any non-colon run so a disk literally named with dots/dashes still parses.
const STATUS_DISK_USE_RE = /^summary:disk_use_percent:([^:]+):(\d+)$/
const STATUS_EXIT_RE = /^summary:exit:(ok|bad|unsynced)$/

export function parseStatus(log: string): StatusResult {
	const result: StatusResult = {scrubOldestDays: null, diskUsePercent: {}, exit: null}
	for (const line of splitLines(log)) {
		const oldest = STATUS_SCRUB_OLDEST_RE.exec(line)
		if (oldest) {
			result.scrubOldestDays = Number(oldest[1])
			continue
		}
		const use = STATUS_DISK_USE_RE.exec(line)
		if (use) {
			result.diskUsePercent[use[1]] = Number(use[2])
			continue
		}
		const e = STATUS_EXIT_RE.exec(line)
		if (e) result.exit = e[1] as StatusExit
	}
	return result
}

// --- check / fix (D-11 replacement HARD-STOP) -----------------------------

// exit may take `unrecoverable` in addition to the sync-family values — a
// non-zero errorUnrecoverable (or an `unrecoverable` exit) is the HARD-STOP
// signal: never auto-chain fix → sync when set (D-11 / Pitfall 3).
export type CheckFixExit = 'ok' | 'warning' | 'error' | 'unrecoverable' | null

export interface CheckFixResult {
	errorUnrecoverable: number
	exit: CheckFixExit
}

const CHECKFIX_UNRECOVERABLE_RE = /^summary:error_unrecoverable:(\d+)$/
const CHECKFIX_EXIT_RE = /^summary:exit:(ok|warning|error|unrecoverable)$/

export function parseCheckFix(log: string): CheckFixResult {
	const result: CheckFixResult = {errorUnrecoverable: 0, exit: null}
	for (const line of splitLines(log)) {
		const m = CHECKFIX_UNRECOVERABLE_RE.exec(line)
		if (m) {
			result.errorUnrecoverable = Number(m[1])
			continue
		}
		const e = CHECKFIX_EXIT_RE.exec(line)
		if (e) result.exit = e[1] as CheckFixExit
	}
	return result
}

// --- shared -----------------------------------------------------------------

// Split on newlines and strip a trailing CR (CRLF-tolerant). Tags carry no
// internal whitespace, so a trim also harmlessly drops stray indentation/CR
// without ever altering a matched tag value.
function splitLines(log: string): string[] {
	return log.split('\n').map((line) => line.trim())
}
