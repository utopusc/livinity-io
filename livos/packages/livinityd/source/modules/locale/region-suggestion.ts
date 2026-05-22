/**
 * Phase 196-04 — pure region suggestion utility.
 *
 * Two pure functions + a frozen 6-element Region allow-list used as the
 * single source of truth for both the tRPC `setup.setRegion` zod schema
 * (livinityd/modules/server/trpc/setup-router.ts) and the onboarding
 * `RegionStep` React component (ui/features/onboarding-flow/steps/region-step.tsx).
 *
 *   - countryToRegion(iso2)   — ISO-3166-1 alpha-2 (case-insensitive) → Region | null
 *   - timezoneToRegion(zone)  — IANA Olson zone → Region | null
 *
 * Pure, synchronous, zero dependencies. NO Node built-in imports — works
 * unchanged in any JS runtime (Node, browser, edge worker). The companion
 * client-side mirror in region-step.tsx is intentionally a small subset
 * (timezone-only) so the React bundle does not ship the full 250-entry
 * ISO table.
 *
 * Threat model (see Plan 196-04 § threat_model):
 *   - T-196-04-01 Tampering: callers (zod) gate region values against the
 *     REGIONS allow-list; this module merely returns null on unknown input.
 *   - T-196-04-03 Spoofing: CF-IPCountry header is UNTRUSTED — countryToRegion
 *     is advisory only. The operator confirms via UI; persistence is
 *     whatever the operator picks.
 */

export type Region =
	| 'europe'
	| 'north-america'
	| 'south-america'
	| 'asia'
	| 'africa'
	| 'oceania'

/**
 * Frozen 6-element allow-list. Imported VERBATIM by the tRPC setup-router
 * zod schema so the wire-format and the suggestion utility share one
 * source of truth (extending REGIONS here automatically extends the
 * server-side enum without a separate edit).
 */
export const REGIONS: readonly Region[] = Object.freeze([
	'europe',
	'north-america',
	'south-america',
	'asia',
	'africa',
	'oceania',
] as const)

