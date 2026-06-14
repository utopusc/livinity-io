/**
 * Phase 271 — useClockPrefs
 *
 * Single source of truth for the operator's SELECTED location + clock format,
 * consumed by the navbar clock (top-bar.tsx). Backed by
 * `setup.getLocation` (the Redis-persisted Location step). When the query is
 * loading or returns nulls (fresh box that never ran the Location step) every
 * field falls back to a sensible browser-derived default so the clock is never
 * blank.
 *
 * Mirrors the `useTemperatureUnit` precedent: read a tRPC query, layer a
 * locale-derived fallback, expose a plain object.
 */

import {trpcReact} from '@/trpc/trpc'

export type HourCycle = 'h12' | 'h23'

export type ClockPrefs = {
	timezone: string
	hourCycle: HourCycle
	locale: string
	city: string
	region: string | null
	country: string | null
}

/** Normalize any Intl hour-cycle code to the two-way 12h/24h axis. */
function normalizeHourCycle(hc: string | null | undefined): HourCycle | null {
	if (hc === 'h11' || hc === 'h12') return 'h12'
	if (hc === 'h23' || hc === 'h24') return 'h23'
	return null
}

/** Derive an hour-cycle from a BCP-47 locale via Intl; fall back to 'h23'. */
function deriveHourCycleFromLocale(locale: string): HourCycle {
	try {
		const resolved = new Intl.DateTimeFormat(locale || 'en-US', {
			hour: 'numeric',
		}).resolvedOptions().hourCycle
		return normalizeHourCycle(resolved) ?? 'h23'
	} catch {
		return 'h23'
	}
}

/** Browser timezone, e.g. "Europe/Istanbul" → guaranteed non-empty string. */
function browserTimezone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
	} catch {
		return 'UTC'
	}
}

/** City label from an IANA timezone tail: "America/Los_Angeles" → "Los Angeles". */
function cityFromTimezone(tz: string): string {
	const tail = tz.split('/').pop() ?? ''
	return tail.replace(/_/g, ' ').trim() || tz
}

export function useClockPrefs(): ClockPrefs {
	const q = trpcReact.setup.getLocation.useQuery(undefined, {
		// Location changes rarely; avoid refetch thrash on every navbar mount.
		staleTime: 5 * 60_000,
		retry: false,
	})

	const data = q.data

	// Browser-derived fallbacks (used while loading or when a field is null).
	const browserTz = browserTimezone()
	const browserLocale =
		(typeof navigator !== 'undefined' && navigator.language) || 'en-US'

	const timezone = data?.timezone || browserTz
	const locale = data?.locale || browserLocale
	const city = data?.city || cityFromTimezone(timezone)
	const region = data?.region ?? null
	const country = data?.country ?? null

	// Prefer the backend's resolved hourCycle (it already honors the explicit
	// override + locale derivation). Fall back to a browser-locale default while
	// the query is loading.
	const hourCycle: HourCycle =
		data?.hourCycle ?? deriveHourCycleFromLocale(browserLocale)

	return {timezone, hourCycle, locale, city, region, country}
}
