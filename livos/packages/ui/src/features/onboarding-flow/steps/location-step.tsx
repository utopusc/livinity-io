/* =========================================================
   LocationStep — Phase 196.1
   Replaces RegionStep + LocaleTimezoneStep with a single
   Country + City picker. Submitting calls `setup.setLocation`
   which derives region + timezone + locale server-side and
   propagates the timezone to the system clock.

   Props contract mirrors other steps: {data, setData, onContinue, onSkip, onBack}.
   ========================================================= */

import {useEffect, useMemo, useState} from 'react'

import {trpcReact} from '@/trpc/trpc'

import {
	COUNTRIES,
	getCountry,
} from '../../../../../livinityd/source/modules/locale/location-data'
import {FooterBar} from '../footer-bar'
import type {OnboardingData} from '../constants'

type Props = {
	data: OnboardingData
	setData: (d: OnboardingData) => void
	onContinue: () => void
	onSkip: () => void
	onBack: () => void
}

/** Suggest a (country, city) from the browser's IANA timezone. */
function suggestFromBrowser(): {country: string; city: string} | null {
	try {
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
		if (!tz) return null
		for (const country of COUNTRIES) {
			for (const city of country.cities) {
				if (city.timezone === tz) {
					return {country: country.code, city: city.name}
				}
			}
		}
	} catch {
		// ignore
	}
	return null
}

type HourCycle = 'h12' | 'h23'

/** Normalize any Intl hour-cycle code to the two-way 12h/24h axis. */
function normalizeHourCycle(hc: string | null | undefined): HourCycle | null {
	if (hc === 'h11' || hc === 'h12') return 'h12'
	if (hc === 'h23' || hc === 'h24') return 'h23'
	return null
}

/** Phase 271 — derive the default hour-cycle from a locale (US → h12, TR → h23). */
function deriveHourCycle(locale: string): HourCycle {
	try {
		const resolved = new Intl.DateTimeFormat(locale || 'en-US', {
			hour: 'numeric',
		}).resolvedOptions().hourCycle
		return normalizeHourCycle(resolved) ?? 'h23'
	} catch {
		return 'h23'
	}
}

