/* =========================================================
   DateTimeSection — Settings › System › Date & Time

   v36 LivOS Design Port section. Mirrors the canonical
   AccountSection / WallpaperSection shape: a top
   <SettingsPageHeader/> followed by FieldCard content.

   Backend contract:
     - Live display: `system.info` exposes `.region` (e.g.
       'Istanbul · UTC+3'). Shown read-only as the current
       time zone.
     - Cascade data: comprehensive country → (state) → city picker
       via `setup.getCountries` / `getStates` / `getCities`
       (backed by the @countrystatecity dataset, backend-only —
       the UI never imports the dataset, only these tRPC queries).
     - Saved read-back: `setup.getLocation` returns the persisted
       {country, state, city, hourCycle}. We seed the cascade from
       it (one-time hydration) so it reflects what was saved.
     - Save: `setup.setLocation` takes {country, state?, cityId}
       and derives + sets timezone + locale + region server-side.
       On success we refetch system.info so the "Current" row
       reflects the new clock.
   ========================================================= */

import {useEffect, useMemo, useRef, useState} from 'react'
import {Loader2} from 'lucide-react'
import {TbClock} from 'react-icons/tb'

import {FieldCard, FieldRow} from '@/components/field-card'
import {SettingsPageHeader} from '@/components/settings-page-header'
import {Button} from '@/shadcn-components/ui/button'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/shadcn-components/ui/select'
import {trpcReact} from '@/trpc/trpc'

type HourCycle = 'h12' | 'h23'

