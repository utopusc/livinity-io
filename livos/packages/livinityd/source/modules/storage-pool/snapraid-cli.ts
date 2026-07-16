// =========================================================================
// snapraid-cli.ts — thin execa wrappers around the `livos-pool.sh snapraid`
// action (Phase 318, POOL-03, 318-04). This is the ONLY place livinityd shells
// out to snapraid: one small async function per verb (diff / sync / scrub /
// status / check / fix), each returning a structured result via the 318-02
// `--log` parser (snapraid-log.ts). It performs NO parsing of its own.
//
// ★ SECURITY (threat T-318-06 — command injection / whole-pool fix):
//   • Every invocation is an execa argv ARRAY with the DEFAULT `shell:false`
//     (D-03/D-17: livinityd NEVER string-builds a shell command). No caller
//     input is ever interpolated into a shell.
//   • `{reject:false}` — snapraid exit codes are a bitmask (a `diff` returning
//     exit 2 = "differences present", a `sync` "warning" exit, etc. are NORMAL
//     outcomes). We PARSE the `--log` body regardless of exit; we never throw
//     on a non-zero exit (mirrors monitoring/smart.ts readSmart).
//   • `fix`/`check` are structurally disk-SCOPED via `-d <label>` (Pattern 4):
//     they can only ever rebuild the named snapraid.conf disk, never the whole
//     pool. The disk label is shape-validated BEFORE any wrapper call.
//
// ★ 318-01 WRAPPER CONTRACT (why the caller forwards ONLY the verb):
//   The `livos-pool.sh` `snapraid` action runs, ROOT-SIDE:
//       snapraid --conf /etc/snapraid.conf --log ">&1" <forwarded args…>
//   i.e. it injects '--conf' + '--log' '>&1' itself (the D-04 structured-tag
//   contract) and then charset-validates every forwarded token with
//   ^[A-Za-z0-9._:/=-]+$. The caller therefore MUST NOT re-send '--conf',
//   '--log', or the '>&1' target — the wrapper would reject '>&1' (exit 2).
//   So each function below forwards only the verb + its verb-flags; the
//   `--log ">&1"` that feeds the parser is guaranteed root-side, not here.
// =========================================================================

import {execa} from 'execa'

// Trap 2 — single DEVICE-regex strategy: REUSE the exported kernel-device guard
// from the monitoring domain (monitoring/smart.ts:259) rather than diverging a
// 4th copy. Used here as a defence-in-depth guard so a raw block-device name can
// never be smuggled in where a snapraid.conf disk LABEL is expected (below).
import {DEVICE_ID_RE} from '../monitoring/smart.js'

import {parseCheckFix, parseDiff, parseStatus, parseSyncScrub} from './snapraid-log.js'
import type {CheckFixResult, DiffResult, StatusResult, SyncScrubResult} from './snapraid-log.js'

// The single privileged sink (318-01). Mirrors monitoring/smart.ts SMARTCTL_WRAPPER.
export const POOL_WRAPPER = '/usr/local/lib/livos/livos-pool.sh'

// A snapraid `-d` argument is a snapraid.conf disk LABEL (e.g. `d1`, `d2`,
// `disk2`) — NOT a kernel device name. This mirrors the wrapper's own
// `_valid_disk_name` shape (livos-pool.sh:204, ^[A-Za-z0-9_-]{1,32}$). DEVICE_ID_RE
// (sdX/nvmeXnY/mmcblkX) is deliberately the WRONG shape for a label and is used
// only to REJECT a raw-device token that leaked into the label slot.
const DISK_LABEL_RE = /^[A-Za-z0-9_-]{1,32}$/

// Validate a caller-supplied snapraid disk label BEFORE it reaches the wrapper.
// Throws (never returns a wrapper call) on a missing, malformed, or
// kernel-device-shaped label. Defence-in-depth on top of the wrapper's own
// root-side re-validation — we never rely on that alone.
function assertDiskLabel(disk: unknown): asserts disk is string {
	if (typeof disk !== 'string' || !DISK_LABEL_RE.test(disk)) {
		throw new Error('[snapraid-cli] invalid disk label (expected a snapraid.conf disk name, e.g. d2)')
	}
	// A snapraid disk LABEL must never be a raw kernel device name — `-d` scopes
	// by the pool slot label, not a block device. If a caller passes a
	// DEVICE_ID_RE-shaped token (`sdb`/`nvme0n1`) it is a wiring bug — refuse it.
	if (DEVICE_ID_RE.test(disk)) {
		throw new Error('[snapraid-cli] disk label must not be a raw kernel device name')
	}
}

// Run the wrapper `snapraid` action with the given verb args and return stdout.
// argv ARRAY + default shell:false (no shell string), `{reject:false}` so a
// non-zero snapraid exit is parsed (not thrown). No timeout: snapraid sync/scrub
// /fix can legitimately run for hours on a large array — lifecycle is owned by
// the 318-07 scheduler, not by an arbitrary ceiling here.
async function runSnapraid(verbArgs: string[]): Promise<string> {
	const res = await execa('sudo', ['-n', POOL_WRAPPER, 'snapraid', ...verbArgs], {reject: false})
	return res.stdout ?? ''
}

// --- diff (feeds the D-08 safety-freeze mass-deletion gate, 318-05/318-07) ---
export async function diff(): Promise<DiffResult> {
	return parseDiff(await runSnapraid(['diff']))
}

// --- sync (bring parity current) --------------------------------------------
export async function sync(): Promise<SyncScrubResult> {
	return parseSyncScrub(await runSnapraid(['sync']))
}

// --- scrub (verify parity; optional `-p <percent>` from the 318-07 config) ---
export async function scrub(opts: {percent?: number} = {}): Promise<SyncScrubResult> {
	const args = ['scrub']
	if (opts.percent !== undefined) {
		if (!Number.isInteger(opts.percent) || opts.percent < 0 || opts.percent > 100) {
			throw new Error('[snapraid-cli] scrub percent must be an integer in [0,100]')
		}
		args.push('-p', String(opts.percent))
	}
	return parseSyncScrub(await runSnapraid(args))
}

// --- status (scrub-age badge + per-disk usage) ------------------------------
export async function status(): Promise<StatusResult> {
	return parseStatus(await runSnapraid(['status']))
}

// --- fix (disk-scoped rebuild — Pattern 4 / D-11 replacement runbook step) ---
// `fix -d <label>` rebuilds ONLY the named disk from parity, never the whole
// pool. The runbook orchestration (check-before-sync HARD-STOP) lives in
// 318-07/318-11; this module just provides the scoped verb.
export async function fix({disk}: {disk: string}): Promise<CheckFixResult> {
	assertDiskLabel(disk)
	return parseCheckFix(await runSnapraid(['fix', '-d', disk]))
}

// --- check (simulate-only verification BEFORE trusting a rebuild — D-11) -----
// A `summary:error_unrecoverable > 0` / `exit:unrecoverable` result is the
// HARD-STOP signal: the caller must never auto-chain into `sync` when set.
export async function check({disk}: {disk: string}): Promise<CheckFixResult> {
	assertDiskLabel(disk)
	return parseCheckFix(await runSnapraid(['check', '-d', disk]))
}
