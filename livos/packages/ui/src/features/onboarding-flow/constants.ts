import type {Region} from '../../../../livinityd/source/modules/locale/region-suggestion'

/**
 * Phase 196.1 — wizard collapsed 9 → 7 steps.
 *   - ConnectAi merged into Provider (inline auth)
 *   - Region + Locale & Time merged into single Location step (Country + City)
 * Phase 239 — slot 4 (Provider) replaced by CLI Tools; auth deferred post-onboarding.
 * Phase 271 — CLI Tools step REMOVED entirely (agent install is post-onboarding
 *   only).
 * Phase 272 — Personalize step REMOVED (the ai_* prefs it wrote were never read
 *   by the backend). Sequence is now 5 contiguous steps.
 */
export const TOTAL = 5

export const STEP_NAMES = [
	'Welcome',
	'Account',
	'Wallpaper',
	'Location',
	'All set',
] as const

/**
 * Rough seconds per remaining step — used for the ETA pill.
 * Order mirrors STEP_NAMES exactly:
 *   Welcome 15, Account 60, Wallpaper 20, Location 20, All set 5.
 */
export const STEP_WEIGHT = [15, 60, 20, 20, 5] as const

export function etaSeconds(idx: number): number {
	let total = 0
	for (let i = idx; i < STEP_WEIGHT.length; i++) total += STEP_WEIGHT[i]
	return total
}

export function fmtEta(s: number): string {
	if (s <= 0) return 'Done'
	if (s < 60) return `~${s} sec left`
	const m = Math.round(s / 60)
	return `~${m} min left`
}

export type OnboardingData = {
	lang: string
	name: string
	password: string
	confirm: string
	wallpaper: string
	/** Phase 196-04 — region selection (continent-level). Derived in 196.1 from country. */
	region?: Region
	/** Phase 196-04 — optional country sub-pick (ISO-3166-1 alpha-2). Required in 196.1. */
	country?: string
	/** State/region code within country (dataset IState.iso2). Optional —
	 *  states-less countries omit it. */
	state?: string
	/** Phase 196.1 — city name within country (resolved from the dataset). */
	city?: string
	/** Phase 196-05 — IANA Olson timezone (e.g. Europe/Istanbul). Derived in 196.1 from city. */
	timezone?: string
	/** Phase 196-05 — UI locale code from the SUPPORTED_LOCALES allow-list. */
	locale?: 'en-US' | 'tr-TR' | 'de-DE' | 'fr-FR' | 'es-ES' | 'ar-SA'
	/** Phase 271 — operator's 24h⇄AM/PM choice from the Location step. */
	hourCycle?: 'h12' | 'h23'
}

export const DEFAULT_DATA: OnboardingData = {
	lang: 'en',
	name: '',
	password: '',
	confirm: '',
	wallpaper: 'fluid',
}
