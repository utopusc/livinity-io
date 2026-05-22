/**
 * Phase 196.1 — curated country/city catalog for the merged LocationStep.
 *
 * Replaces the Phase 196-04 6-region cards + Phase 196-05 IANA timezone list
 * with a single Country + City picker. From the chosen (country, city) we
 * derive timezone (IANA), locale (BCP-47 from SUPPORTED_LOCALES), and region
 * (continent — kept for back-compat with `liv:user:region` consumers).
 *
 * Design notes:
 *   - ~25 countries × 1-5 cities = ~80 entries. Hand-curated, not exhaustive.
 *   - Every city maps to a real IANA zone present in `Intl.supportedValuesOf('timeZone')`.
 *   - Every country maps to one of the 6 SUPPORTED_LOCALES; for languages outside
 *     the supported set (Italian, Japanese, etc.) we fall back to en-US so the
 *     UI still renders cleanly. Phase 197+ i18n can broaden this.
 *   - Single source of truth — frontend LocationStep imports COUNTRIES + CITIES;
 *     backend setup-router validates against the same shape.
 */

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

export interface CountryEntry {
	/** ISO-3166-1 alpha-2 (uppercase). */
	code: string
	/** English display label. */
	name: string
	region: LocationRegion
	defaultLocale: SupportedLocale
	cities: CityEntry[]
}

export interface CityEntry {
	/** Display name (English-friendly form). */
	name: string
	/** IANA Olson zone. MUST be present in `Intl.supportedValuesOf('timeZone')`. */
	timezone: string
}

