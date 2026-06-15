/**
 * Location data — comprehensive country → (state) → city picker.
 *
 * Phase 196.1 shipped a hand-curated 27-country / ~80-city catalog. This module
 * replaces it with the `@countrystatecity/countries` dataset (250 countries,
 * 5k states, 156k cities; every city carries a populated IANA `timezone`). The
 * dataset stays BACKEND-ONLY — the UI never imports this file; it reaches the
 * data through three new tRPC queries (`setup.getCountries/getStates/getCities`).
 *
 * From the chosen (country, state?, cityId) we derive:
 *   - timezone — read straight off `city.timezone` (accurate to county level,
 *     incl. US split-states like America/Indiana/Indianapolis); fall back to the
 *     country's primary zone (`getCountryTimezones(cc)[0]`) on the rare null.
 *   - region  — `regionFor(country.region, country.subregion)` maps the dataset's
 *     region/subregion onto the existing 6-value LocationRegion union.
 *   - locale  — `COUNTRY_LOCALE[iso2]` (BCP-47 from SUPPORTED_LOCALES), default en-US.
 *
 * The async dataset API is verified against the installed package types
 * (@countrystatecity/countries@1.0.7): getCountries / getStatesOfCountry /
 * getCitiesOfState / getAllCitiesOfCountry / getCityById / getCountryTimezones.
 */

import {
	getCountries,
	getStatesOfCountry,
	getCitiesOfState,
	getAllCitiesOfCountry,
	getCityById,
	getCountryTimezones,
	type ICity,
} from '@countrystatecity/countries'

export const SUPPORTED_LOCALES = [
	'en-US',
	'tr-TR',
	'de-DE',
	'fr-FR',
	'es-ES',
	'ar-SA',
] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export type LocationRegion =
	| 'europe'
	| 'north-america'
	| 'south-america'
	| 'asia'
	| 'africa'
	| 'oceania'

// ─── Country → locale map ────────────────────────────────────────────────
//
// Ports the locales the old Phase-196.1 catalog encoded in each country's
// `defaultLocale`. Everything not listed defaults to 'en-US'. This is the UI
// language allow-list (SUPPORTED_LOCALES) only — NOT an exhaustive
// country→language table. Phase 197+ i18n can broaden it.
export const COUNTRY_LOCALE: Record<string, SupportedLocale> = {
	// Turkish
	TR: 'tr-TR',
	// German
	DE: 'de-DE',
	AT: 'de-DE',
	CH: 'de-DE',
	// French
	FR: 'fr-FR',
	// Spanish (Spain + Latin America from the old catalog: MX/AR/BR mapped es-ES)
	ES: 'es-ES',
	MX: 'es-ES',
	AR: 'es-ES',
	BR: 'es-ES',
	CO: 'es-ES',
	CL: 'es-ES',
	PE: 'es-ES',
	// Arabic
	SA: 'ar-SA',
	AE: 'ar-SA',
	EG: 'ar-SA',
	QA: 'ar-SA',
	KW: 'ar-SA',
	// English-speaking (explicit; everything unlisted also falls through to en-US)
	US: 'en-US',
	GB: 'en-US',
	CA: 'en-US',
	AU: 'en-US',
	NZ: 'en-US',
	IE: 'en-US',
	IN: 'en-US',
	ZA: 'en-US',
	NG: 'en-US',
}

/** Resolve the UI locale for an ISO2 country code. Defaults to en-US. */
export function localeFor(iso2: string): SupportedLocale {
	return COUNTRY_LOCALE[iso2.toUpperCase()] ?? 'en-US'
}

/**
 * Map the dataset's region/subregion onto the 6-value LocationRegion union.
 *
 *   Europe   → europe
 *   Asia     → asia
 *   Africa   → africa
 *   Oceania  → oceania
 *   Americas → south-america when subregion === 'South America', else north-america
 *   (empty / Polar / unknown) → oceania (defensive default; matches the old
 *     catalog's habit of never leaving region unset).
 */