// ─── ISO-3166-1 alpha-2 → Region table ──────────────────────────────────
//
// Exhaustive — covers all 250 currently-assigned codes plus the major
// reserved/transitional codes (XK Kosovo, AC Ascension, TA Tristan da Cunha).
// Sorted alphabetically within each region block for grep-ability.
const COUNTRY_TO_REGION: Readonly<Record<string, Region>> = Object.freeze({
	// ─── Europe ────────────────────────────────────────────────────────
	'AD': 'europe', // Andorra
	'AL': 'europe', // Albania
	'AT': 'europe', // Austria
	'AX': 'europe', // Åland Islands
	'BA': 'europe', // Bosnia and Herzegovina
	'BE': 'europe', // Belgium
	'BG': 'europe', // Bulgaria
	'BY': 'europe', // Belarus
	'CH': 'europe', // Switzerland
	'CY': 'europe', // Cyprus
	'CZ': 'europe', // Czechia
	'DE': 'europe', // Germany
	'DK': 'europe', // Denmark
	'EE': 'europe', // Estonia
	'ES': 'europe', // Spain
	'FI': 'europe', // Finland
	'FO': 'europe', // Faroe Islands
	'FR': 'europe', // France
	'GB': 'europe', // United Kingdom
	'GG': 'europe', // Guernsey
	'GI': 'europe', // Gibraltar
	'GR': 'europe', // Greece
	'HR': 'europe', // Croatia
	'HU': 'europe', // Hungary
	'IE': 'europe', // Ireland
	'IM': 'europe', // Isle of Man
	'IS': 'europe', // Iceland
	'IT': 'europe', // Italy
	'JE': 'europe', // Jersey
	'LI': 'europe', // Liechtenstein
	'LT': 'europe', // Lithuania
	'LU': 'europe', // Luxembourg
	'LV': 'europe', // Latvia
	'MC': 'europe', // Monaco
	'MD': 'europe', // Moldova
	'ME': 'europe', // Montenegro
	'MK': 'europe', // North Macedonia
	'MT': 'europe', // Malta
	'NL': 'europe', // Netherlands
	'NO': 'europe', // Norway
	'PL': 'europe', // Poland
	'PT': 'europe', // Portugal
	'RO': 'europe', // Romania
	'RS': 'europe', // Serbia
	'RU': 'europe', // Russia (geographically split; placed in Europe by political convention)
	'SE': 'europe', // Sweden
	'SI': 'europe', // Slovenia
	'SJ': 'europe', // Svalbard and Jan Mayen
	'SK': 'europe', // Slovakia
	'SM': 'europe', // San Marino
	'TR': 'europe', // Turkey (placed in Europe by political convention)
	'UA': 'europe', // Ukraine
	'VA': 'europe', // Vatican City
	'XK': 'europe', // Kosovo (transitional code)

	// ─── North America ─────────────────────────────────────────────────
	'AG': 'north-america', // Antigua and Barbuda
	'AI': 'north-america', // Anguilla
	'AW': 'north-america', // Aruba
	'BB': 'north-america', // Barbados
	'BL': 'north-america', // Saint Barthélemy
	'BM': 'north-america', // Bermuda
	'BQ': 'north-america', // Bonaire, Sint Eustatius and Saba
	'BS': 'north-america', // Bahamas
	'BZ': 'north-america', // Belize
	'CA': 'north-america', // Canada
	'CR': 'north-america', // Costa Rica
	'CU': 'north-america', // Cuba
	'CW': 'north-america', // Curaçao
	'DM': 'north-america', // Dominica
	'DO': 'north-america', // Dominican Republic
	'GD': 'north-america', // Grenada
	'GL': 'north-america', // Greenland (NA geographically; political ties to DK)
	'GP': 'north-america', // Guadeloupe
	'GT': 'north-america', // Guatemala
	'HN': 'north-america', // Honduras
	'HT': 'north-america', // Haiti
	'JM': 'north-america', // Jamaica
	'KN': 'north-america', // Saint Kitts and Nevis
	'KY': 'north-america', // Cayman Islands
	'LC': 'north-america', // Saint Lucia
	'MF': 'north-america', // Saint Martin (French part)
	'MQ': 'north-america', // Martinique
	'MS': 'north-america', // Montserrat
	'MX': 'north-america', // Mexico
	'NI': 'north-america', // Nicaragua
	'PA': 'north-america', // Panama
	'PM': 'north-america', // Saint Pierre and Miquelon
	'PR': 'north-america', // Puerto Rico
	'SV': 'north-america', // El Salvador
	'SX': 'north-america', // Sint Maarten (Dutch part)
	'TC': 'north-america', // Turks and Caicos Islands
	'TT': 'north-america', // Trinidad and Tobago
	'US': 'north-america', // United States
	'VC': 'north-america', // Saint Vincent and the Grenadines
	'VG': 'north-america', // Virgin Islands (British)
	'VI': 'north-america', // Virgin Islands (U.S.)

	// ─── South America ─────────────────────────────────────────────────
	'AR': 'south-america', // Argentina
	'BO': 'south-america', // Bolivia
	'BR': 'south-america', // Brazil
	'CL': 'south-america', // Chile
	'CO': 'south-america', // Colombia
	'EC': 'south-america', // Ecuador
	'FK': 'south-america', // Falkland Islands
	'GF': 'south-america', // French Guiana
	'GY': 'south-america', // Guyana
	'PE': 'south-america', // Peru
	'PY': 'south-america', // Paraguay
	'SR': 'south-america', // Suriname
	'UY': 'south-america', // Uruguay
	'VE': 'south-america', // Venezuela

	// ─── Asia ──────────────────────────────────────────────────────────
	'AE': 'asia', // United Arab Emirates
	'AF': 'asia', // Afghanistan
	'AM': 'asia', // Armenia (Caucasus — by convention Asia)
	'AZ': 'asia', // Azerbaijan (Caucasus — by convention Asia)
	'BD': 'asia', // Bangladesh
	'BH': 'asia', // Bahrain
	'BN': 'asia', // Brunei Darussalam
	'BT': 'asia', // Bhutan
	'CC': 'asia', // Cocos (Keeling) Islands
	'CN': 'asia', // China
	'CX': 'asia', // Christmas Island
	'GE': 'asia', // Georgia (Caucasus — by convention Asia)
	'HK': 'asia', // Hong Kong
	'ID': 'asia', // Indonesia
	'IL': 'asia', // Israel
	'IN': 'asia', // India
	'IO': 'asia', // British Indian Ocean Territory
	'IQ': 'asia', // Iraq
	'IR': 'asia', // Iran
	'JO': 'asia', // Jordan
	'JP': 'asia', // Japan
	'KG': 'asia', // Kyrgyzstan
	'KH': 'asia', // Cambodia
	'KP': 'asia', // North Korea
	'KR': 'asia', // South Korea
	'KW': 'asia', // Kuwait
	'KZ': 'asia', // Kazakhstan
	'LA': 'asia', // Lao People's Democratic Republic
	'LB': 'asia', // Lebanon
	'LK': 'asia', // Sri Lanka
	'MM': 'asia', // Myanmar
	'MN': 'asia', // Mongolia
	'MO': 'asia', // Macao
	'MV': 'asia', // Maldives
	'MY': 'asia', // Malaysia
	'NP': 'asia', // Nepal
	'OM': 'asia', // Oman
	'PH': 'asia', // Philippines
	'PK': 'asia', // Pakistan
	'PS': 'asia', // Palestine, State of
	'QA': 'asia', // Qatar
	'SA': 'asia', // Saudi Arabia
	'SG': 'asia', // Singapore
	'SY': 'asia', // Syrian Arab Republic
	'TH': 'asia', // Thailand
	'TJ': 'asia', // Tajikistan
	'TL': 'asia', // Timor-Leste
	'TM': 'asia', // Turkmenistan
	'TW': 'asia', // Taiwan
	'UZ': 'asia', // Uzbekistan
	'VN': 'asia', // Viet Nam
	'YE': 'asia', // Yemen

	// ─── Africa ────────────────────────────────────────────────────────
	'AC': 'africa', // Ascension Island (reserved code)
	'AO': 'africa', // Angola
	'BF': 'africa', // Burkina Faso
	'BI': 'africa', // Burundi
	'BJ': 'africa', // Benin
	'BW': 'africa', // Botswana
	'CD': 'africa', // Congo (Kinshasa)
	'CF': 'africa', // Central African Republic
	'CG': 'africa', // Congo (Brazzaville)
	'CI': 'africa', // Côte d'Ivoire
	'CM': 'africa', // Cameroon
	'CV': 'africa', // Cabo Verde
	'DJ': 'africa', // Djibouti
	'DZ': 'africa', // Algeria
	'EG': 'africa', // Egypt
	'EH': 'africa', // Western Sahara
	'ER': 'africa', // Eritrea
	'ET': 'africa', // Ethiopia
	'GA': 'africa', // Gabon
	'GH': 'africa', // Ghana
	'GM': 'africa', // Gambia
	'GN': 'africa', // Guinea
	'GQ': 'africa', // Equatorial Guinea
	'GW': 'africa', // Guinea-Bissau
	'KE': 'africa', // Kenya
	'KM': 'africa', // Comoros
	'LR': 'africa', // Liberia
	'LS': 'africa', // Lesotho
	'LY': 'africa', // Libya
	'MA': 'africa', // Morocco
	'MG': 'africa', // Madagascar
	'ML': 'africa', // Mali
	'MR': 'africa', // Mauritania
	'MU': 'africa', // Mauritius
	'MW': 'africa', // Malawi
	'MZ': 'africa', // Mozambique
	'NA': 'africa', // Namibia
	'NE': 'africa', // Niger
	'NG': 'africa', // Nigeria
	'RE': 'africa', // Réunion
	'RW': 'africa', // Rwanda
	'SC': 'africa', // Seychelles
	'SD': 'africa', // Sudan
	'SH': 'africa', // Saint Helena, Ascension and Tristan da Cunha
	'SL': 'africa', // Sierra Leone
	'SN': 'africa', // Senegal
	'SO': 'africa', // Somalia
	'SS': 'africa', // South Sudan
	'ST': 'africa', // Sao Tome and Principe
	'SZ': 'africa', // Eswatini
	'TA': 'africa', // Tristan da Cunha (reserved code)
	'TD': 'africa', // Chad
	'TF': 'africa', // French Southern Territories (mostly southern Indian Ocean — Africa by political convention)
	'TG': 'africa', // Togo
	'TN': 'africa', // Tunisia
	'TZ': 'africa', // Tanzania
	'UG': 'africa', // Uganda
	'YT': 'africa', // Mayotte
	'ZA': 'africa', // South Africa
	'ZM': 'africa', // Zambia
	'ZW': 'africa', // Zimbabwe

	// ─── Oceania ───────────────────────────────────────────────────────
	'AS': 'oceania', // American Samoa
	'AU': 'oceania', // Australia
	'CK': 'oceania', // Cook Islands
	'FJ': 'oceania', // Fiji
	'FM': 'oceania', // Micronesia
	'GU': 'oceania', // Guam
	'KI': 'oceania', // Kiribati
	'MH': 'oceania', // Marshall Islands
	'MP': 'oceania', // Northern Mariana Islands
	'NC': 'oceania', // New Caledonia
	'NF': 'oceania', // Norfolk Island
	'NR': 'oceania', // Nauru
	'NU': 'oceania', // Niue
	'NZ': 'oceania', // New Zealand
	'PF': 'oceania', // French Polynesia
	'PG': 'oceania', // Papua New Guinea
	'PN': 'oceania', // Pitcairn
	'PW': 'oceania', // Palau
	'SB': 'oceania', // Solomon Islands
	'TK': 'oceania', // Tokelau
	'TO': 'oceania', // Tonga
	'TV': 'oceania', // Tuvalu
	'UM': 'oceania', // U.S. Minor Outlying Islands
	'VU': 'oceania', // Vanuatu
	'WF': 'oceania', // Wallis and Futuna
	'WS': 'oceania', // Samoa

	// AQ (Antarctica), BV (Bouvet Island), GS (S. Georgia), HM (Heard/McDonald)
	// are intentionally omitted — no region in the 6-element allow-list applies.
})

