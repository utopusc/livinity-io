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

	const canContinue = !!country && !!city && !!derivedTimezone && !setLocation.isPending

	async function handleContinue() {
		setError(null)
		try {
			const result = await setLocation.mutateAsync({country, city})
			setData({
				...data,
				country: result.country,
				city: result.city,
				region: result.region as OnboardingData['region'],
				timezone: result.timezone,
				locale: result.locale as OnboardingData['locale'],
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
				<div className='onb-eyebrow'>06 · Location</div>
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
