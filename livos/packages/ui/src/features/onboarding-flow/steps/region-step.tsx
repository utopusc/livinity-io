import {useEffect, useState} from 'react'

import {trpcReact} from '@/trpc/trpc'

import type {OnboardingData} from '../constants'
import {FooterBar} from '../footer-bar'

/* =========================================================
   RegionStep — Phase 196-04.

   6-card region selection step with two suggestion paths:

     - SSR / server-injected: `initialSuggestedRegion` prop (the
       livinityd setup-wizard fetch may carry a CF-IPCountry-derived
       suggestion through props; route shape lands in Plan 196-05's
       wizard wire-up).
     - Client-side fallback: when no prop is present, read
       `Intl.DateTimeFormat().resolvedOptions().timeZone` and map
       through the small inline timezone→region mirror below.

   The full ISO-3166-1 + IANA mapping lives server-side in
   livinityd/modules/locale/region-suggestion.ts. The client mirror is
   intentionally a SUBSET (timezone-only leading-segment dispatch +
   3 SA-override sentinels) so the React bundle does not ship the
   250-entry country table. The server schema (zod z.enum(REGIONS))
   stays the authoritative gate — even if the client picked a value
   outside the allow-list, the tRPC seam would reject it.

   Persistence: clicking Continue invokes `trpc.setup.setRegion.mutate
   ({region, country?})` adminProcedure mutation. Skip bypasses
   persistence — the caller can decide whether to default later.

   Wizard mount + step insertion is Plan 196-05's responsibility
   (constants.TOTAL bump + setup-wizard-v2.tsx <Step> entry).

   ========================================================= */

import type {Region} from '../../../../../livinityd/source/modules/locale/region-suggestion'

type Props = {
	data: OnboardingData
	setData: (d: OnboardingData) => void
	onContinue: () => void
	onSkip: () => void
	onBack: () => void
	/**
	 * Optional SSR-injected suggestion (e.g. derived from the
	 * CF-IPCountry request header at livinityd's setup-wizard fetch).
	 * When absent, the component runs the client-side timezone fallback
	 * on mount.
	 */
	initialSuggestedRegion?: Region | null
}

type RegionCard = {
	id: Region
	label: string
}

const REGION_CARDS: RegionCard[] = [
	{id: 'europe', label: 'Europe'},
	{id: 'north-america', label: 'North America'},
	{id: 'south-america', label: 'South America'},
	{id: 'asia', label: 'Asia'},
	{id: 'africa', label: 'Africa'},
	{id: 'oceania', label: 'Oceania'},
]

/**
 * Phase 196-04 — client-side timezone→region fallback. Authoritative
 * copy lives in livinityd/modules/locale/region-suggestion.ts. Kept
 * small (≤ 20 lines) — only the leading-segment dispatch + a tiny SA
 * sentinel set sufficient to catch the common LATAM zones.
 */
const SA_SENTINELS = new Set([
	'Sao_Paulo',
	'Argentina',
	'Manaus',
	'Santiago',
	'Bogota',
	'Lima',
	'Caracas',
])

function clientTimezoneToRegion(zone: string): Region | null {
	const slash = zone.indexOf('/')
	if (slash < 1) return null
	const head = zone.substring(0, slash)
	const tailHead = zone.substring(slash + 1).split('/')[0]
	if (head === 'Europe') return 'europe'
	if (head === 'America')
		return SA_SENTINELS.has(tailHead) ? 'south-america' : 'north-america'
	if (head === 'Asia') return 'asia'
	if (head === 'Africa') return 'africa'
	if (head === 'Australia' || head === 'Pacific') return 'oceania'
	return null
}

