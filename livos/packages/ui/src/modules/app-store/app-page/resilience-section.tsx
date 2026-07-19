import {useState} from 'react'
import {TbLoader2, TbShieldCheck} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Switch} from '@/shadcn-components/ui/switch'
import {useCurrentUser} from '@/hooks/use-current-user'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

interface ResilienceSectionProps {
	appId: string
	appName: string
	/** Persisted per-app OOM self-heal flag (`app.oomSelfHeal`). undefined = default ON. */
	initialOomSelfHeal?: boolean
	/** Persisted per-app debug-mode flag (`app.debugMode`) — true while the app runs entrypoint-suppressed. */
	debugMode?: boolean
}

/**
 * Phase 343-03 (RESIL-01/02 UI half) — per-app resilience section.
 *
 * Clone of resource-limits-section.tsx: a header + description, an OOM self-heal
 * Switch, and an Enter/Exit debug-mode control. Surfaces the 343-01/02 daemon
 * capabilities:
 *  - OOM self-heal (RESIL-02): auto-restart the app's container on an out-of-memory
 *    kill + alert the owner; after 3 restarts/hour self-heal pauses and raises a
 *    crash-loop alert. Persisted through `apps.setOomSelfHeal` (adminProcedure).
 *    `initialOomSelfHeal === undefined` means the key was never set → default ON,
 *    so the Switch renders checked.
 *  - Debug mode (RESIL-01): drop a crash-looping app into an idle container
 *    (entrypoint suppressed, data intact) so the admin repairs it via the existing
 *    terminal. Enter/exit through `apps.enterDebugMode` / `apps.exitDebugMode`
 *    (adminProcedure). Updates are blocked while in debug (server-enforced).
 *
 * All three mutations are adminProcedure — non-admins see the controls but they are
 * disabled (defense-in-depth over the server gate, T-343-10). All copy flows through
 * `t('app-resilience.*')` against public/locales/{en,tr}.json.
 */
export function ResilienceSection({appId, appName, initialOomSelfHeal, debugMode}: ResilienceSectionProps) {
	const utils = trpcReact.useUtils()
	const {isAdmin} = useCurrentUser()

	// undefined = default ON (the server treats an unset key as enabled).
	const [oomSelfHeal, setOomSelfHeal] = useState(initialOomSelfHeal ?? true)

	const invalidate = () => {
		utils.apps.state.invalidate({appId})
		utils.apps.list.invalidate()
	}

	const setOomSelfHealMut = trpcReact.apps.setOomSelfHeal.useMutation({onSuccess: invalidate})
	const enterDebugMut = trpcReact.apps.enterDebugMode.useMutation({onSuccess: invalidate})
	const exitDebugMut = trpcReact.apps.exitDebugMode.useMutation({onSuccess: invalidate})

	const handleOomToggle = (next: boolean) => {
		setOomSelfHeal(next)
		setOomSelfHealMut.mutate({appId, enabled: next})
	}

	const debugBusy = enterDebugMut.isPending || exitDebugMut.isPending

	return (
		<div className='space-y-4'>
			<div className='flex items-center gap-2'>
				<TbShieldCheck className='h-5 w-5 text-text-primary' />
				<span className='text-body-sm font-medium text-text-primary'>{t('app-resilience.title')}</span>
			</div>

			<p className='text-caption text-text-tertiary'>{t('app-resilience.description', {app: appName})}</p>

			{/* RESIL-02 (D-343-5): OOM self-heal Switch. undefined key = default ON. */}
			<div className='flex items-center justify-between'>
				<div className='flex items-center gap-3'>
					<Switch
						checked={oomSelfHeal}
						onCheckedChange={handleOomToggle}
						disabled={!isAdmin || setOomSelfHealMut.isPending}
					/>
					<p className='text-caption text-text-tertiary'>{t('app-resilience.oom-caption', {app: appName})}</p>
				</div>
				{setOomSelfHealMut.isPending ? <TbLoader2 className='h-4 w-4 animate-spin text-text-secondary' /> : null}
			</div>

			{setOomSelfHealMut.isError ? (
				<p role='alert' className='text-caption text-red-400'>
					{setOomSelfHealMut.error?.message ?? 'Failed to save OOM self-heal setting — try again.'}
				</p>
			) : null}

			{/* RESIL-01 (D-343-1/2): debug-mode enter/exit. In debug, show an active notice + Exit;
			    otherwise a warning + Enter. Both routes patch+restart server-side. */}
			<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-3'>
				{debugMode ? (
					<>
						<p className='text-caption text-amber-400'>{t('app-resilience.debug-active')}</p>
						<Button
							size='sm'
							variant='default'
							onClick={() => exitDebugMut.mutate({appId})}
							disabled={!isAdmin || debugBusy}
						>
							{exitDebugMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
							{t('app-resilience.exit')}
						</Button>
					</>
				) : (
					<>
						<p className='text-caption text-text-tertiary'>{t('app-resilience.debug-warning')}</p>
						<Button
							size='sm'
							variant='destructive'
							onClick={() => enterDebugMut.mutate({appId})}
							disabled={!isAdmin || debugBusy}
						>
							{enterDebugMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
							{t('app-resilience.enter')}
						</Button>
					</>
				)}

				{enterDebugMut.isError || exitDebugMut.isError ? (
					<p role='alert' className='text-caption text-red-400'>
						{enterDebugMut.error?.message ?? exitDebugMut.error?.message ?? 'Debug-mode change failed — try again.'}
					</p>
				) : null}
			</div>

			{/* T-343-10 — the resilience routes are adminProcedure, so gate the controls for non-admins too. */}
			{!isAdmin ? <p className='text-caption text-text-tertiary'>{t('app-resilience.admin-only')}</p> : null}
		</div>
	)
}
