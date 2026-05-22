/**
 * Phase 196-05 — Locale + timezone configuration step.
 * Auto-detect via Intl + navigator.language; operator can override.
 * Continue triggers timedatectl via the narrow sudoers TIMEDATECTL alias
 * extended in this same plan (see scripts/install/sudoers.d/livinityd).
 *
 * Implementation contract:
 *   - On mount: detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone
 *               detectedLocale = navigator.language → normalized to one of
 *               the 6 supported codes; falls back to English-US for any
 *               other navigator.language. See SUPPORTED_LOCALES below.
 *   - Timezone select is a searchable combobox over
 *     `Intl.supportedValuesOf('timeZone')` (~600 entries). Vanilla React
 *     <input> + <ul> pattern — D-NO-NEW-DEPS, no react-select / cmdk /
 *     downshift.
 *   - Locale select is a plain <select> with 6 <option> elements.
 *   - Continue calls `trpcReact.setup.setLocaleTimezone.mutate({timezone,
 *     locale})` then `onContinue()` on success. Mutation failures render
 *     the error message inline (no toast library needed).
 *   - Skip / Back delegate to the wave-navigation props.
 */

import {useMemo, useState} from 'react'

import {trpcReact} from '@/trpc/trpc'

import type {OnboardingData} from '../constants'
import {FooterBar} from '../footer-bar'

// 6 supported locales — single source of truth, narrowed to the exact
// allow-list the backend setLocaleTimezone procedure enforces via zod.
// Each code literal appears EXACTLY ONCE in this file (the labels block
// is plain text, not a code literal). The Set below derives membership
// at module-init time so a future addition only needs to extend this
// array.
const SUPPORTED_LOCALES = [
	{code: 'en-US', label: 'English (US)'},
	{code: 'tr-TR', label: 'Türkçe (Türkiye)'},
	{code: 'de-DE', label: 'Deutsch (Deutschland)'},
	{code: 'fr-FR', label: 'Français (France)'},
	{code: 'es-ES', label: 'Español (España)'},
	{code: 'ar-SA', label: 'العربية (السعودية)'},
] as const
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]['code']
const SUPPORTED_LOCALE_CODES = new Set<string>(SUPPORTED_LOCALES.map((l) => l.code))

type Props = {
	data: OnboardingData
	setData: (d: OnboardingData) => void
	onContinue: () => void
	onSkip: () => void
	onBack: () => void
}

/**
 * Detect the navigator-reported locale and normalize to one of the
 * SUPPORTED_LOCALES codes. navigator.language can be e.g. `tr`, `tr-TR`,
 * `en-GB` — we normalize by checking exact match first, then the
 * language-tag prefix, then fall back to the first entry.
 */
const FALLBACK_LOCALE: SupportedLocale = SUPPORTED_LOCALES[0].code
function normalizeNavigatorLocale(): SupportedLocale {
	const raw =
		typeof navigator !== 'undefined' && typeof navigator.language === 'string'
			? navigator.language
			: ''
	if (!raw) return FALLBACK_LOCALE
	// Exact match check (case-insensitive)
	for (const l of SUPPORTED_LOCALES) {
		if (l.code.toLowerCase() === raw.toLowerCase()) return l.code
	}
	// Language-prefix fallback (e.g. `tr` matches `tr-TR`)
	const head = raw.split('-')[0].toLowerCase()
	for (const l of SUPPORTED_LOCALES) {
		if (l.code.toLowerCase().startsWith(head + '-')) return l.code
	}
	return FALLBACK_LOCALE
}

function detectTimezone(): string {
	try {
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
		if (typeof tz === 'string' && tz.length > 0) return tz
	} catch {
		// Old runtime — fall through.
	}
	return 'UTC'
}

function listSupportedTimezones(): string[] {
	try {
		// Available in all modern engines (Node 18+, Chrome 99+).
		const sv = (Intl as unknown as {supportedValuesOf?: (k: string) => string[]})
			.supportedValuesOf
		if (typeof sv === 'function') {
			return sv('timeZone')
		}
	} catch {
		// fall through
	}
	// Tiny safety net so the combobox isn't catastrophically empty in
	// extremely old runtimes — production target ships modern engines.
	return ['UTC', 'Europe/Istanbul', 'Europe/London', 'America/New_York', 'Asia/Tokyo']
}

