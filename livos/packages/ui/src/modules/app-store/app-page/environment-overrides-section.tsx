import {useState} from 'react'
import {TbSettings} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {useCurrentUser} from '@/hooks/use-current-user'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

import {EnvironmentOverride, EnvironmentOverridesDialog} from '../environment-overrides-dialog'

interface EnvironmentOverridesSectionProps {
	appId: string
	appName: string
	/** The manifest field spec (`app.installOptions.environmentOverrides`) — the same
	 *  array the install-time dialog renders. */
	overrides: EnvironmentOverride[]
	/** The app's persisted override values (`app.environmentOverrides ?? {}`) — used to
	 *  prefill the reopened form. */
	initialValues: Record<string, string>
}

/**
 * Phase 326-04 (APPS-01) — Configure section for the app settings dialog.
 *
 * Clone of gpu-access-section.tsx: a "Configure" Button reopens the EXACT
 * install-time `EnvironmentOverridesDialog` (validated form), prefilled with the
 * app's current values via `initialValues`, and persists through
 * `apps.setEnvironmentOverrides` — the SERVER re-runs the manifest allowlist
 * (326-01, T-326-14) so the UI carries no trust. `setEnvironmentOverrides` is an
 * adminProcedure (T-326-15): non-admins see the section but the button is disabled.
 *
 * The dialog is opened WITHOUT any GPU props, so its `showGpuToggle` gate stays
 * false — Configure is env-only.
 *
 * All copy flows through `t('app-configure.*')` against public/locales/{en,tr}.json.
 */
export function EnvironmentOverridesSection({appId, appName, overrides, initialValues}: EnvironmentOverridesSectionProps) {
	const utils = trpcReact.useUtils()
	const {isAdmin} = useCurrentUser()
	const [open, setOpen] = useState(false)

	const setEnvOverridesMut = trpcReact.apps.setEnvironmentOverrides.useMutation({
		onSuccess: () => {
			utils.apps.state.invalidate({appId})
			utils.apps.list.invalidate()
			setOpen(false)
		},
	})

	return (
		<div className='space-y-4'>
			<div className='flex items-center gap-2'>
				<TbSettings className='h-5 w-5 text-text-primary' />
				<span className='text-body-sm font-medium text-text-primary'>{t('app-configure.title')}</span>
			</div>

			<div className='flex items-center justify-between gap-3'>
				<p className='text-caption text-text-tertiary'>{t('app-configure.description', {app: appName})}</p>
				<Button size='sm' variant='default' onClick={() => setOpen(true)} disabled={!isAdmin}>
					{t('app-configure.button')}
				</Button>
			</div>

			{/* WR-02 mirror — env overrides env-inject + restart the shared global app,
			    so only an admin can change them (setEnvironmentOverrides is adminProcedure). */}
			{!isAdmin ? <p className='text-caption text-text-tertiary'>{t('gpu-access.admin-only')}</p> : null}

			{setEnvOverridesMut.isError ? (
				<p role='alert' className='text-caption text-red-400'>
					{setEnvOverridesMut.error?.message ?? 'Failed to save configuration — try again.'}
				</p>
			) : null}

			{/* Reopen the EXACT install-time validated form, prefilled (326-04). No GPU
			    props → env-only. onNext persists via setEnvironmentOverrides (allowlist
			    re-run server-side). */}
			<EnvironmentOverridesDialog
				open={open}
				onOpenChange={setOpen}
				appName={appName}
				overrides={overrides}
				initialValues={initialValues}
				submitLabel={t('app-configure.save')}
				onNext={(values) => setEnvOverridesMut.mutate({appId, overrides: values})}
			/>
		</div>
	)
}
