// livos/packages/livinityd/source/modules/domain/waf-jail.ts
//
// Phase 332 (WAF-01) — the thin privileged sink for the fail2ban abuse jail.
// Mirrors storage-pool/snapraid-cli.ts: argv ARRAY + shell:false, {reject:false}
// so a non-zero/absent wrapper never throws into the caller. livinityd runs
// unprivileged; the wrapper is invoked via the scoped sudoers grant. EVERY call
// here is FAIL-SOFT — a box that never deployed the wrapper (or fail2ban) simply
// logs and skips; WAF-01's stock-Caddy matcher leg (332-01) is unaffected.

import {$} from 'execa'

// The single privileged sink (332-03). Mirrors POOL_WRAPPER / SMARTCTL_WRAPPER.
export const WAF_WRAPPER = '/usr/local/lib/livos/livos-waf.sh'

// Bounded integers the wrapper re-validates root-side. We ALSO bound them here so
// a malformed value never reaches argv (defense in depth; never rely on the
// wrapper alone). Absent → wrapper defaults.
export type WafJailTuning = {maxretry?: number; findtime?: number; bantime?: number}

type Runner = (args: string[]) => Promise<{exitCode?: number; stdout?: string}>

const defaultRun: Runner = async (args) => {
	// `sudo -n` — non-interactive; a missing grant fails with non-zero, which
	// {reject:false} turns into a return value we log, never a throw.
	const res = await $({reject: false})`sudo -n ${WAF_WRAPPER} ${args}`
	return {exitCode: res.exitCode, stdout: res.stdout}
}

function boundInt(v: number | undefined, fallback: number, min: number, max: number): number {
	if (v === undefined || !Number.isFinite(v)) return fallback
	const n = Math.floor(v)
	return Math.min(max, Math.max(min, n))
}

/**
 * Install (or refresh) the livos-caddy fail2ban jail with the given tuning, plus
 * ensure the Caddy access-log dir exists. Fail-soft: returns false (never throws)
 * when the wrapper is absent or errors — the caller logs and continues.
 */
export async function installAbuseJail(
	tuning: WafJailTuning = {},
	deps?: {run?: Runner; logger?: {log: (m: string) => void; error: (m: string, e?: unknown) => void}},
): Promise<boolean> {
	const run = deps?.run ?? defaultRun
	const maxretry = boundInt(tuning.maxretry, 20, 1, 10000)
	const findtime = boundInt(tuning.findtime, 60, 1, 86400)
	// 332-REVIEW INFO-2: cap at 7 digits (9999999s ≈ 115 days) to match the
	// wrapper's `^[0-9]{1,7}$` _valid_int — an 8-digit value would be rejected
	// root-side and silently fail-soft the jail install.
	const bantime = boundInt(tuning.bantime, 3600, 1, 9_999_999)
	try {
		const res = await run([
			'install-jail',
			'--maxretry',
			String(maxretry),
			'--findtime',
			String(findtime),
			'--bantime',
			String(bantime),
		])
		if ((res.exitCode ?? 1) !== 0) {
			deps?.logger?.log(`[waf-jail] install-jail wrapper returned ${res.exitCode} — skipping (fail-soft)`)
			return false
		}
		return true
	} catch (error) {
		deps?.logger?.error('[waf-jail] install-jail failed (fail-soft)', error)
		return false
	}
}

/**
 * Remove the livos-caddy jail (no app opts into abuse-ban any more). Fail-soft.
 */
export async function removeAbuseJail(deps?: {
	run?: Runner
	logger?: {log: (m: string) => void; error: (m: string, e?: unknown) => void}
}): Promise<boolean> {
	const run = deps?.run ?? defaultRun
	try {
		const res = await run(['remove-jail'])
		return (res.exitCode ?? 1) === 0
	} catch (error) {
		deps?.logger?.error('[waf-jail] remove-jail failed (fail-soft)', error)
		return false
	}
}
