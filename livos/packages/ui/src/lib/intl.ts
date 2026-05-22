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
 */
export function formatTime(date: Date | number | string, locale: string): string {
	return new Intl.DateTimeFormat(locale, {timeStyle: 'short'}).format(new Date(date))
}

/**
 * Format a number for the supplied locale. Returns `"1.234.567,89"`
 * for tr-TR / de-DE, `"1,234,567.89"` for en-US, `"١٬٢٣٤٬٥٦٧٫٨٩"` for
 * ar-SA (which uses Eastern Arabic numerals by default).
 */
export function formatNumber(n: number, locale: string): string {
	return new Intl.NumberFormat(locale).format(n)
}