/**
 * Map an ISO-3166-1 alpha-2 country code (case-insensitive) to a Region.
 *
 * Returns null for:
 *   - Falsy input (empty string / null / undefined)
 *   - Non-2-letter strings ("TUR" / "T" / "USA")
 *   - Unknown / unassigned codes ("XX", "ZZ")
 *   - Antarctica / Bouvet / S. Georgia / Heard (no continental region applies)
 *
 * Pure — no side effects, deterministic.
 */
export function countryToRegion(iso2: string | null | undefined): Region | null {
	if (!iso2) return null
	if (typeof iso2 !== 'string') return null
	if (iso2.length !== 2) return null
	const key = iso2.toUpperCase()
	return COUNTRY_TO_REGION[key] ?? null
}

// ─── IANA Olson zone → Region table ─────────────────────────────────────
//
// Default: leading "continent" segment maps deterministically. Three
// south-america overrides for IANA's quirky `America/*` flat namespace
// (America/Sao_Paulo, America/Argentina/*, etc.).

/**
 * America/* zones that actually belong to South America. IANA put all
 * mainland-Americas zones under the flat `America/*` prefix; this list
 * pulls the south-america ones back out.
 *
 * Sourced from `Intl.supportedValuesOf('timeZone')` filtered to the SA
 * continent (Sao_Paulo plus the Argentina/* sub-zones plus the Brazilian
 * westerly zones Cuiaba/Manaus/Recife/etc).
 */
