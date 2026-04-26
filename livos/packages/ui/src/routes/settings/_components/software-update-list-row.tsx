import {useState} from 'react'
import {RiArrowUpCircleFill, RiCheckboxCircleFill, RiInformationLine, RiRefreshLine} from 'react-icons/ri'

import {Icon} from '@/components/ui/icon'
import {IconButton} from '@/components/ui/icon-button'
import {UpdateConfirmModal} from '@/components/update-confirm-modal'
import {LOADING_DASH} from '@/constants'
import {useSoftwareUpdate} from '@/hooks/use-software-update'
import {Button} from '@/shadcn-components/ui/button'
import {t} from '@/utils/i18n'

import {ListRow} from './list-row'

export function SoftwareUpdateListRow({isActive}: {isActive: boolean}) {
	const {state, currentVersion, latestVersion, checkLatest} = useSoftwareUpdate()
	const [confirmOpen, setConfirmOpen] = useState(false)

	if (state === 'update-available') {
		return (
			<>
				<ListRow
					isActive={isActive}
					title={currentVersion?.version
					? `LivOS ${currentVersion.version}`
					: currentVersion?.name || `LivOS ${LOADING_DASH}`}
					description={
						<span className='flex items-center gap-1 pb-3'>
							<Icon component={RiArrowUpCircleFill} className='text-brand' />
							{t('software-update.new-version', {name: latestVersion?.version || latestVersion?.shortSha || LOADING_DASH})}
						</span>
					}
				>
					<IconButton icon={RiInformationLine} variant='primary' onClick={() => setConfirmOpen(true)}>
						{t('software-update.view')}
					</IconButton>
				</ListRow>
				<UpdateConfirmModal
					open={confirmOpen}
					onOpenChange={setConfirmOpen}
					latestVersion={latestVersion ?? null}
				/>
			</>
		)
	}

	return (
		<ListRow
			isActive={isActive}
			title={currentVersion?.version
					? `LivOS ${currentVersion.version}`
					: currentVersion?.name || `LivOS ${LOADING_DASH}`}
			description={
				<span className='flex items-center gap-1 pb-3'>
					{state === 'at-latest' || state === 'checking' ? (
						<>
							<Icon component={RiCheckboxCircleFill} className='text-success' />
							{t('software-update.on-latest')}
						</>
					) : (
						<>
							{/* Invisible icon to prevent layout shift */}
							{t('check-for-latest-version')}
							<Icon component={RiArrowUpCircleFill} className='invisible' />
						</>
					)}
				</span>
			}
		>
			<Button onClick={checkLatest}>
				<Icon component={RiRefreshLine} className={state === 'checking' ? 'animate-spin' : undefined} />
				{state === 'checking' ? t('software-update.checking') : t('software-update.check')}
			</Button>
		</ListRow>
	)
}
