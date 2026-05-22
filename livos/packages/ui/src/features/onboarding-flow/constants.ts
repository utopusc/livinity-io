export const TOTAL = 7

export const STEP_NAMES = [
	'Welcome',
	'Account',
	'Wallpaper',
	'Personalize',
	'Provider',
	'Connect AI',
	'All set',
] as const

/** Rough seconds per remaining step — used for the ETA pill. */
export const STEP_WEIGHT = [15, 60, 20, 45, 10, 25, 5] as const

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
