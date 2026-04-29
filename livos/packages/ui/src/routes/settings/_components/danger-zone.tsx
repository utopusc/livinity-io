// Phase 38 Plan 02 — Settings > Advanced > Danger Zone section.
//
// FR-UI-01 (entry point) + part of FR-UI-07 (admin-only gating).
//
// Pre-flight blocking checks (update-in-progress + network reachability) live
// in Plan 03's confirmation modal — at this layer the button is always
// "available" for admins; the modal performs gating before the destructive
// mutation fires.
//
// D-UI-01 (LOCKED): visually segregated section below all safe Advanced
// rows, with destructive (red) border + muted background + warning header.
// D-UI-02 (LOCKED): button is destructive variant with shield-warning icon
// to the LEFT of label.
// D-UI-03 (LOCKED): non-admin users see an explanatory <p> note (NOT a
// faded button — that would invite mis-clicks).
// D-BE-02 (LOCKED): non-admin users do not see the button at all; the
// component decides what to render based on `useCurrentUser().isAdmin`.

import {TbShieldExclamation} from 'react-icons/tb'

import {IconButtonLink} from '@/components/ui/icon-button-link'
import {useCurrentUser} from '@/hooks/use-current-user'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'
import {tw} from '@/utils/tw'

// Pure helper extracted for unit-testability. Given a current-user query
// shape, decide what to render (button | non-admin note | nothing-while-loading).
//
// Three states are exhaustive:
//   - `loading`         → query hasn't resolved; render neutral placeholder
//                         (NO admin button, NO non-admin note flash)
//   - `admin-button`    → admin user; render destructive Factory Reset button
//   - `non-admin-note`  → non-admin user; render D-UI-03 explanatory note
export type DangerZoneVisibility = 'admin-button' | 'non-admin-note' | 'loading'

export function decideDangerZoneVisibility(state: {isLoading: boolean; isAdmin: boolean}): DangerZoneVisibility {
	if (state.isLoading) return 'loading'
	return state.isAdmin ? 'admin-button' : 'non-admin-note'
}

export function DangerZone() {
	const {isLoading, isAdmin} = useCurrentUser()
	const visibility = decideDangerZoneVisibility({isLoading, isAdmin})

	return (
		<section
			data-testid='settings-danger-zone'
			className={cn(dangerSectionClass)}
			aria-labelledby='danger-zone-heading'
		>
			<header className='flex items-center gap-2'>
				<TbShieldExclamation className='h-5 w-5 text-destructive2' aria-hidden='true' />
				<h3 id='danger-zone-heading' className='text-body font-medium leading-tight text-destructive2'>
					{t('danger-zone')}
				</h3>
			</header>
			<p className='text-body-sm leading-tight text-text-tertiary'>{t('danger-zone.description')}</p>

			{visibility === 'admin-button' && (
				<div className='flex items-center justify-between gap-2 rounded-radius-md bg-surface-1 p-4'>
					<div className='flex-1 space-y-1'>
						<h4 className='text-body font-medium leading-tight'>{t('factory-reset')}</h4>
						<p className='text-body-sm leading-tight text-text-tertiary'>{t('factory-reset-description')}</p>
					</div>
					<IconButtonLink
						to='/factory-reset'
						variant='destructive'
						icon={TbShieldExclamation}
						data-testid='factory-reset-button'
					>
						{t('factory-reset.button')}
					</IconButtonLink>
				</div>
			)}

			{visibility === 'non-admin-note' && (
				<p
					data-testid='factory-reset-non-admin-note'
					className='rounded-radius-md bg-surface-1 p-4 text-body-sm leading-tight text-text-tertiary'
				>
					{t('factory-reset.non-admin-note')}
				</p>
			)}

			{visibility === 'loading' && <div data-testid='factory-reset-loading' className='h-12' />}
		</section>
	)
}

// D-UI-01: red border + muted background + warning header. `tw` helper used
// elsewhere in advanced.tsx for cardClass — mirror the convention.
const dangerSectionClass = tw`flex flex-col gap-2 rounded-radius-md border border-destructive2/40 bg-destructive2/5 p-4 mt-6`
