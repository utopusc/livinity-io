/**
 * Phase 196-04 / 196-05 — locale module barrel.
 *
 * Public surface consumed by:
 *   - server/trpc/setup-router.ts (zod schema gates region values via REGIONS;
 *     also imports TimezoneService + createTimezoneService for the 196-05
 *     `setLocaleTimezone` procedure)
 *   - server/trpc/setup-router.ts (optionally calls countryToRegion if a
 *     CF-IPCountry header makes it into ctx in a future plan)
 *   - ui/src/features/onboarding-flow/steps/region-step.tsx (client-side
 *     mirror — ships its OWN small timezone copy; this barrel exists so
 *     server-side render or any future SSR path can import the full table).
 */

export {
	REGIONS,
	countryToRegion,
	timezoneToRegion,
} from './region-suggestion.js'
export type {Region} from './region-suggestion.js'

// Phase 196-05 — timezone validate + setSystemTimezone (sudo timedatectl).
export {
	createTimezoneService,
	InvalidTimezoneError,
	TimedatectlError,
} from './timezone-service.js'
export type {TimezoneService} from './timezone-service.js'

// Country → (state) → city picker backed by @countrystatecity/countries.
// Dataset stays backend-only; the UI reaches it via setup.* tRPC queries.
export {
	SUPPORTED_LOCALES,
	COUNTRY_LOCALE,
	localeFor,
	regionFor,
	listCountries,
	listStates,
	listCities,
	resolveCity,
} from './location-data.js'
export type {
	LocationRegion,
	SupportedLocale,
	CountryListItem,
	StateListItem,
	CityListItem,
	ResolvedCity,
} from './location-data.js'
