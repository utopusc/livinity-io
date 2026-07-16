// Phase 318 (POOL-03) — snapraid-log.ts pure --log tag parser tests.
//
// D-04 contract: livinityd reads snapraid output SOLELY through the structured
// `--log ">&1"` `NAME:VALUE:VALUE…` tags, NEVER human console text. These fixtures
// are REAL-SHAPE snapraid 14.8 `--log` outputs (human preamble + structured
// summary tags interleaved) for every command family the phase drives:
//   diff / sync / scrub / status / check+fix
// plus the adversarial all-garbage case that must degrade to the default struct
// and NEVER throw (threat T-318-04: a corrupted/truncated log must not crash the
// scheduler or mis-drive the freeze-gate (D-08) / replacement HARD-STOP (D-11)).

import {describe, expect, test} from 'vitest'

import {parseCheckFix, parseDiff, parseStatus, parseSyncScrub} from './snapraid-log.js'

// --- Real-shape fixtures --------------------------------------------------

// `snapraid diff --log ">&1"` — clean, nothing changed.
const DIFF_EQUAL = `Loading state from /var/snapraid.content...
Comparing...

No differences

summary:equal:120345
summary:added:0
summary:removed:0
summary:updated:0
summary:moved:0
summary:copied:0
summary:restored:0
summary:exit:equal
`

// `snapraid diff --log ">&1"` — files changed AND deleted (drives the D-08 freeze gate).
const DIFF_WITH_REMOVALS = `Loading state from /var/snapraid.content...
Comparing...

update home/user/report.pdf
remove home/user/old/a.txt
remove home/user/old/b.txt
add home/user/new/c.txt

summary:equal:118900
summary:added:1
summary:removed:2
summary:updated:1
summary:moved:0
summary:copied:0
summary:restored:0
summary:exit:diff
`

// `snapraid sync --log ">&1"` — clean success.
const SYNC_OK = `Loading state from /var/snapraid.content...
Syncing...
Everything OK

summary:error_io:0
summary:error_data:0
summary:error_soft:0
summary:exit:ok
`

// `snapraid sync --log ">&1"` — completed with recoverable errors (warning exit).
const SYNC_WARNING = `Loading state from /var/snapraid.content...
Syncing...
WARNING! Read errors on some blocks

summary:error_io:3
summary:error_data:1
summary:error_soft:2
summary:exit:warning
`

// `snapraid scrub --log ">&1"` — same tag family as sync.
const SCRUB_OK = `Scrubbing...
Everything OK

summary:error_io:0
summary:error_data:0
summary:error_soft:0
summary:exit:ok
`

// `snapraid status --log ">&1"` — per-disk usage + scrub-age tags.
const STATUS_OK = `Loading state from /var/snapraid.content...
Self test...

  Files Fragmented Excess  Wasted  Used    Free  Use Name
    100          0      0     0.0   1.2G  800.0M  60% disk1
    250          2      0     0.1   3.4G    1.6G  68% disk2

summary:scrub_oldest_days:14
summary:scrub_median_days:9
summary:scrub_newest_days:2
summary:disk_use_percent:disk1:60
summary:disk_use_percent:disk2:68
summary:exit:ok
`

// `snapraid fix -d disk1 --log ">&1"` — clean rebuild (HARD-STOP passes: 0 unrecoverable).
const FIX_CLEAN = `Loading state from /var/snapraid.content...
Selecting...
Fixing...
100% completed

summary:error_unrecoverable:0
summary:fixed:842
summary:parity_fixed:0
summary:unrecoverable:0
summary:exit:ok
`

// `snapraid check --log ">&1"` — unrecoverable blocks found (D-11 HARD-STOP must fire).
const CHECK_UNRECOVERABLE = `Loading state from /var/snapraid.content...
Selecting...
Checking...
100% completed

summary:error_unrecoverable:7
summary:unrecoverable:7
summary:exit:unrecoverable
`

