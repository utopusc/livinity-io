/**
 * Phase 196-05 — Intl helpers. Used by dashboard/settings to render
 * dates/times/numbers per the operator's locale (selected at the
 * onboarding `locale-timezone-step`).
 *
 * Pure, zero-dependency wrappers over the platform `Intl.DateTimeFormat`
 * + `Intl.NumberFormat`. No i18n library, no luxon — a full UI string
 * translation pass is deferred to a separate phase per CONTEXT.md's
 * deferred items list. These helpers handle ONLY the formatting axis
 * (numerals / month names / time format) which is what most operators
 * actually notice on day-1.
 *
 * D-NO-NEW-DEPS — each call instantiates a fresh formatter (Intl
 * formatters are pooled by the engine; this is fine for the dashboard
 * surface volume).
 */

/**
 * Format a Date / timestamp / ISO string using the medium date style
 * for the supplied locale. Returns the formatted string verbatim
 * (`"22 May 2026"` for `en-GB`, `"22 Mayıs 2026"` for `tr-TR`, etc.).
 */
export function formatDate(date: Date | number | string, locale: string): string {
	return new Intl.DateTimeFormat(locale, {dateStyle: 'medium'}).format(new Date(date))
}

/**
 * Format a Date / timestamp / ISO string using the short time style
 * for the supplied locale. Returns the formatted string verbatim
 * (`"14:30"` for tr-TR, `"2:30 PM"` for en-US).
 *
 * Phase 271 — optional `{timeZone, hourCycle}` overrides let callers render the
 * time in a SELECTED IANA zone with an explicit 12h/24h cycle (defaults to the
 * locale's own short-time style when omitted — backward compatible).
 */
export function formatTime(
	date: Date | number | string,
	locale: string,
	opts?: {timeZone?: string; hourCycle?: 'h12' | 'h23'},
): string {
	return new Intl.DateTimeFormat(locale, {
		timeStyle: 'short',
		timeZone: opts?.timeZone,
		hourCycle: opts?.hourCycle,
	}).format(new Date(date))
}

/**
 * Phase 271 — split a time into its HH:MM body and an optional AM/PM badge.
 *
 * The navbar clock renders `{time}` (e.g. "09:41" or "21:41") plus a separate
 * small AM/PM badge. `dayPeriod` is returned ONLY when `hourCycle === 'h12'`
 * (otherwise null) so 24-hour layouts never render a stray badge.
 *
 * Uses `formatToParts` so we can pluck hour + minute (joined with a literal
 * ':') independently of the locale's own separator/ordering, and read the
 * `dayPeriod` part for the AM/PM string.
 */
export function formatClockParts(
	date: Date,
	o: {locale: string; timeZone?: string; hourCycle?: 'h12' | 'h23'},
): {time: string; dayPeriod: string | null} {
	const parts = new Intl.DateTimeFormat(o.locale, {
		timeZone: o.timeZone,
		hourCycle: o.hourCycle,
		hour: '2-digit',
		minute: '2-digit',
	}).formatToParts(date)

	const hour = parts.find((p) => p.type === 'hour')?.value ?? '00'
	const minute = parts.find((p) => p.type === 'minute')?.value ?? '00'
	const time = `${hour}:${minute}`

	const dayPeriod =
		o.hourCycle === 'h12'
			? parts.find((p) => p.type === 'dayPeriod')?.value ?? null
			: null

	return {time, dayPeriod}
}

/**
 * Format a number for the supplied locale. Returns `"1.234.567,89"`
 * for tr-TR / de-DE, `"1,234,567.89"` for en-US, `"١٬٢٣٤٬٥٦٧٫٨٩"` for
 * ar-SA (which uses Eastern Arabic numerals by default).
 */
export function formatNumber(n: number, locale: string): string {
	return new Intl.NumberFormat(locale).format(n)
}
