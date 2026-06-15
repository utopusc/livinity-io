/* =========================================================
   LocationStep — comprehensive country → (state) → city picker.

   Replaces the old hand-curated 27-country catalog (imported
   directly from livinityd, a 55MB bundle-leak vector) with three
   cascading tRPC-driven selects backed by the @countrystatecity
   dataset (backend-only). Submitting calls `setup.setLocation`
   which derives region + timezone + locale server-side and
   propagates the timezone to the system clock.

   Cascade:
     Country  → setup.getCountries (loaded once)
     State    → setup.getStates({country}) — rendered ONLY when the
                array is non-empty (driven off the actual per-country
                length, not a hardcoded list)
     City     → setup.getCities({country, state?}) — each option
                carries its dataset id + IANA timezone, so we preview
                the zone and submit by cityId.

   Props contract mirrors other steps: {data, setData, onContinue, onSkip, onBack}.
   ========================================================= */

import {useEffect, useMemo, useState} from 'react'

import {trpcReact} from '@/trpc/trpc'

import {FooterBar} from '../footer-bar'
import type {OnboardingData} from '../constants'

type Props = {
	data: OnboardingData
	setData: (d: OnboardingData) => void
	onContinue: () => void
	onSkip: () => void
	onBack: () => void
}

type HourCycle = 'h12' | 'h23'

/** Normalize any Intl hour-cycle code to the two-way 12h/24h axis. */
function normalizeHourCycle(hc: string | null | undefined): HourCycle | null {
	if (hc === 'h11' || hc === 'h12') return 'h12'
	if (hc === 'h23' || hc === 'h24') return 'h23'
	return null
}

/** Derive the default hour-cycle from a locale (US → h12, TR → h23). */
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

const selectStyle: React.CSSProperties = {
	padding: '10px 14px',
	borderRadius: 10,
	border: '1px solid var(--line)',
	background: 'var(--surface)',
	color: 'var(--fg)',
	fontSize: 14,
}

export function LocationStep({data, setData, onContinue, onSkip, onBack}: Props) {
	// Default the Country to a sensible value — the saved pick, or 'TR' (the
	// box-owner's locale baseline). We do NOT client-scan 156k cities to guess.
	const [country, setCountry] = useState<string>(data.country ?? 'TR')
	const [state, setState] = useState<string>(data.state ?? '')
	const [cityId, setCityId] = useState<string>('')
	const [error, setError] = useState<string | null>(null)

	const countriesQ = trpcReact.setup.getCountries.useQuery()
	const statesQ = trpcReact.setup.getStates.useQuery(
		{country},
		{enabled: !!country},
	)
	const states = statesQ.data ?? []
	const hasStates = states.length > 0

	// Cities load once we have a country AND (no states OR a state pick).
	const citiesEnabled = !!country && (!hasStates || !!state)
	const citiesQ = trpcReact.setup.getCities.useQuery(
		{country, state: hasStates && state ? state : undefined},
		{enabled: citiesEnabled},
	)
	const cities = citiesQ.data ?? []

	const setLocation = trpcReact.setup.setLocation.useMutation()
	const setClockFormat = trpcReact.setup.setClockFormat.useMutation()

	// 24h⇄AM/PM. Defaults from the saved locale (US/en → h12, TR → h23). Once the
	// operator touches the toggle their explicit choice sticks.
	const [hourCycle, setHourCycle] = useState<HourCycle>(
		data.hourCycle ?? deriveHourCycle(data.locale ?? 'en-US'),
	)

	// When the country changes, clear the downstream state/city selections.
	useEffect(() => {
		setState('')
		setCityId('')
	}, [country])

	// When the state changes, clear the city.
	useEffect(() => {
		setCityId('')
	}, [state])

	// Default the city to the first option once cities load and nothing's picked.
	useEffect(() => {
		if (!cityId && cities.length > 0) {
			setCityId(String(cities[0].id))
		}
	}, [cities, cityId])

	const selectedCity = useMemo(
		() => cities.find((c) => String(c.id) === cityId),
		[cities, cityId],
	)
	const derivedTimezone = selectedCity?.timezone ?? ''

	function pickHourCycle(next: HourCycle) {
		setHourCycle(next)
		// Best-effort persist — canonical write also happens on Continue.
		setClockFormat.mutate({hourCycle: next})
	}

	const canContinue =
		!!country && !!cityId && !!derivedTimezone && !setLocation.isPending

	async function handleContinue() {
		setError(null)
		if (!selectedCity) {
			setError('Pick a city to continue')
			return
		}
		try {
			const result = await setLocation.mutateAsync({
				country,
				state: hasStates && state ? state : undefined,
				cityId,
			})
			try {
				await setClockFormat.mutateAsync({hourCycle})
			} catch {
				// ignore — location already saved; clock format is best-effort.
			}
			setData({
				...data,
				country: result.country,
				state: result.state ?? undefined,
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
						disabled={countriesQ.isLoading}
						style={selectStyle}
					>
						{(countriesQ.data ?? []).map((c) => (
							<option key={c.code} value={c.code}>
								{c.name}
							</option>
						))}
					</select>
				</div>

				{/* State — rendered ONLY when this country actually has states. */}
				{hasStates && (
					<div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
						<label
							className='onb-label'
							htmlFor='loc-state'
							style={{fontSize: 13, color: 'var(--fg-mute)'}}
						>
							State / Region
						</label>
						<select
							id='loc-state'
							data-testid='loc-state'
							className='onb-select'
							value={state}
							onChange={(e) => setState(e.target.value)}
							style={selectStyle}
						>
							<option value=''>Select a state…</option>
							{states.map((s) => (
								<option key={s.code} value={s.code}>
									{s.name}
								</option>
							))}
						</select>
					</div>
				)}

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
						value={cityId}
						onChange={(e) => setCityId(e.target.value)}
						disabled={!citiesEnabled || citiesQ.isLoading || cities.length === 0}
						style={selectStyle}
					>
						{hasStates && !state ? (
							<option value=''>Pick a state first…</option>
						) : citiesQ.isLoading ? (
							<option value=''>Loading cities…</option>
						) : cities.length === 0 ? (
							<option value=''>No cities found</option>
						) : (
							cities.map((c) => (
								<option key={c.id} value={String(c.id)}>
									{c.name}
								</option>
							))
						)}
					</select>
				</div>

				{/* 24h⇄AM/PM toggle. Defaults to the country's locale. */}
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
