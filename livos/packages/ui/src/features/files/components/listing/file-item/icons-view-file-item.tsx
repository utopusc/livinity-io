import {useState} from 'react'
import {TbDownload, TbFileText, TbFolder, TbMusic, TbPhoto, TbVideo} from 'react-icons/tb'

import {CircularProgress} from '@/features/files/components/listing/file-item/circular-progress'
import {EditableName} from '@/features/files/components/listing/file-item/editable-name'
import {TruncatedFilename} from '@/features/files/components/listing/file-item/truncated-filename'
import {FileItemIcon} from '@/features/files/components/shared/file-item-icon'
import {HOME_PATH} from '@/features/files/constants'
import {useIsTouchDevice} from '@/features/files/hooks/use-is-touch-device'
import type {FileSystemItem} from '@/features/files/types'
import {formatFilesystemSize} from '@/features/files/utils/format-filesystem-size'
import {isDirectoryANetworkDevice} from '@/features/files/utils/is-directory-a-network-device-or-share'
import {isDirectoryAnExternalDrivePartition} from '@/features/files/utils/is-directory-an-external-drive-partition'
import {isDirectoryALivinityBackup} from '@/features/files/utils/is-directory-a-livinity-backup'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'

// Color-coded backgrounds for known folders
const FOLDER_CARD_STYLES: Record<string, {bg: string; iconColor: string; icon: typeof TbFolder}> = {
	[`${HOME_PATH}/Downloads`]: {bg: 'bg-green-50 hover:bg-green-100/80', iconColor: 'text-green-500', icon: TbDownload},
	[`${HOME_PATH}/Documents`]: {bg: 'bg-sky-50 hover:bg-sky-100/80', iconColor: 'text-sky-500', icon: TbFileText},
	[`${HOME_PATH}/Photos`]: {bg: 'bg-pink-50 hover:bg-pink-100/80', iconColor: 'text-pink-500', icon: TbPhoto},
	[`${HOME_PATH}/Videos`]: {bg: 'bg-rose-50 hover:bg-rose-100/80', iconColor: 'text-rose-500', icon: TbVideo},
	[`${HOME_PATH}/Music`]: {bg: 'bg-purple-50 hover:bg-purple-100/80', iconColor: 'text-purple-500', icon: TbMusic},
}

interface IconsViewFileItemProps {
	item: FileSystemItem
	isEditingName: boolean
	onEditingNameComplete: () => void
	fadedContent?: boolean
}

export const IconsViewFileItem = ({
	item,
	isEditingName,
	onEditingNameComplete,
	fadedContent,
}: IconsViewFileItemProps) => {
	const isUploading = 'isUploading' in item && item.isUploading
	const uploadingProgress = isUploading && 'progress' in item ? item.progress : 0
	const isTouchDevice = useIsTouchDevice()

	const [isHovered, setIsHovered] = useState(false)

	const folderStyle = item.type === 'directory' ? FOLDER_CARD_STYLES[item.path] : undefined
	const isKnownFolder = !!folderStyle

	return (
		<div
			className={cn(
				'relative flex h-full w-32 flex-col items-center gap-1 overflow-hidden text-ellipsis break-all rounded-2xl p-2.5 text-center transition-all duration-200',
				isKnownFolder
					? folderStyle.bg
					: 'hover:bg-neutral-50',
			)}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{isKnownFolder ? (
				<div className='flex h-[72px] w-[72px] items-center justify-center'>
					<folderStyle.icon className={cn('h-12 w-12 transition-transform duration-200', folderStyle.iconColor, isHovered && 'scale-110')} strokeWidth={1.5} />
				</div>
			) : (
				<div className='flex justify-center'>
					<FileItemIcon item={item} className='h-[72px] w-[72px]' useAnimatedIcon={!isTouchDevice} isHovered={isHovered} />
				</div>
			)}
			<div className={cn('relative w-full flex-col items-center', fadedContent && 'opacity-50')}>
				{isEditingName ? (
					<EditableName item={item} view='icons' onFinish={onEditingNameComplete} />
				) : (
					<TruncatedFilename
						filename={item.name}
						view='icons'
						className='mt-0.5 line-clamp-2 w-full text-center text-[12px] font-medium leading-tight text-neutral-800'
					/>
				)}
				<span className='w-full text-center text-[11px] text-neutral-400'>
					{isUploading
						? uploadingProgress === 0
							? t('files-state.waiting')
							: `${uploadingProgress}%`
						: item.type === 'directory'
							? isDirectoryAnExternalDrivePartition(item.path)
								? t('files-type.external-drive')
								: isDirectoryANetworkDevice(item.path)
									? t('files-type.network-drive')
									: isDirectoryALivinityBackup(item.name)
										? t('files-type.livinity-backup')
										: t('files-type.directory')
							: formatFilesystemSize(item.size)}
				</span>
			</div>

			{!!isUploading && (
				<div className='absolute inset-0 rounded-2xl bg-white/80 backdrop-blur-sm'>
					<CircularProgress progress={uploadingProgress} />
				</div>
			)}
		</div>
	)
}
