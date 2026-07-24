import {useNavigate} from 'react-router-dom'

import {CmdkSearchProviderProps} from '@/components/cmdk-providers'
import {TbDatabase} from 'react-icons/tb'
import {useBackups} from '@/features/backups/hooks/use-backups'
import {CommandItem} from '@/shadcn-components/ui/command'
import {t} from '@/utils/i18n'

export const BackupsCmdkSearchProvider: React.FC<CmdkSearchProviderProps> = ({close}) => {
	const navigate = useNavigate()
	const {repositories} = useBackups()

	// Phase 368.5 BKP-16: route on USER repositories only — the safety repo
	// must not steer ⌘K away from the setup (add-a-destination) flow.
	const hasExistingRepositories = (repositories ?? []).some((repo) => repo.isSafety !== true)

	// Navigate to the appropriate route based on whether repositories exist
	const handleSelect = () => {
		const route = hasExistingRepositories ? '/settings/backups/configure' : '/settings/backups/setup'
		navigate(route, {preventScrollReset: true})
		close()
	}

	// Render the appropriate command item
	return (
		<CommandItem
			icon={<TbDatabase aria-label='Backups' className='size-full' />}
			value='backup-settings'
			onSelect={handleSelect}
		>
			<span>
				{t('backups')}{' '}
				<span className='opacity-50'>
					{t('generic-in')} {t('settings')}
				</span>
			</span>
		</CommandItem>
	)
}