const SOUTH_AMERICA_AMERICA_ZONES: ReadonlySet<string> = new Set([
	// Argentina
	'Argentina',
	'Buenos_Aires',
	'Catamarca',
	'Cordoba',
	'Jujuy',
	'La_Rioja',
	'Mendoza',
	'Rio_Gallegos',
	'Salta',
	'San_Juan',
	'San_Luis',
	'Tucuman',
	'Ushuaia',
	// Brazil
	'Araguaina',
	'Bahia',
	'Belem',
	'Boa_Vista',
	'Campo_Grande',
	'Cuiaba',
	'Eirunepe',
	'Fortaleza',
	'Maceio',
	'Manaus',
	'Noronha',
	'Porto_Velho',
	'Recife',
	'Rio_Branco',
	'Santarem',
	'Sao_Paulo',
	// Other SA countries
	'Asuncion', // Paraguay
	'Bogota', // Colombia
	'Cayenne', // French Guiana
	'Caracas', // Venezuela
	'Guayaquil', // Ecuador
	'La_Paz', // Bolivia
	'Lima', // Peru
	'Montevideo', // Uruguay
	'Paramaribo', // Suriname
	'Punta_Arenas', // Chile
	'Santiago', // Chile
	'Guyana', // Guyana
])

/**
 * Map an IANA Olson timezone (e.g. `Europe/Istanbul`, `America/Sao_Paulo`)
 * to a Region.
 *
 * Returns null for:
 *   - Falsy / malformed input
 *   - `Antarctica/*` (no continental region applies)
 *   - `Etc/*` (purely abstract offsets like `Etc/UTC`, `Etc/GMT+5`)
 *   - Unknown leading segments
 *
 * Pure — no side effects.
 */
