/* =========================================================
   DateTimeSection — Settings › System › Date & Time

   v36 LivOS Design Port section. Mirrors the canonical
   AccountSection / WallpaperSection shape: a top
   <SettingsPageHeader/> followed by FieldCard content.

   Backend contract:
     - Live display: `system.info` exposes `.region` (e.g.
       'Istanbul · UTC+3'). Shown read-only as the current
       time zone.
     - Saved read-back: `setup.getLocation` returns the persisted
       {country, city, hourCycle}. We seed the Country/City picker
       from it (one-time hydration) so it reflects what was saved,
       falling back to the browser's resolved IANA time zone
       (suggestFromBrowser) only when no saved location exists.
     - Save: `setup.setLocation` takes EXACTLY {country, city}
       and derives + sets timezone + locale + region server-side.
       On success we refetch system.info so the "Current" row
       reflects the new clock.

   We surface system.info.region as the live value for the
   read-only "Time zone" row.

   COUNTRIES / getCountry are imported from the shared
   livinityd locale catalog (single source of truth, same module
   the onboarding LocationStep + the setup-router validation use).
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

import {
	COUNTRIES,
	getCountry,
} from '../../../../../livinityd/source/modules/locale/location-data'

/** Suggest a (country, city) from the browser's IANA time zone. */
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

export function DateTimeSection() {
	const suggestion = useMemo(() => suggestFromBrowser(), [])

	// Live, read-only display value for the current system time zone.
	const sysInfoQ = trpcReact.system.info.useQuery()

	// Phase 271 — read back the saved location + clock format.
	const locationQ = trpcReact.setup.getLocation.useQuery(undefined, {
		retry: false,
	})

	// Seed the picker from the browser's resolved IANA time zone as a sane
	// default; the saved location (getLocation) hydrates over this once below.
	const [country, setCountry] = useState<string>(suggestion?.country ?? 'TR')
	const [city, setCity] = useState<string>(suggestion?.city ?? 'Istanbul')

	// Phase 272 — one-time hydration from the SAVED location. When getLocation
	// returns a persisted country/city, seed the selects from it (reflecting
	// what's actually saved, not just a browser guess). Falls back to the
	// browser suggestion when there's no saved country/city. A ref guards it
	// so a slow read-back can't clobber the user's in-progress selection.
	const countryCityHydratedRef = useRef(false)
	useEffect(() => {
		if (countryCityHydratedRef.current) return
		if (!locationQ.data) return
		countryCityHydratedRef.current = true
		const savedCountry = locationQ.data.country
		const savedCity = locationQ.data.city
		if (savedCountry) setCountry(savedCountry)
		if (savedCity) setCity(savedCity)
	}, [locationQ.data])

	const setLocation = trpcReact.setup.setLocation.useMutation({
		onSuccess: () => sysInfoQ.refetch(),
	})

	// Phase 271 — 24h⇄AM/PM. Seeded from the saved hour_cycle (getLocation) once
	// it loads; writes via setClockFormat.
	const utils = trpcReact.useUtils()
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

	const canSave = !!country && !!city && !!derivedTimezone && !setLocation.isPending

	function handleSave() {
		setLocation.reset()
		setLocation.mutate({country, city})
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

			{/* Picker — Country + City Selects with a derived preview + Save. */}
			<FieldCard>
				<FieldRow
					label='Country'
					value={
						<Select value={country} onValueChange={setCountry}>
							<SelectTrigger className='w-full max-w-[280px]' aria-label='Country'>
								<SelectValue placeholder='Select a country' />
							</SelectTrigger>
							<SelectContent>
								{COUNTRIES.map((c) => (
									<SelectItem key={c.code} value={c.code}>
										{c.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					}
				/>
				<FieldRow
					label='City'
					value={
						cities.length === 0 ? (
							<span className='text-[color:var(--fg-faint)]'>No cities for this country</span>
						) : (
							<Select value={city} onValueChange={setCity}>
								<SelectTrigger className='w-full max-w-[280px]' aria-label='City'>
									<SelectValue placeholder='Select a city' />
								</SelectTrigger>
								<SelectContent>
									{cities.map((c) => (
										<SelectItem key={c.name} value={c.name}>
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
								<div>
									Language:{' '}
									<span className='font-mono text-[color:var(--fg)]'>{derivedLocale}</span>
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

			{/* Phase 271 — 24h⇄AM/PM clock format. Read via getLocation, write via
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