export function LocationStep({data, setData, onContinue, onSkip, onBack}: Props) {
	const suggestion = useMemo(() => suggestFromBrowser(), [])

	const [country, setCountry] = useState<string>(
		data.country ?? suggestion?.country ?? 'TR',
	)
	const [city, setCity] = useState<string>(
		data.city ?? suggestion?.city ?? 'Istanbul',
	)
	const [error, setError] = useState<string | null>(null)

	const setLocation = trpcReact.setup.setLocation.useMutation()
	const setClockFormat = trpcReact.setup.setClockFormat.useMutation()

	// Phase 271 — 24h⇄AM/PM. Defaults to the selected country's locale default
	// (US/en → h12 AM/PM, TR → h23 24h). Once the operator touches the toggle
	// their explicit choice sticks (we stop auto-deriving).
	const [hourCycle, setHourCycle] = useState<HourCycle>(
		data.hourCycle ?? deriveHourCycle(data.locale ?? 'en-US'),
	)
	const [hourCycleTouched, setHourCycleTouched] = useState<boolean>(
		data.hourCycle != null,
	)

	// When country changes, reset city to that country's first city if the
	// current city doesn't belong to it.
	useEffect(() => {
		const entry = getCountry(country)
		if (!entry) return
		const stillValid = entry.cities.some((c) => c.name === city)
		if (!stillValid) {
			setCity(entry.cities[0]?.name ?? '')
		}
	}, [country]) // eslint-disable-line react-hooks/exhaustive-deps

	const countryEntry = getCountry(country)
	const cities = countryEntry?.cities ?? []
	const derivedTimezone = cities.find((c) => c.name === city)?.timezone ?? ''
	const derivedLocale = countryEntry?.defaultLocale ?? 'en-US'

	// Auto-derive the hour-cycle from the selected country's locale until the
	// operator overrides it manually (then their choice is sticky).
	useEffect(() => {
		if (hourCycleTouched) return
		setHourCycle(deriveHourCycle(derivedLocale))
	}, [derivedLocale, hourCycleTouched])

	function pickHourCycle(next: HourCycle) {
		setHourCycleTouched(true)
		setHourCycle(next)
		// Best-effort persist — the click is immediate feedback; the canonical
		// write also happens on Continue alongside setLocation.
		setClockFormat.mutate({hourCycle: next})
	}

	const canContinue = !!country && !!city && !!derivedTimezone && !setLocation.isPending

	async function handleContinue() {
		setError(null)
		try {
			const result = await setLocation.mutateAsync({country, city})
			// Persist the clock-format choice (the default if untouched, or the
			// operator's pick). Non-fatal — a failure here must not block the step.
			try {
				await setClockFormat.mutateAsync({hourCycle})
			} catch {
				// ignore — location already saved; clock format is best-effort.
			}
			setData({
				...data,
				country: result.country,
				city: result.city,
				region: result.region as OnboardingData['region'],
				timezone: result.timezone,
				locale: result.locale as OnboardingData['locale'],
				hourCycle,
			})
			onContinue()
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Could not save location'
			setError(message)
		}
	}

	return (
		<div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
			<div className='fade-up'>
				<div className='onb-eyebrow'>05 · Location</div>
				<h1 className='onb-title' style={{marginTop: 8}}>
					Where are you?
				</h1>
				<p className='onb-sub' style={{marginTop: 10}}>
					Pick your country and city — we use this to set your time zone, date
					format, and default language.
				</p>
			</div>

			<div
				className='field-card fade-up d2'
				style={{
					padding: 24,
					display: 'flex',
					flexDirection: 'column',
					gap: 14,
				}}
			>
				<div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
					<label
						className='onb-label'
						htmlFor='loc-country'
						style={{fontSize: 13, color: 'var(--fg-mute)'}}
					>
						Country
					</label>
					<select
						id='loc-country'
						data-testid='loc-country'
						className='onb-select'
						value={country}
						onChange={(e) => setCountry(e.target.value)}
						style={{
							padding: '10px 14px',
							borderRadius: 10,
							border: '1px solid var(--line)',
							background: 'var(--surface)',
							color: 'var(--fg)',
							fontSize: 14,
						}}
					>
						{COUNTRIES.map((c) => (
							<option key={c.code} value={c.code}>
								{c.name}
							</option>
						))}
					</select>
				</div>

				<div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
					<label
						className='onb-label'
						htmlFor='loc-city'
						style={{fontSize: 13, color: 'var(--fg-mute)'}}
					>
						City
					</label>
					<select
						id='loc-city'
						data-testid='loc-city'
						className='onb-select'
						value={city}
						onChange={(e) => setCity(e.target.value)}
						disabled={cities.length === 0}
						style={{
							padding: '10px 14px',
							borderRadius: 10,
							border: '1px solid var(--line)',
							background: 'var(--surface)',
							color: 'var(--fg)',
							fontSize: 14,
						}}
					>
						{cities.map((c) => (
							<option key={c.name} value={c.name}>
								{c.name}
							</option>
						))}
					</select>
				</div>

				{/* Phase 271 — 24h⇄AM/PM toggle. Defaults to the country's locale. */}
				<div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
					<label
						className='onb-label'
						style={{fontSize: 13, color: 'var(--fg-mute)'}}
					>
						Clock format
					</label>
					<div
						role='radiogroup'
						aria-label='Clock format'
						style={{display: 'flex', gap: 8}}
					>
						{([
							{value: 'h12' as const, label: 'AM/PM (12-hour)'},
							{value: 'h23' as const, label: '24-hour'},
						]).map((opt) => {
							const active = hourCycle === opt.value
							return (
								<button
									key={opt.value}
									type='button'
									role='radio'
									aria-checked={active}
									data-testid={`clock-format-${opt.value}`}
									onClick={() => pickHourCycle(opt.value)}
									style={{
										flex: 1,
										padding: '10px 14px',
										borderRadius: 10,
										border: `1px solid ${active ? 'var(--accent, #6aa1ff)' : 'var(--line)'}`,
										background: active ? 'var(--accent-soft, rgba(106,161,255,0.12))' : 'var(--surface)',
										color: active ? 'var(--fg)' : 'var(--fg-mute)',
										fontSize: 14,
										fontWeight: active ? 600 : 400,
										cursor: 'pointer',
									}}
								>
									{opt.label}
								</button>
							)
						})}
					</div>
				</div>

				{derivedTimezone && (
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 4,
							padding: 12,
							borderRadius: 10,
							border: '1px dashed var(--line)',
							background: 'var(--surface)',
							fontSize: 13,
							color: 'var(--fg-mute)',
						}}
					>
						<div>
							Time zone: <span style={{color: 'var(--fg)'}}>{derivedTimezone}</span>
						</div>
						<div>
							Language: <span style={{color: 'var(--fg)'}}>{derivedLocale}</span>
						</div>
					</div>
				)}

				{error && (
					<div
						className='warn-note'
						style={{
							background: 'var(--red-bg, rgba(220,38,38,0.08))',
							borderColor: 'var(--red, #dc2626)',
							color: 'var(--red, #dc2626)',
							padding: 12,
							borderRadius: 10,
							borderWidth: 1,
							borderStyle: 'solid',
							fontSize: 13,
						}}
						data-testid='loc-error'
					>
						{error}
					</div>
				)}
			</div>

			<FooterBar
				onBack={onBack}
				onContinue={handleContinue}
				onSkip={onSkip}
				continueLabel={setLocation.isPending ? 'Saving…' : 'Continue'}
				continueDisabled={!canContinue}
				hint='↵ to continue · esc for back'
			/>
		</div>
	)
}
