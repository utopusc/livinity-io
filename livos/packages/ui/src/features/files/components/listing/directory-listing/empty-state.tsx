import {useRef} from 'react'
import {TbCloudOff, TbFolder, TbFolderPlus, TbSearch, TbUpload} from 'react-icons/tb'

import {AnimatedGroup} from '@/components/motion-primitives/animated-group'
import {IconButton} from '@/components/ui/icon-button'
import {UploadInput} from '@/features/files/components/shared/upload-input'
import {useNavigate} from '@/features/files/hooks/use-navigate'
import {useNetworkStorage} from '@/features/files/hooks/use-network-storage'
import {useNewFolder} from '@/features/files/hooks/use-new-folder'
import {useIsFilesReadOnly} from '@/features/files/providers/files-capabilities-context'
import {t} from '@/utils/i18n'

export function EmptyStateDirectory() {
	const {currentPath, isViewingNetworkShares} = useNavigate()
	const {doesHostHaveMountedShares} = useNetworkStorage()
	const {startNewFolder} = useNewFolder()
	const isReadOnly = useIsFilesReadOnly()
	const uploadInputRef = useRef<HTMLInputElement | null>(null)

	const handleUploadClick = () => {
		uploadInputRef.current?.click()
	}

	const isOfflineNetworkHost = isViewingNetworkShares && !doesHostHaveMountedShares?.(currentPath)

	return (
		<div className='flex h-full flex-col items-center justify-center gap-5 p-8 pt-0 text-center'>
			<AnimatedGroup preset='blur-slide' className='flex flex-col items-center gap-4'>
				{/* Icon */}
				<div className='flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100/80'>
					{isOfflineNetworkHost ? (
						<TbCloudOff className='h-8 w-8 text-neutral-400' strokeWidth={1.5} />
					) : (
						<TbFolder className='h-8 w-8 text-neutral-400' strokeWidth={1.5} />
					)}
				</div>

				{/* Text */}
				<div className='max-w-[240px]'>
					<p className='text-[13px] font-medium text-neutral-500'>
						{isOfflineNetworkHost ? t('files-empty.network-host-offline') : t('files-empty.directory')}
					</p>
				</div>

				{/* Action buttons */}
				{!isViewingNetworkShares && !isReadOnly && (
					<div className='flex items-center gap-2'>
						<IconButton icon={TbUpload} variant='primary' onClick={handleUploadClick}>
							{t('files-action.upload')}
						</IconButton>
						<IconButton icon={TbFolderPlus} onClick={startNewFolder}>
							{t('files-folder')}
						</IconButton>
						<UploadInput ref={uploadInputRef} />
					</div>
				)}
			</AnimatedGroup>
		</div>
	)
}

export function EmptyStateNetwork() {
	return (
		<div className='flex h-full items-center justify-center p-8 pt-0 text-center'>
			<AnimatedGroup preset='blur-slide' className='flex flex-col items-center gap-4'>
				<div className='flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100/80'>
					<TbCloudOff className='h-8 w-8 text-neutral-400' strokeWidth={1.5} />
				</div>
				<p className='text-[13px] font-medium text-neutral-500'>{t('files-empty.network')}</p>
			</AnimatedGroup>
		</div>
	)
}

export function EmptyStateSearch() {
	return (
		<div className='flex h-full items-center justify-center p-8 pt-0 text-center'>
			<AnimatedGroup preset='blur-slide' className='flex flex-col items-center gap-4'>
				<div className='flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100/80'>
					<TbSearch className='h-8 w-8 text-neutral-400' strokeWidth={1.5} />
				</div>
				<p className='text-[13px] font-medium text-neutral-500'>{t('files-empty.no-results')}</p>
			</AnimatedGroup>
		</div>
	)
}