// Adversarial: no snapraid tag anywhere (truncated / corrupted / attacker noise).
const ALL_GARBAGE = `Segmentation fault
????:::::
random noise line
summary:
summary:removed:notanumber
::::
`

// --- diff -----------------------------------------------------------------

describe('parseDiff', () => {
	test('equal log → all-zero counts, exit=equal', () => {
		expect(parseDiff(DIFF_EQUAL)).toEqual({
			counts: {added: 0, removed: 0, updated: 0, moved: 0},
			exit: 'equal',
		})
	})

	test('diff-with-removals → exact counts incl. removed, exit=diff', () => {
		expect(parseDiff(DIFF_WITH_REMOVALS)).toEqual({
			counts: {added: 1, removed: 2, updated: 1, moved: 0},
			exit: 'diff',
		})
	})

	test('garbage input → zero counts, exit=null, never throws', () => {
		expect(parseDiff(ALL_GARBAGE)).toEqual({
			counts: {added: 0, removed: 0, updated: 0, moved: 0},
			exit: null,
		})
	})

	test('malformed count (notanumber) treated as absent, stays 0 (never NaN)', () => {
		const result = parseDiff('summary:removed:notanumber\nsummary:exit:diff\n')
		expect(result.counts.removed).toBe(0)
		expect(Number.isNaN(result.counts.removed)).toBe(false)
		expect(result.exit).toBe('diff')
	})
})

// --- sync / scrub ---------------------------------------------------------

describe('parseSyncScrub', () => {
	test('sync ok → all-zero errors, exit=ok', () => {
		expect(parseSyncScrub(SYNC_OK)).toEqual({
			errorIo: 0,
			errorData: 0,
			errorSoft: 0,
			exit: 'ok',
		})
	})

	test('sync warning → exact error counts, exit=warning', () => {
		expect(parseSyncScrub(SYNC_WARNING)).toEqual({
			errorIo: 3,
			errorData: 1,
			errorSoft: 2,
			exit: 'warning',
		})
	})

	test('scrub ok → same tag family parses, exit=ok', () => {
		expect(parseSyncScrub(SCRUB_OK)).toEqual({
			errorIo: 0,
			errorData: 0,
			errorSoft: 0,
			exit: 'ok',
		})
	})

	test('garbage input → zero errors, exit=null', () => {
		expect(parseSyncScrub(ALL_GARBAGE)).toEqual({
			errorIo: 0,
			errorData: 0,
			errorSoft: 0,
			exit: null,
		})
	})
})

// --- status ---------------------------------------------------------------

describe('parseStatus', () => {
	test('status ok → scrub age + per-disk usage map, exit=ok', () => {
		expect(parseStatus(STATUS_OK)).toEqual({
			scrubOldestDays: 14,
			diskUsePercent: {disk1: 60, disk2: 68},
			exit: 'ok',
		})
	})

	test('garbage input → null scrub age, empty usage map, exit=null', () => {
		expect(parseStatus(ALL_GARBAGE)).toEqual({
			scrubOldestDays: null,
			diskUsePercent: {},
			exit: null,
		})
	})
})

// --- check / fix ----------------------------------------------------------

describe('parseCheckFix', () => {
	test('clean fix → 0 unrecoverable, exit=ok (HARD-STOP passes)', () => {
		expect(parseCheckFix(FIX_CLEAN)).toEqual({
			errorUnrecoverable: 0,
			exit: 'ok',
		})
	})

	test('check with unrecoverable blocks → count > 0, exit=unrecoverable (HARD-STOP fires)', () => {
		expect(parseCheckFix(CHECK_UNRECOVERABLE)).toEqual({
			errorUnrecoverable: 7,
			exit: 'unrecoverable',
		})
	})

	test('garbage input → 0 unrecoverable, exit=null', () => {
		expect(parseCheckFix(ALL_GARBAGE)).toEqual({
			errorUnrecoverable: 0,
			exit: null,
		})
	})
})