export const COUNTRIES: readonly CountryEntry[] = [
	{
		code: 'TR',
		name: 'Türkiye',
		region: 'europe',
		defaultLocale: 'tr-TR',
		cities: [
			{name: 'Istanbul', timezone: 'Europe/Istanbul'},
			{name: 'Ankara', timezone: 'Europe/Istanbul'},
			{name: 'Izmir', timezone: 'Europe/Istanbul'},
			{name: 'Bursa', timezone: 'Europe/Istanbul'},
			{name: 'Antalya', timezone: 'Europe/Istanbul'},
		],
	},
	{
		code: 'US',
		name: 'United States',
		region: 'north-america',
		defaultLocale: 'en-US',
		cities: [
			{name: 'New York', timezone: 'America/New_York'},
			{name: 'Los Angeles', timezone: 'America/Los_Angeles'},
			{name: 'Chicago', timezone: 'America/Chicago'},
			{name: 'Denver', timezone: 'America/Denver'},
			{name: 'San Francisco', timezone: 'America/Los_Angeles'},
		],
	},
	{
		code: 'DE',
		name: 'Germany',
		region: 'europe',
		defaultLocale: 'de-DE',
		cities: [
			{name: 'Berlin', timezone: 'Europe/Berlin'},
			{name: 'Munich', timezone: 'Europe/Berlin'},
			{name: 'Hamburg', timezone: 'Europe/Berlin'},
			{name: 'Frankfurt', timezone: 'Europe/Berlin'},
		],
	},
	{
		code: 'GB',
		name: 'United Kingdom',
		region: 'europe',
		defaultLocale: 'en-US',
		cities: [
			{name: 'London', timezone: 'Europe/London'},
			{name: 'Manchester', timezone: 'Europe/London'},
			{name: 'Edinburgh', timezone: 'Europe/London'},
		],
	},
	{
		code: 'FR',
		name: 'France',
		region: 'europe',
		defaultLocale: 'fr-FR',
		cities: [
			{name: 'Paris', timezone: 'Europe/Paris'},
			{name: 'Lyon', timezone: 'Europe/Paris'},
			{name: 'Marseille', timezone: 'Europe/Paris'},
		],
	},
	{
		code: 'ES',
		name: 'Spain',
		region: 'europe',
		defaultLocale: 'es-ES',
		cities: [
			{name: 'Madrid', timezone: 'Europe/Madrid'},
			{name: 'Barcelona', timezone: 'Europe/Madrid'},
			{name: 'Valencia', timezone: 'Europe/Madrid'},
		],
	},
	{
		code: 'IT',
		name: 'Italy',
		region: 'europe',
		defaultLocale: 'en-US',
		cities: [
			{name: 'Rome', timezone: 'Europe/Rome'},
			{name: 'Milan', timezone: 'Europe/Rome'},
			{name: 'Naples', timezone: 'Europe/Rome'},
		],
	},
	{
		code: 'NL',
		name: 'Netherlands',
		region: 'europe',
		defaultLocale: 'en-US',
		cities: [
			{name: 'Amsterdam', timezone: 'Europe/Amsterdam'},
			{name: 'Rotterdam', timezone: 'Europe/Amsterdam'},
		],
	},
	{
		code: 'SE',
		name: 'Sweden',
		region: 'europe',
		defaultLocale: 'en-US',
		cities: [{name: 'Stockholm', timezone: 'Europe/Stockholm'}],
	},
	{
		code: 'PL',
		name: 'Poland',
		region: 'europe',
		defaultLocale: 'en-US',
		cities: [{name: 'Warsaw', timezone: 'Europe/Warsaw'}],
	},
	{
		code: 'RU',
		name: 'Russia',
		region: 'europe',
		defaultLocale: 'en-US',
		cities: [
			{name: 'Moscow', timezone: 'Europe/Moscow'},
			{name: 'Saint Petersburg', timezone: 'Europe/Moscow'},
		],
	},
	{
		code: 'AE',
		name: 'United Arab Emirates',
		region: 'asia',
		defaultLocale: 'ar-SA',
		cities: [
			{name: 'Dubai', timezone: 'Asia/Dubai'},
			{name: 'Abu Dhabi', timezone: 'Asia/Dubai'},
		],
	},
	{
		code: 'SA',
		name: 'Saudi Arabia',
		region: 'asia',
		defaultLocale: 'ar-SA',
		cities: [
			{name: 'Riyadh', timezone: 'Asia/Riyadh'},
			{name: 'Jeddah', timezone: 'Asia/Riyadh'},
		],
	},
	{
		code: 'IN',
		name: 'India',
		region: 'asia',
		defaultLocale: 'en-US',
		cities: [
			{name: 'Mumbai', timezone: 'Asia/Kolkata'},
			{name: 'New Delhi', timezone: 'Asia/Kolkata'},
			{name: 'Bangalore', timezone: 'Asia/Kolkata'},
		],
	},
	{
		code: 'CN',
		name: 'China',
		region: 'asia',
		defaultLocale: 'en-US',
		cities: [
			{name: 'Beijing', timezone: 'Asia/Shanghai'},
			{name: 'Shanghai', timezone: 'Asia/Shanghai'},
			{name: 'Shenzhen', timezone: 'Asia/Shanghai'},
		],
	},
	{
		code: 'JP',
		name: 'Japan',
		region: 'asia',
		defaultLocale: 'en-US',
		cities: [
			{name: 'Tokyo', timezone: 'Asia/Tokyo'},
			{name: 'Osaka', timezone: 'Asia/Tokyo'},
		],
	},
	{
		code: 'KR',
		name: 'South Korea',
		region: 'asia',
		defaultLocale: 'en-US',
		cities: [{name: 'Seoul', timezone: 'Asia/Seoul'}],
	},
	{
		code: 'AU',
		name: 'Australia',
		region: 'oceania',
		defaultLocale: 'en-US',
		cities: [
			{name: 'Sydney', timezone: 'Australia/Sydney'},
			{name: 'Melbourne', timezone: 'Australia/Melbourne'},
			{name: 'Brisbane', timezone: 'Australia/Brisbane'},
			{name: 'Perth', timezone: 'Australia/Perth'},
		],
	},
	{
		code: 'NZ',
		name: 'New Zealand',
		region: 'oceania',
		defaultLocale: 'en-US',
		cities: [{name: 'Auckland', timezone: 'Pacific/Auckland'}],
	},
	{
		code: 'BR',
		name: 'Brazil',
		region: 'south-america',
		defaultLocale: 'es-ES',
		cities: [
			{name: 'São Paulo', timezone: 'America/Sao_Paulo'},
			{name: 'Rio de Janeiro', timezone: 'America/Sao_Paulo'},
		],
	},
	{
		code: 'AR',
		name: 'Argentina',
		region: 'south-america',
		defaultLocale: 'es-ES',
		cities: [{name: 'Buenos Aires', timezone: 'America/Argentina/Buenos_Aires'}],
	},
	{
		code: 'MX',
		name: 'Mexico',
		region: 'north-america',
		defaultLocale: 'es-ES',
		cities: [
			{name: 'Mexico City', timezone: 'America/Mexico_City'},
			{name: 'Guadalajara', timezone: 'America/Mexico_City'},
		],
	},
	{
		code: 'CA',
		name: 'Canada',
		region: 'north-america',
		defaultLocale: 'en-US',
		cities: [
			{name: 'Toronto', timezone: 'America/Toronto'},
			{name: 'Vancouver', timezone: 'America/Vancouver'},
			{name: 'Montreal', timezone: 'America/Toronto'},
		],
	},
	{
		code: 'ZA',
		name: 'South Africa',
		region: 'africa',
		defaultLocale: 'en-US',
		cities: [{name: 'Johannesburg', timezone: 'Africa/Johannesburg'}],
	},
	{
		code: 'EG',
		name: 'Egypt',
		region: 'africa',
		defaultLocale: 'ar-SA',
		cities: [{name: 'Cairo', timezone: 'Africa/Cairo'}],
	},
	{
		code: 'NG',
		name: 'Nigeria',
		region: 'africa',
		defaultLocale: 'en-US',
		cities: [{name: 'Lagos', timezone: 'Africa/Lagos'}],
	},
] as const

const COUNTRY_INDEX = new Map<string, CountryEntry>(
	COUNTRIES.map((c) => [c.code, c] as const),
)

export function getCountry(code: string): CountryEntry | undefined {
	return COUNTRY_INDEX.get(code.toUpperCase())
}

/**
 * Resolve a (countryCode, cityName) pair to the full derived shape.
 *
 * Returns null if either lookup misses. Defense in depth — the
 * `setup.setLocation` tRPC procedure layers a zod gate before this call,
 * and the timezoneService.validate() Intl gate is layered after.
 */
export function resolveLocation(
	countryCode: string,
	cityName: string,
): {
	country: string
	city: string
	region: LocationRegion
	timezone: string
	locale: SupportedLocale
} | null {
	const country = getCountry(countryCode)
	if (!country) return null
	const city = country.cities.find((c) => c.name === cityName)
	if (!city) return null
	return {
		country: country.code,
		city: city.name,
		region: country.region,
		timezone: city.timezone,
		locale: country.defaultLocale,
	}
}