export function LocaleTimezoneStep({
	setData,
	data,
	onContinue,
	onSkip,
	onBack,
}: Props) {
	// Auto-detect on mount (lazy init so the function only runs once).
	const [detectedTz] = useState<string>(() => detectTimezone())
	const [detectedLocale] = useState<SupportedLocale>(() => normalizeNavigatorLocale())

	const [selectedTz, setSelectedTz] = useState<string>(detectedTz)
	const [selectedLocale, setSelectedLocale] = useState<SupportedLocale>(detectedLocale)

	// Combobox state — the live query is what the operator typed,
	// independent of the committed selection.
	const [tzQuery, setTzQuery] = useState<string>(detectedTz)

	const allZones = useMemo(() => listSupportedTimezones(), [])
	const matches = useMemo(() => {
		const q = tzQuery.toLowerCase()
		if (q.length === 0) return allZones.slice(0, 20)
		return allZones.filter((z) => z.toLowerCase().includes(q)).slice(0, 20)
	}, [tzQuery, allZones])

	const mut = trpcReact.setup.setLocaleTimezone.useMutation()
	const [inlineErr, setInlineErr] = useState<string | null>(null)

	async function handleContinue() {
		setInlineErr(null)
		// Persist into wizard state up front so resume payload reflects
		// the selection even if the mutation fails.
		setData({
			...data,
			timezone: selectedTz,
			locale: selectedLocale,
		} as OnboardingData)
		try {
			await mut.mutateAsync({timezone: selectedTz, locale: selectedLocale})
			onContinue()
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to apply locale/timezone'
			setInlineErr(msg)
		}
	}

	const isSuggestedTz = selectedTz === detectedTz
	const isSuggestedLocale = selectedLocale === detectedLocale

	return (
		<div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
			<div className='fade-up'>
				<div className='onb-eyebrow'>07 · Locale &amp; Time</div>
				<h1 className='onb-title' style={{marginTop: 8}}>
					Pick your locale and time zone
				</h1>
				<p className='onb-sub' style={{marginTop: 10}}>
					Liv formats dates, times, and numbers per your locale and aligns the system clock to the
					time zone you choose. We suggested values based on your browser — change them anytime in
					Settings.
				</p>
			</div>

			<div className='field-card fade-up d2' style={{padding: 24, display: 'flex', flexDirection: 'column', gap: 18}}>
				{/* ─── Timezone combobox ──────────────────────────────────────── */}
				<div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
					<label
						htmlFor='locale-timezone-tz-input'
						style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500}}
					>
						Time zone
						{isSuggestedTz && (
							<span
								data-testid='locale-timezone-tz-suggested'
								style={{
									fontSize: 11,
									padding: '2px 8px',
									borderRadius: 999,
									background: 'var(--cyan-bg, rgba(6,182,212,0.12))',
									border: '1px solid var(--cyan, #06b6d4)',
									color: 'var(--cyan, #06b6d4)',
								}}
							>
								Suggested
							</span>
						)}
					</label>
					<input
						id='locale-timezone-tz-input'
						type='text'
						data-testid='locale-timezone-tz-input'
						value={tzQuery}
						onChange={(e) => setTzQuery(e.target.value)}
						placeholder='Type to search IANA time zones…'
						style={{
							padding: '8px 12px',
							borderRadius: 8,
							border: '1px solid var(--line)',
							background: 'var(--surface)',
							color: 'var(--fg)',
							fontSize: 14,
						}}
					/>
					<div
						data-testid='locale-timezone-tz-current'
						style={{fontSize: 12, color: 'var(--fg-mute)', marginTop: 2}}
					>
						Selected: <strong>{selectedTz}</strong>
					</div>
					{matches.length > 0 && (
						<ul
							data-testid='locale-timezone-tz-matches'
							style={{
								listStyle: 'none',
								padding: 0,
								margin: 0,
								border: '1px solid var(--line)',
								borderRadius: 8,
								background: 'var(--surface)',
								maxHeight: 200,
								overflowY: 'auto',
							}}
						>
							{matches.map((z) => (
								<li key={z}>
									<button
										type='button'
										className='locale-timezone-tz-match'
										data-tz={z}
										onClick={() => {
											setSelectedTz(z)
											setTzQuery(z)
										}}
										style={{
											display: 'block',
											width: '100%',
											textAlign: 'left',
											padding: '8px 12px',
											background: 'transparent',
											border: 'none',
											color: 'var(--fg)',
											cursor: 'pointer',
											fontSize: 13,
										}}
									>
										{z}
									</button>
								</li>
							))}
						</ul>
					)}
				</div>

				{/* ─── Locale select ──────────────────────────────────────────── */}
				<div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
					<label
						htmlFor='locale-timezone-locale-select'
						style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500}}
					>
						UI locale
						{isSuggestedLocale && (
							<span
								data-testid='locale-timezone-locale-suggested'
								style={{
									fontSize: 11,
									padding: '2px 8px',
									borderRadius: 999,
									background: 'var(--cyan-bg, rgba(6,182,212,0.12))',
									border: '1px solid var(--cyan, #06b6d4)',
									color: 'var(--cyan, #06b6d4)',
								}}
							>
								Suggested
							</span>
						)}
					</label>
					<select
						id='locale-timezone-locale-select'
						data-testid='locale-timezone-locale-select'
						value={selectedLocale}
						onChange={(e) => {
							const v = e.target.value
							if (SUPPORTED_LOCALE_CODES.has(v)) {
								setSelectedLocale(v as SupportedLocale)
							}
						}}
						style={{
							padding: '8px 12px',
							borderRadius: 8,
							border: '1px solid var(--line)',
							background: 'var(--surface)',
							color: 'var(--fg)',
							fontSize: 14,
						}}
					>
						{SUPPORTED_LOCALES.map((l) => (
							<option key={l.code} value={l.code}>
								{l.label} ({l.code})
							</option>
						))}
					</select>
				</div>

				{inlineErr && (
					<div
						data-testid='locale-timezone-err'
						style={{
							background: 'var(--red-bg, rgba(220,38,38,0.08))',
							border: '1px solid var(--red, #dc2626)',
							color: 'var(--red, #dc2626)',
							padding: 12,
							borderRadius: 10,
							fontSize: 13,
						}}
					>
						{inlineErr}
					</div>
				)}
			</div>

			<FooterBar
				onBack={onBack}
				onContinue={handleContinue}
				onSkip={onSkip}
				continueLabel={mut.isPending ? 'Saving…' : 'Continue'}
				continueDisabled={mut.isPending}
				hint='↵ to continue · esc for back'
			/>
		</div>
	)
}

export default LocaleTimezoneStep
