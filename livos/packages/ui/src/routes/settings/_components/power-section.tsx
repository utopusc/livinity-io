import {Loader2} from 'lucide-react'
import {useState} from 'react'
import {RiRestartLine, RiShutDownLine} from 'react-icons/ri'

import {SettingsPageHeader} from '@/components/settings-page-header'
import {FieldCard, FieldRow} from '@/components/field-card'
import {LOADING_DASH} from '@/constants'
import {useLanguage} from '@/hooks/use-language'
import {useGlobalSystemState} from '@/providers/global-system-state/index'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/shadcn-components/ui/alert-dialog'
import {Button} from '@/shadcn-components/ui/button'
import {trpcReact} from '@/trpc/trpc'
import {duration} from '@/utils/date-time'
import {t} from '@/utils/i18n'

/**
 * v36 LivOS Design Port — Power section (SYSTEM).
 *
 * Live uptime read-out + confirm-gated Restart / Shut Down. Both power actions
 * are driven through the global system-state provider (`useGlobalSystemState`),
 * NOT the raw tRPC mutations — the provider owns the full-screen restarting /
 * shutting-down cover plus the logout/redirect flow. Each action sits behind an
 * AlertDialog confirm that mirrors the orphan `restart.tsx` / `shutdown.tsx`
 * dialogs exactly (preventDefault + trigger, disabled-while-triggered on restart).
 */
export function PowerSection() {
	const [languageCode] = useLanguage()
	const uptimeQ = trpcReact.system.uptime.useQuery(undefined, {refetchInterval: 30000})

	return (
		<div className='flex flex-col gap-8'>
			<SettingsPageHeader
				eyebrow='Power'
				title='Power'
				titleAccent='controls.'
				sub='Restart or fully shut down this LivOS device. Active apps and sessions will be interrupted.'
			/>

			<FieldCard>
				<FieldRow
					label='Uptime'
					value={
						uptimeQ.isLoading || uptimeQ.data === undefined ? (
							<span className='inline-flex items-center gap-2 text-[color:var(--fg-faint)]'>
								<Loader2 className='h-3.5 w-3.5 animate-spin' />
								{LOADING_DASH}
							</span>
						) : (
							<span>{duration(uptimeQ.data, languageCode)}</span>
						)
					}
				/>
			</FieldCard>

			<FieldCard>
				<FieldRow
					label='Restart'
					value={
						<span className='text-[color:var(--fg-mute)]'>
							Reboot LivOS. Apps and sessions resume once the device is back up.
						</span>
					}
					trailing={<RestartConfirm />}
				/>
				<FieldRow
					label='Shut down'
					value={
						<span className='text-[color:var(--fg-mute)]'>
							Power off the device. You will need to turn it back on manually.
						</span>
					}
					trailing={<ShutdownConfirm />}
				/>
			</FieldCard>
		</div>
	)
}

/**
 * Restart confirm — mirrors `routes/settings/restart.tsx`: the AlertDialogAction
 * preventsDefault (keeps the dialog open), flips `triggered`, then calls
 * `restart()`. The action is disabled once triggered so it can't be double-fired.
 */
function RestartConfirm() {
	const {restart} = useGlobalSystemState()
	const [open, setOpen] = useState(false)
	const [triggered, setTriggered] = useState(false)

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<Button variant='v36-ghost' size='v36-pill-sm' onClick={() => setOpen(true)}>
				Restart
			</Button>
			<AlertDialogContent>
				<AlertDialogHeader icon={RiRestartLine}>
					<AlertDialogTitle>{t('restart.confirm.title')}</AlertDialogTitle>
					<AlertDialogDescription>
						Active apps and sessions will be interrupted while LivOS reboots.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogAction
						variant='destructive'
						className='px-6'
						onClick={(e) => {
							// Prevent closing by default
							e.preventDefault()
							setTriggered(true)
							restart()
						}}
						disabled={triggered}
					>
						{t('restart.confirm.submit')}
					</AlertDialogAction>
					<AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

/**
 * Shut-down confirm — mirrors `routes/settings/shutdown.tsx`: the
 * AlertDialogAction preventsDefault and calls `shutdown()`; the provider takes
 * over with the shutting-down cover.
 */
function ShutdownConfirm() {
	const {shutdown} = useGlobalSystemState()
	const [open, setOpen] = useState(false)

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<Button variant='destructive' size='v36-pill-sm' onClick={() => setOpen(true)}>
				Shut down
			</Button>
			<AlertDialogContent>
				<AlertDialogHeader icon={RiShutDownLine}>
					<AlertDialogTitle>{t('shut-down.confirm.title')}</AlertDialogTitle>
					<AlertDialogDescription>
						The device will power off. Active apps and sessions will be interrupted.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogAction
						variant='destructive'
						onClick={(e) => {
							// Prevent closing by default
							e.preventDefault()
							shutdown()
						}}
					>
						{t('shut-down.confirm.submit')}
					</AlertDialogAction>
					<AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