export function timezoneToRegion(zone: string | null | undefined): Region | null {
	if (!zone) return null
	if (typeof zone !== 'string') return null
	const slash = zone.indexOf('/')
	if (slash < 1) return null
	const head = zone.substring(0, slash)
	const tail = zone.substring(slash + 1)
	// The `tail` first segment is what disambiguates America/* between NA + SA.
	const tailHead = tail.indexOf('/') === -1 ? tail : tail.substring(0, tail.indexOf('/'))
	switch (head) {
		case 'Europe':
			return 'europe'
		case 'America':
			// Default: NA. South-America overrides via the explicit set above
			// (covers Argentina/*, Sao_Paulo, Manaus, Bahia, etc).
			return SOUTH_AMERICA_AMERICA_ZONES.has(tailHead) ? 'south-america' : 'north-america'
		case 'Asia':
			return 'asia'
		case 'Africa':
			return 'africa'
		case 'Australia':
			return 'oceania'
		case 'Pacific':
			return 'oceania'
		case 'Indian':
			// Indian Ocean zones — mostly Africa (Mauritius, Mayotte, Reunion,
			// Seychelles, Comoro) with a few Asia (Maldives, Chagos) and
			// Antarctica (Kerguelen) outliers. Default to null and let the
			// CF-IPCountry path resolve it — this keeps the suggestion honest
			// rather than guessing wrong.
			return null
		case 'Atlantic':
			// Same logic as Indian — Atlantic zones span Africa (Canary,
			// Cape_Verde, St_Helena), Europe (Faroe, Madeira, Azores), and
			// South America (Stanley). Refuse to guess.
			return null
		case 'Antarctica':
			return null
		case 'Etc':
			return null
		default:
			return null
	}
}
