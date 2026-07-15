import {TbLoader2, TbPinnedOff, TbRefresh} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Switch} from '@/shadcn-components/ui/switch'
import {useCurrentUser} from '@/hooks/use-current-user'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

interface UpdatePolicySectionProps {
	appId: string
	appName: string
	/** The app's persisted auto-update policy (`app.autoUpdatePolicy ?? 'manual'`). */
	initialPolicy: 'auto' | 'manual'
	/** The exact version currently pinned/ignored (`app.ignoredVersion`), if any. */
	ignoredVersion?: string
}

/**
 * Phase 326-06 (APPS-02 UI half) — per-app auto-update policy + version-pin section.
 *
 * Clone of gpu-access-section.tsx: a Switch row bound to `apps.setUpdatePolicy`
 * ('auto' checked / 'manual' unchecked). When the app carries an `ignoredVersion`
 * pin, a caption reports the pinned version plus an "Unpin" button that clears it
 * via `apps.setIgnoredVersion` (version: undefined). Both mutations are
 * adminProcedure (326-01, D-21 — they govern the shared global app's update
 * behaviour for all users), so a non-admin sees the section but the controls are
 * disabled with a note.
 *
 * All copy flows through `t('app-update-policy.*')` against public/locales/{en,tr}.json.
 */
export function UpdatePolicySection({appId, appName, initialPolicy, ignoredVersion}: UpdatePolicySectionProps) {
	const utils = trpcReact.useUtils()
	const {isAdmin} = useCurrentUser()

	const setPolicyMut = trpcReact.apps.setUpdatePolicy.useMutation({
		onSuccess: () => {
			utils.apps.state.invalidate({appId})
			utils.apps.list.invalidate()
		},
	})

	const unpinMut = trpcReact.apps.setIgnoredVersion.useMutation({
		onSuccess: () => {
			utils.apps.list.invalidate()
		},
	})

	// Reflect the pending policy optimistically so the Switch tracks the click.
	const auto = (setPolicyMut.variables?.policy ?? initialPolicy) === 'auto'

	const handleToggle = (next: boolean) => {
		setPolicyMut.mutate({appId, policy: next ? 'auto' : 'manual'})
	}

	return (
		<div className='space-y-4'>
			<div className='flex items-center gap-2'>
				<TbRefresh className='h-5 w-5 text-text-primary' />
				<span className='text-body-sm font-medium text-text-primary'>{t('app-update-policy.title')}</span>
			</div>

			<div className='flex items-center justify-between'>
				<div className='flex items-center gap-3'>
					<Switch
						checked={auto}
						onCheckedChange={handleToggle}
						disabled={setPolicyMut.isPending || !isAdmin}
					/>
					<p className='text-caption text-text-tertiary'>{t('app-update-policy.description', {app: appName})}</p>
				</div>
				{setPolicyMut.isPending ? <TbLoader2 className='h-4 w-4 animate-spin text-text-secondary' /> : null}
			</div>

			{/* D-21 — update policy governs the shared global app, so only an admin can change it. */}
			{!isAdmin ? <p className='text-caption text-text-tertiary'>{t('app-update-policy.admin-only')}</p> : null}

			{/* D-05 — a pinned version is skipped by the Updates dialog AND "Update all". */}
			{ignoredVersion ? (
				<div className='flex items-center justify-between rounded-radius-sm border border-border-default bg-surface-base p-3'>
					<p className='text-caption text-text-secondary'>
						{t('app-update-policy.pinned', {version: ignoredVersion})}
					</p>
					<Button
						size='sm'
						variant='ghost'
						onClick={() => unpinMut.mutate({appId, version: undefined})}
						disabled={!isAdmin || unpinMut.isPending}
					>
						{unpinMut.isPending ? (
							<TbLoader2 className='mr-1 h-4 w-4 animate-spin' />
						) : (
							<TbPinnedOff className='mr-1 h-4 w-4' />
						)}
						{t('app-update-policy.unpin')}
					</Button>
				</div>
			) : null}

			{setPolicyMut.isError ? (
				<p role='alert' className='text-caption text-red-400'>
					{setPolicyMut.error?.message ?? 'Failed to update the auto-update policy — try again.'}
				</p>
			) : null}
		</div>
	)
}
