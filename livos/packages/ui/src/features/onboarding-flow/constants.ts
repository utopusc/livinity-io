import type {Region} from '../../../../livinityd/source/modules/locale/region-suggestion'

export const TOTAL = 9

export const STEP_NAMES = [
	'Welcome',
	'Account',
	'Wallpaper',
	'Personalize',
	'Provider',
	'Region',
	'Locale & Time',
	'Connect AI',
	'All set',
] as const

/**
 * Rough seconds per remaining step — used for the ETA pill.
 * Order mirrors STEP_NAMES exactly:
 *   Welcome 15, Account 60, Wallpaper 20, Personalize 45, Provider 10,
 *   Region 10, Locale & Time 25, Connect AI 25, All set 5.
 */
export const STEP_WEIGHT = [15, 60, 20, 45, 10, 10, 25, 25, 5] as const

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
	authMode: 'password' | '2fa'
	otpSecret?: string
	otpCode?: string
	wallpaper: string
	role: string
	style: 'concise' | 'direct' | 'detailed'
	useCases: string[]
	useCasesTouched: boolean
	tone: number
	memory: 'off' | 'session' | 'persistent'
	/** Phase 196-03 — AI provider selection (xAI only enabled; Claude/OpenAI/Anthropic land in Phase 197+). */
	provider?: 'xai' | 'claude' | 'openai' | 'anthropic'
	/** Phase 196-04 — region selection (continent-level). */
	region?: Region
	/** Phase 196-04 — optional country sub-pick (ISO-3166-1 alpha-2). */
	country?: string
	/** Phase 196-05 — IANA Olson timezone (e.g. Europe/Istanbul). */
	timezone?: string
	/** Phase 196-05 — UI locale code from the SUPPORTED_LOCALES allow-list. */
	locale?: 'en-US' | 'tr-TR' | 'de-DE' | 'fr-FR' | 'es-ES' | 'ar-SA'
}

export const DEFAULT_DATA: OnboardingData = {
	lang: 'en',
	name: '',
	password: '',
	confirm: '',
	authMode: 'password',
	wallpaper: 'fluid',
	role: 'Developer',
	style: 'direct',
	useCases: [],
	useCasesTouched: false,
	tone: 55,
	memory: 'session',
}
