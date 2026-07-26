// Backup-completeness P2 — "What's included in your backup" selector.
// Shows what the snapshot always carries (files + apps) and lets the operator
// toggle the extra out-of-tree stores (the Postgres DB incl. Liv's memory, and
// the Liv AI data dir). Rendered in the Backups configure wizard above the
// exclusions ("what to skip") section.
import {TbDatabase, TbDeviceDesktop, TbFiles, TbMessageChatbot, TbApps} from 'react-icons/tb'

import {useBackupScope} from '@/features/backups/hooks/use-backup-scope'
import {Switch} from '@/shadcn-components/ui/switch'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'

type Row = {
	icon: React.ComponentType<{className?: string}>
	title: string
	desc: string
	/** always-on rows are informational (files + apps are the dataDirectory snapshot itself) */
	always?: boolean
	value?: boolean
	onChange?: (next: boolean) => void
}

export function BackupScope({showTitle = false}: {showTitle?: boolean}) {
	const {scope, isLoading, setScope, isSaving} = useBackupScope()

	const rows: Row[] = [
		{
			icon: TbFiles,
			title: t('backups.scope.files', {defaultValue: 'Files & folders'}),
			desc: t('backups.scope.files-desc', {defaultValue: 'Everything in your Home, documents, photos and downloads.'}),
			always: true,
		},
		{
			icon: TbApps,
			title: t('backups.scope.apps', {defaultValue: 'Installed apps & their data'}),
			desc: t('backups.scope.apps-desc', {defaultValue: 'App configuration and each app’s stored data.'}),
			always: true,
		},
		{
			icon: TbDatabase,
			title: t('backups.scope.database', {defaultValue: 'System database & Liv’s memory'}),
			desc: t('backups.scope.database-desc', {
				defaultValue: 'Accounts, app records, domain routing, and the context Liv has built up. Recommended.',
			}),
			value: scope?.systemDatabase ?? true,
			onChange: (next) => setScope({systemDatabase: next}),
		},
		{
			icon: TbMessageChatbot,
			title: t('backups.scope.liv-ai', {defaultValue: 'Liv AI chat history & skills'}),
			desc: t('backups.scope.liv-ai-desc', {defaultValue: 'Your Liv AI conversations and installed skills.'}),
			value: scope?.livAssistantData ?? true,
			onChange: (next) => setScope({livAssistantData: next}),
		},
		{
			// Phase 368.5 gate: OFF by default, and visible precisely so that being
			// off is a choice rather than a hidden rule. VM disk images are tens of
			// gigabytes and every VM boot rewrites blocks all through them, so
			// including them in an hourly local backup can fill the system disk.
			icon: TbDeviceDesktop,
			title: t('backups.scope.vm-images', {defaultValue: 'Virtual machine disk images'}),
			desc: t('backups.scope.vm-images-desc', {
				defaultValue:
					'Off by default — these are very large and change constantly, so including them can fill the disk. Your VM settings are always backed up; only the disk images are skipped.',
			}),
			value: scope?.vmDiskImages ?? false,
			onChange: (next) => setScope({vmDiskImages: next}),
		},
	]

	return (
		<div className='flex flex-col gap-3'>
			{showTitle && (
				<div>
					<h3 className='text-15 font-semibold -tracking-2'>
						{t('backups.scope.title', {defaultValue: 'What’s included'})}
					</h3>
					<p className='text-13 text-text-tertiary'>
						{t('backups.scope.subtitle', {
							defaultValue: 'Choose what a hardware failure should be able to bring back from one backup.',
						})}
					</p>
				</div>
			)}
			<div className='divide-y divide-white/6 rounded-12 bg-white/4'>
				{rows.map((row) => {
					const Icon = row.icon
					return (
						<div key={row.title} className='flex items-center gap-3 px-4 py-3'>
							<div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-8 bg-white/6'>
								<Icon className='h-4 w-4 text-text-secondary' />
							</div>
							<div className='min-w-0 flex-1'>
								<div className='text-13 font-medium'>{row.title}</div>
								<div className='truncate text-12 text-text-tertiary'>{row.desc}</div>
							</div>
							{row.always ? (
								<span className='shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-11 font-medium text-brand'>
									{t('backups.scope.always', {defaultValue: 'Always'})}
								</span>
							) : (
								<Switch
									className={cn(isLoading && 'opacity-50')}
									checked={row.value}
									disabled={isLoading || isSaving}
									onCheckedChange={(next) => row.onChange?.(next)}
									aria-label={row.title}
								/>
							)}
						</div>
					)
				})}
			</div>
		</div>
	)
}