export function regionFor(region: string, subregion: string): LocationRegion {
	switch (region) {
		case 'Europe':
			return 'europe'
		case 'Asia':
			return 'asia'
		case 'Africa':
			return 'africa'
		case 'Oceania':
			return 'oceania'
		case 'Americas':
			return subregion === 'South America' ? 'south-america' : 'north-america'
		default:
			// '', 'Polar', or any future/unknown region.
			return 'oceania'
	}
}

// ─── Async dataset-backed helpers ────────────────────────────────────────

export interface CountryListItem {
	/** ISO-3166-1 alpha-2 (uppercase). */
	code: string
	name: string
	region: LocationRegion
}

export interface StateListItem {
	/** State code (the dataset's IState.iso2 — e.g. 'CA', 'IN'). */
	code: string
	name: string
}

export interface CityListItem {
	/** Dataset city id (number; serialized as-is over tRPC). */
	id: number
	name: string
	/** IANA Olson zone (resolved with the country fallback already applied). */
	timezone: string
}

export interface ResolvedCity {
	country: string
	city: string
	region: LocationRegion
	timezone: string
	locale: SupportedLocale
}

/** All countries, mapped to {code, name, region} and sorted by name. */
export async function listCountries(): Promise<CountryListItem[]> {
	const countries = await getCountries()
	return countries
		.map((c) => ({
			code: c.iso2.toUpperCase(),
			name: c.name,
			region: regionFor(c.region, c.subregion),
		}))
		.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * States/provinces for a country, mapped to {code, name} and sorted by name.
 * Returns [] for states-less countries (the UI hides the State select when this
 * is empty and the City select then drives off getAllCitiesOfCountry).
 */
export async function listStates(country: string): Promise<StateListItem[]> {
	const cc = country.toUpperCase()
	const states = await getStatesOfCountry(cc)
	return states
		.map((s) => ({code: s.iso2, name: s.name}))
		.sort((a, b) => a.name.localeCompare(b.name))
}

/** Resolve a primary country zone for the rare null-timezone city fallback. */
async function countryFallbackZone(country: string): Promise<string> {
	try {
		const zones = await getCountryTimezones(country.toUpperCase())
		return zones[0] ?? 'UTC'
	} catch {
		return 'UTC'
	}
}

/**
 * Cities for a (country, state?) pair, mapped to {id, name, timezone} and
 * sorted by name. When `state` is omitted (states-less country) we load every
 * city in the country via getAllCitiesOfCountry. The timezone is read straight
 * off the city; the country's primary zone is substituted when a city's
 * timezone is ever null.
 */
export async function listCities(
	country: string,
	state?: string,
): Promise<CityListItem[]> {
	const cc = country.toUpperCase()
	const cities: ICity[] = state
		? await getCitiesOfState(cc, state)
		: await getAllCitiesOfCountry(cc)

	let fallback: string | null = null
	const out: CityListItem[] = []
	for (const c of cities) {
		let tz = c.timezone
		if (!tz) {
			if (fallback === null) fallback = await countryFallbackZone(cc)
			tz = fallback
		}
		out.push({id: c.id, name: c.name, timezone: tz})
	}
	return out.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Resolve a (country, state?, cityId) selection to the full derived shape used
 * by `setup.setLocation`. Returns null when the country or city lookup misses.
 *
 * Defense-in-depth: the tRPC procedure layers a zod gate before this call and
 * the timezoneService.validate() Intl gate after.
 */
export async function resolveCity(
	country: string,
	state: string | undefined,
	cityId: number,
): Promise<ResolvedCity | null> {
	const cc = country.toUpperCase()

	const countries = await getCountries()
	const countryRow = countries.find((c) => c.iso2.toUpperCase() === cc)
	if (!countryRow) return null

	// getCityById requires a state code. For states-less countries (or when the
	// caller didn't pass one) fall back to scanning all cities of the country.
	let city: ICity | null = null
	if (state) {
		city = await getCityById(cc, state, cityId)
	}
	if (!city) {
		const all = await getAllCitiesOfCountry(cc)
		city = all.find((c) => c.id === cityId) ?? null
	}
	if (!city) return null

	const timezone = city.timezone ?? (await countryFallbackZone(cc))

	return {
		country: cc,
		city: city.name,
		region: regionFor(countryRow.region, countryRow.subregion),
		timezone,
		locale: localeFor(cc),
	}
}
