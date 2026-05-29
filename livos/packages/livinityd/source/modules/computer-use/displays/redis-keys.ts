/**
 * Phase 248-01 — Redis key helpers for the display-manager.
 *
 * Tiny drift-lock surface — the test suite pins these EXACT literals so a
 * future refactor can't silently fork the on-disk schema:
 *
 *   DISPLAY_REDIS_PREFIX             === 'luse:display:'
 *   redisKeyForDisplay(':12')        === 'luse:display::12'
 *   redisKeyForDisplayApps(':12')    === 'luse:display::12:apps'
 *
 * The double-colon in the materialized key (`luse:display::12`) is
 * intentional and consistent with the canonical X11 display-number
 * representation (`:N`). Don't try to "fix" it — the manager + apps key
 * + the future TTL GC (Phase 248-03) all assume this exact layout.
 */

export const DISPLAY_REDIS_PREFIX = 'luse:display:' as const

export function redisKeyForDisplay(display: string): string {
	return `${DISPLAY_REDIS_PREFIX}${display}`
}

export function redisKeyForDisplayApps(display: string): string {
	return `${redisKeyForDisplay(display)}:apps`
}

/** SCAN MATCH glob covering all display hashes AND their apps lists. */
export const DISPLAY_REDIS_SCAN_PATTERN = `${DISPLAY_REDIS_PREFIX}*` as const
