import {useState} from 'react'
import {TbDownload, TbFileText, TbFolder, TbMusic, TbPhoto, TbVideo} from 'react-icons/tb'

import {Spotlight} from '@/components/motion-primitives/spotlight'
import {Tilt} from '@/components/motion-primitives/tilt'
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
import {useIsMobile} from '@/hooks/use-is-mobile'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'

// Color-coded styles for known folders
const FOLDER_CARD_STYLES: Record<string, {bg: string; iconColor: string; icon: typeof TbFolder; spotlightColor: string}> = {
	[`${HOME_PATH}/Downloads`]: {bg: 'bg-green-50/80', iconColor: 'text-green-500', icon: TbDownload, spotlightColor: 'from-green-200/40 via-green-100/20 to-transparent'},
	[`${HOME_PATH}/Documents`]: {bg: 'bg-sky-50/80', iconColor: 'text-sky-500', icon: TbFileText, spotlightColor: 'from-sky-200/40 via-sky-100/20 to-transparent'},
	[`${HOME_PATH}/Photos`]: {bg: 'bg-pink-50/80', iconColor: 'text-pink-500', icon: TbPhoto, spotlightColor: 'from-pink-200/40 via-pink-100/20 to-transparent'},
	[`${HOME_PATH}/Videos`]: {bg: 'bg-rose-50/80', iconColor: 'text-rose-500', icon: TbVideo, spotlightColor: 'from-rose-200/40 via-rose-100/20 to-transparent'},
	[`${HOME_PATH}/Music`]: {bg: 'bg-purple-50/80', iconColor: 'text-purple-500', icon: TbMusic, spotlightColor: 'from-purple-200/40 via-purple-100/20 to-transparent'},
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
	const isMobile = useIsMobile()
	const iconSize = isMobile ? 'h-[52px] w-[52px]' : 'h-[68px] w-[68px]'

	const [isHovered, setIsHovered] = useState(false)

	const folderStyle = item.type === 'directory' ? FOLDER_CARD_STYLES[item.path] : undefined
	const isKnownFolder = !!folderStyle
	const isGenericFolder = item.type === 'directory' && !isKnownFolder

	const cardContent = (
		<div
			className={cn(
				'relative flex h-full w-full max-w-32 flex-col items-center gap-1.5 overflow-hidden text-ellipsis break-all rounded-[20px] p-3 text-center transition-all duration-200',
				isKnownFolder
					? cn(folderStyle.bg, 'border border-transparent', isHovered && 'border-black/[0.04] shadow-sm')
					: isGenericFolder
						? cn('bg-neutral-50/60', isHovered && 'bg-neutral-100/80 shadow-sm')
						: cn('bg-transparent', isHovered && 'bg-neutral-50/80 shadow-sm'),
			)}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{/* Spotlight glow follows cursor on hover */}
			{!isTouchDevice && (
				<Spotlight
					className={cn(
						'blur-2xl',
						isKnownFolder
							? folderStyle.spotlightColor
							: 'from-neutral-300/30 via-neutral-200/15 to-transparent',
					)}
					size={100}
					springOptions={{bounce: 0.1, duration: 0.1}}
				/>
			)}

			{isKnownFolder ? (
				<div className={cn('flex items-center justify-center', iconSize)}>
					<folderStyle.icon
						className={cn('h-11 w-11 transition-transform duration-300 ease-out', folderStyle.iconColor, isHovered && 'scale-110')}
						strokeWidth={1.5}
					/>
				</div>
			) : isGenericFolder ? (
				<div className={cn('flex items-center justify-center', iconSize)}>
					<TbFolder
						className={cn('h-11 w-11 transition-transform duration-300 ease-out text-neutral-400', isHovered && 'scale-110 text-neutral-500')}
						strokeWidth={1.5}
					/>
				</div>
			) : (
				<div className={cn('flex items-center justify-center', iconSize)}>
					<FileItemIcon item={item} className={iconSize} useAnimatedIcon={!isTouchDevice} isHovered={isHovered} />
				</div>
			)}
			<div className={cn('relative w-full flex-col items-center', fadedContent && 'opacity-50')}>
				{isEditingName ? (
					<EditableName item={item} view='icons' onFinish={onEditingNameComplete} />
				) : (
					<TruncatedFilename
						filename={item.name}
						view='icons'
						className='line-clamp-2 w-full text-center text-[12px] font-semibold leading-tight text-neutral-700'
					/>
				)}
				<span className='mt-0.5 w-full text-center text-[10px] font-medium text-neutral-400'>
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
				<div className='absolute inset-0 rounded-[20px] bg-white/80 backdrop-blur-sm'>
					<CircularProgress progress={uploadingProgress} />
				</div>
			)}
		</div>
	)

	// Tilt 3D effect on desktop, plain card on touch
	if (isTouchDevice) return cardContent

	return (
		<Tilt
			rotationFactor={8}
			isRevese
			springOptions={{stiffness: 300, damping: 20}}
		>
			{cardContent}
		</Tilt>
	)
}
