import {Route, Routes, useNavigate} from 'react-router-dom'

import {TbDatabase} from 'react-icons/tb'
import {ImmersiveDialog, ImmersiveDialogSplitContent} from '@/components/ui/immersive-dialog'
import {BackupsConfigureWizard} from '@/features/backups/components/configure-wizard'
import {BackupsRestoreWizard} from '@/features/backups/components/restore-wizard'
import {BackupsSetupWizard} from '@/features/backups/components/setup-wizard'
import {useBackups} from '@/features/backups/hooks/use-backups'
import {EnsureLoggedIn} from '@/modules/auth/ensure-logged-in'
import {t} from '@/utils/i18n'

function SplitDialog({
	children,
	onClosePath = '/settings',
	// this is the translation key for the title on the left side of the dialog
	sideTitleKey = 'backups',
}: {
	children: React.ReactNode
	onClosePath?: string
	sideTitleKey?: string
}) {
	const navigate = useNavigate()
	return (
		<ImmersiveDialog
			open={true}
			onOpenChange={(isOpen) => {
				if (!isOpen) {
					navigate(onClosePath, {preventScrollReset: true})
				}
			}}
		>
			{/* We prevent the dialog from closing when clicking outside of it */}
			{/* These are all long, multi-step wizards, so we don't want users to close them accidentally */}
			<ImmersiveDialogSplitContent
				side={<SplitLeftContent titleKey={sideTitleKey} />}
				onInteractOutside={(e) => e.preventDefault()}
			>
				{children}
			</ImmersiveDialogSplitContent>
		</ImmersiveDialog>
	)
}

function SplitLeftContent({titleKey = 'backup'}: {titleKey?: string}) {
	return (
		<div className='flex flex-col items-center'>
			<TbDatabase className='text-brand' style={{width: 67, height: 67}} aria-hidden />
			<div className='mt-2.5 px-2 text-center text-15 font-medium'>{t(titleKey)}</div>
			<div className='text-13 opacity-40'>{t('livinity')}</div>
		</div>
	)
}

export default function BackupsRestoreDialog() {
	const {repositories} = useBackups()
	// Phase 368.5: close-navigation keyed to USER repositories — on a safety-only
	// box (the universal default) closing setup must land back in Settings, not
	// steer into the Configure wizard. Same isSafety-filter idiom as 2f4eb321.
	const hasRepositories = (repositories ?? []).some((repo) => repo.isSafety !== true)
	return (
		<>
			<Routes>
				{/* Setup Wizard */}
				<Route
					path='setup'
					element={
						<EnsureLoggedIn>
							{/* Conditionally navigate on close: to settings if no repos, otherwise to configure */}
							<SplitDialog onClosePath={hasRepositories ? '/settings/backups/configure' : '/settings'}>
								<BackupsSetupWizard />
							</SplitDialog>
						</EnsureLoggedIn>
					}
				/>
				{/* Configure Wizard */}
				<Route
					path='configure'
					element={
						<EnsureLoggedIn>
							<SplitDialog>
								<BackupsConfigureWizard />
							</SplitDialog>
						</EnsureLoggedIn>
					}
				/>
				{/* Restore Wizard */}
				<Route
					path='restore'
					element={
						<EnsureLoggedIn>
							<SplitDialog sideTitleKey='backups-restore'>
								<BackupsRestoreWizard />
							</SplitDialog>
						</EnsureLoggedIn>
					}
				/>
			</Routes>
		</>
	)
}