export function RegionStep({
	data,
	setData,
	onContinue,
	onSkip,
	onBack,
	initialSuggestedRegion,
}: Props) {
	// Suggested region — used to render the "Suggested by your location"
	// pill on the matching card. Computed once on mount.
	const [suggested] = useState<Region | null>(() => {
		if (initialSuggestedRegion !== undefined && initialSuggestedRegion !== null) {
			return initialSuggestedRegion
		}
		try {
			const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
			if (tz) return clientTimezoneToRegion(tz)
		} catch {
			// Intl may throw in extremely old runtimes; fall through to null.
		}
		return null
	})

	// Selected region — initialized to the suggested one (if any) so a
	// no-op operator can just click Continue. NEVER falls back to a
	// hard-coded region — null means "no selection yet" and Continue
	// is disabled.
	const [selected, setSelected] = useState<Region | null>(suggested)

	// If suggested arrives via a SSR prop AFTER mount (rare but possible
	// in some Suspense paths), and the operator has not yet picked,
	// adopt it.
	useEffect(() => {
		if (
			initialSuggestedRegion !== undefined &&
			initialSuggestedRegion !== null &&
			selected === null
		) {
			setSelected(initialSuggestedRegion)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [initialSuggestedRegion])

	const setRegionMut = trpcReact.setup.setRegion.useMutation()

	async function handleContinue() {
		if (!selected) return
		// Persist into wizard state so the resume payload + downstream
		// steps see the choice.
		setData({...data, region: selected} as OnboardingData)
		try {
			await setRegionMut.mutateAsync({region: selected})
		} catch {
			// Persistence failure is not blocking — the operator can still
			// proceed and the choice is retained in wizard state. A future
			// plan may surface a toast; for now we silently swallow so a
			// transient Redis blip doesn't trap the user.
		}
		onContinue()
	}

	const continueDisabled = selected === null || setRegionMut.isPending

	return (
		<div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
			<div className='fade-up'>
				<div className='onb-eyebrow'>06 · Region</div>
				<h1 className='onb-title' style={{marginTop: 8}}>
					Where in the world are you?
				</h1>
				<p className='onb-sub' style={{marginTop: 10}}>
					Liv tailors latency routing, default locale hints, and provider tier availability to your
					region. You can change this later in Settings.
				</p>
			</div>

			<div
				className='region-grid fade-up d2'
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
					gap: 12,
				}}
			>
				{REGION_CARDS.map((card) => {
					const isSelected = selected === card.id
					const isSuggested = suggested === card.id
					return (
						<button
							key={card.id}
							type='button'
							className={`region-card${isSelected ? ' is-selected' : ''}${
								isSuggested ? ' is-suggested' : ''
							}`}
							data-testid={`region-card-${card.id}`}
							aria-pressed={isSelected ? 'true' : 'false'}
							onClick={() => setSelected(card.id)}
							style={{
								textAlign: 'left',
								padding: 16,
								borderRadius: 12,
								border: isSelected
									? '1px solid var(--cyan, #06b6d4)'
									: '1px solid var(--line)',
								background: 'var(--surface)',
								color: 'var(--fg)',
								cursor: 'pointer',
								position: 'relative',
								display: 'flex',
								flexDirection: 'column',
								gap: 4,
								minHeight: 76,
							}}
						>
							{isSuggested && (
								<span
									className='region-card-suggested-pill'
									data-testid={`region-card-${card.id}-suggested`}
									style={{
										position: 'absolute',
										top: 8,
										right: 8,
										fontSize: 11,
										padding: '2px 8px',
										borderRadius: 999,
										background: 'var(--cyan-bg, rgba(6,182,212,0.12))',
										border: '1px solid var(--cyan, #06b6d4)',
										color: 'var(--cyan, #06b6d4)',
									}}
								>
									Suggested by your location
								</span>
							)}
							<div style={{fontSize: 15, fontWeight: 600}}>{card.label}</div>
						</button>
					)
				})}
			</div>

			<FooterBar
				onBack={onBack}
				onContinue={handleContinue}
				onSkip={onSkip}
				continueLabel={setRegionMut.isPending ? 'Saving…' : 'Continue'}
				continueDisabled={continueDisabled}
				hint='↵ to continue · esc for back'
			/>
		</div>
	)
}

export default RegionStep