export function DateTimeSection() {
	// Live, read-only display value for the current system time zone.
	const sysInfoQ = trpcReact.system.info.useQuery()

	// Read back the saved location + clock format.
	const locationQ = trpcReact.setup.getLocation.useQuery(undefined, {
		retry: false,
	})

	// Cascade selections. Country defaults to 'TR' until the saved location (or
	// the user) overrides it.
	const [country, setCountry] = useState<string>('TR')
	const [stateCode, setStateCode] = useState<string>('')
	const [cityId, setCityId] = useState<string>('')

	// ─── Cascade queries ──────────────────────────────────────────────────
	const countriesQ = trpcReact.setup.getCountries.useQuery()
	const statesQ = trpcReact.setup.getStates.useQuery(
		{country},
		{enabled: !!country},
	)
	const states = statesQ.data ?? []
	const hasStates = states.length > 0

	const citiesEnabled = !!country && (!hasStates || !!stateCode)
	const citiesQ = trpcReact.setup.getCities.useQuery(
		{country, state: hasStates && stateCode ? stateCode : undefined},
		{enabled: citiesEnabled},
	)
	const cities = citiesQ.data ?? []

	// ─── One-time hydration from the SAVED location ───────────────────────
	// Seed country/state from getLocation. The city hydrates separately once the
	// matching cities list loads (we match the saved city NAME to its id, since
	// the dataset id wasn't persisted historically). Refs guard against a slow
	// read-back clobbering an in-progress user selection.
	const seedHydratedRef = useRef(false)
	const savedCityName = locationQ.data?.city ?? null
	useEffect(() => {
		if (seedHydratedRef.current) return
		if (!locationQ.data) return
		seedHydratedRef.current = true
		if (locationQ.data.country) setCountry(locationQ.data.country)
		if (locationQ.data.state) setStateCode(locationQ.data.state)
	}, [locationQ.data])

	const cityNameHydratedRef = useRef(false)
	useEffect(() => {
		if (cityNameHydratedRef.current) return
		if (!savedCityName) return
		if (cities.length === 0) return
		const match = cities.find((c) => c.name === savedCityName)
		if (match) {
			cityNameHydratedRef.current = true
			setCityId(String(match.id))
		}
	}, [savedCityName, cities])

	// Feedback a215cf1a: cascade-clearing must fire ONLY on a real user change,
	// never on seed hydration. The previous prev-ref effects couldn't tell the
	// two apart — the one-time seed setting country/state (to the saved value)
	// looked identical to a user change, so it wiped cityId AND latched
	// cityNameHydratedRef=true, permanently blocking the city re-select → state
	// & city appeared "gone after reload". Clearing now lives in the Select
	// onValueChange handlers below (handleCountryChange / handleStateChange), so
	// programmatic hydration setters never trigger a wipe.
	function handleCountryChange(next: string) {
		setCountry(next)
		setStateCode('')
		setCityId('')
		cityNameHydratedRef.current = true // user navigated away from the saved city
	}
	function handleStateChange(next: string) {
		setStateCode(next)
		setCityId('')
		cityNameHydratedRef.current = true
	}

	const selectedCity = useMemo(
		() => cities.find((c) => String(c.id) === cityId),
		[cities, cityId],
	)
	const derivedTimezone = selectedCity?.timezone ?? ''

	const utils = trpcReact.useUtils()
	const setLocation = trpcReact.setup.setLocation.useMutation({
		onSuccess: () => {
			sysInfoQ.refetch()
			// Feedback a215cf1a: refresh the saved read-back too, so re-opening the
			// section in the same session reflects what was just saved (not the
			// stale pre-save getLocation cache).
			utils.setup.getLocation.invalidate()
		},
	})

	// 24h⇄AM/PM. Seeded from the saved hour_cycle (getLocation) once it loads.
	const [hourCycle, setHourCycle] = useState<HourCycle>('h23')
	const hourCycleHydratedRef = useRef(false)
	useEffect(() => {
		if (hourCycleHydratedRef.current) return
		if (!locationQ.data) return
		hourCycleHydratedRef.current = true
		setHourCycle(locationQ.data.hourCycle)
	}, [locationQ.data])

	const setClockFormat = trpcReact.setup.setClockFormat.useMutation({
		onSuccess: () => utils.setup.getLocation.invalidate(),
	})

	function pickHourCycle(next: HourCycle) {
		setHourCycle(next)
		setClockFormat.mutate({hourCycle: next})
	}

	const canSave = !!country && !!cityId && !!derivedTimezone && !setLocation.isPending

	function handleSave() {
		if (!selectedCity) return
		setLocation.reset()
		setLocation.mutate({
			country,
			state: hasStates && stateCode ? stateCode : undefined,
			cityId,
		})
	}

	const region = sysInfoQ.data?.region

	return (
		<div className='flex flex-col gap-8'>
			<SettingsPageHeader
				eyebrow='Date & Time'
				title='Date &'
				titleAccent='time.'
				sub='Set your time zone and language. Liv aligns the system clock and formats dates per your locale.'
			/>

			{/* Current — live, read-only system time zone from system.info. */}
			<FieldCard>
				<FieldRow
					label='Time zone'
					value={
						sysInfoQ.isLoading ? (
							<span className='inline-flex items-center gap-2 text-[color:var(--fg-mute)]'>
								<Loader2 className='h-3.5 w-3.5 animate-spin' />
								Loading…
							</span>
						) : region && region !== '—' ? (
							<span className='inline-flex items-center gap-2'>
								<TbClock className='h-4 w-4 text-[color:var(--fg-faint)]' />
								<span className='truncate'>{region}</span>
							</span>
						) : (
							<span className='text-[color:var(--fg-faint)]'>Unknown</span>
						)
					}
				/>
			</FieldCard>

			{/* Picker — Country → (State) → City Selects + derived preview + Save. */}
			<FieldCard>
				<FieldRow
					label='Country'
					value={
						<Select value={country} onValueChange={handleCountryChange}>
							<SelectTrigger className='w-full max-w-[280px]' aria-label='Country'>
								<SelectValue placeholder='Select a country' />
							</SelectTrigger>
							<SelectContent>
								{(countriesQ.data ?? []).map((c) => (
									<SelectItem key={c.code} value={c.code}>
										{c.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					}
				/>
				{/* State — only when the country has states. */}
				{hasStates && (
					<FieldRow
						label='State / Region'
						value={
							<Select value={stateCode} onValueChange={handleStateChange}>
								<SelectTrigger className='w-full max-w-[280px]' aria-label='State'>
									<SelectValue placeholder='Select a state' />
								</SelectTrigger>
								<SelectContent>
									{states.map((s) => (
										<SelectItem key={s.code} value={s.code}>
											{s.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						}
					/>
				)}
				<FieldRow
					label='City'
					value={
						hasStates && !stateCode ? (
							<span className='text-[color:var(--fg-faint)]'>Pick a state first</span>
						) : citiesQ.isLoading ? (
							<span className='inline-flex items-center gap-2 text-[color:var(--fg-mute)]'>
								<Loader2 className='h-3.5 w-3.5 animate-spin' />
								Loading cities…
							</span>
						) : cities.length === 0 ? (
							<span className='text-[color:var(--fg-faint)]'>No cities found</span>
						) : (
							<Select value={cityId} onValueChange={setCityId}>
								<SelectTrigger className='w-full max-w-[280px]' aria-label='City'>
									<SelectValue placeholder='Select a city' />
								</SelectTrigger>
								<SelectContent>
									{cities.map((c) => (
										<SelectItem key={c.id} value={String(c.id)}>
											{c.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)
					}
				/>
				<FieldRow
					label='Preview'
					value={
						derivedTimezone ? (
							<div className='flex flex-col gap-1 text-[13px] text-[color:var(--fg-mute)]'>
								<div>
									Time zone:{' '}
									<span className='font-mono text-[color:var(--fg)]'>{derivedTimezone}</span>
								</div>
							</div>
						) : (
							<span className='text-[color:var(--fg-faint)]'>Pick a city to preview</span>
						)
					}
					trailing={
						<Button variant='v36-primary' size='v36-pill-sm' onClick={handleSave} disabled={!canSave}>
							{setLocation.isPending ? (
								<>
									<Loader2 className='h-3.5 w-3.5 animate-spin' />
									Saving…
								</>
							) : (
								'Save'
							)}
						</Button>
					}
				/>

				{/* Inline error — timedatectl / Intl validation can fail server-side. */}
				{setLocation.error && (
					<div className='px-5 py-3 text-[13px] text-[color:var(--red,#dc2626)]'>
						{setLocation.error.message}
					</div>
				)}
				{setLocation.isSuccess && !setLocation.isPending && (
					<div className='px-5 py-3 text-[13px] text-[color:var(--fg-mute)]'>
						System clock updated.
					</div>
				)}
			</FieldCard>

			{/* 24h⇄AM/PM clock format. Read via getLocation, write via
			    setClockFormat. Applies immediately to the navbar clock. */}
			<FieldCard>
				<FieldRow
					label='Clock format'
					value={
						<div role='radiogroup' aria-label='Clock format' className='flex gap-2'>
							{(
								[
									{value: 'h12' as const, label: 'AM/PM (12-hour)'},
									{value: 'h23' as const, label: '24-hour'},
								]
							).map((opt) => {
								const active = hourCycle === opt.value
								return (
									<button
										key={opt.value}
										type='button'
										role='radio'
										aria-checked={active}
										aria-label={opt.label}
										onClick={() => pickHourCycle(opt.value)}
										className={
											'rounded-radius-sm border px-3 py-1.5 text-[13px] transition-colors ' +
											(active
												? 'border-brand bg-brand/15 text-text-primary'
												: 'border-border-default text-text-secondary hover:bg-surface-base')
										}
									>
										{opt.label}
									</button>
								)
							})}
						</div>
					}
				/>
			</FieldCard>
		</div>
	)
}
