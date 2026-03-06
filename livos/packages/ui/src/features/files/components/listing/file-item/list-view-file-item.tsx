import '@/features/files/components/listing/file-item/list-view-file-item.css'

import {TbDownload, TbFileText, TbFolder, TbMusic, TbPhoto, TbVideo} from 'react-icons/tb'

import {EditableName} from '@/features/files/components/listing/file-item/editable-name'
import {TruncatedFilename} from '@/features/files/components/listing/file-item/truncated-filename'
import {FileItemIcon} from '@/features/files/components/shared/file-item-icon'
import {FILE_TYPE_MAP, HOME_PATH} from '@/features/files/constants'
import type {FileSystemItem} from '@/features/files/types'
import {formatFilesystemDate} from '@/features/files/utils/format-filesystem-date'
import {formatFilesystemSize} from '@/features/files/utils/format-filesystem-size'
import {isDirectoryANetworkDevice} from '@/features/files/utils/is-directory-a-network-device-or-share'
import {isDirectoryAnExternalDrivePartition} from '@/features/files/utils/is-directory-an-external-drive-partition'
import {isDirectoryALivinityBackup} from '@/features/files/utils/is-directory-a-livinity-backup'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {useLanguage} from '@/hooks/use-language'
import {Progress} from '@/shadcn-components/ui/progress'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'

const LIST_FOLDER_ICONS: Record<string, {icon: typeof TbFolder; bg: string; color: string}> = {
	[`${HOME_PATH}/Downloads`]: {icon: TbDownload, bg: 'bg-green-100', color: 'text-green-600'},
	[`${HOME_PATH}/Documents`]: {icon: TbFileText, bg: 'bg-sky-100', color: 'text-sky-600'},
	[`${HOME_PATH}/Photos`]: {icon: TbPhoto, bg: 'bg-pink-100', color: 'text-pink-600'},
	[`${HOME_PATH}/Videos`]: {icon: TbVideo, bg: 'bg-rose-100', color: 'text-rose-600'},
	[`${HOME_PATH}/Music`]: {icon: TbMusic, bg: 'bg-purple-100', color: 'text-purple-600'},
}
const DEFAULT_FOLDER_STYLE = {icon: TbFolder, bg: 'bg-neutral-100', color: 'text-neutral-500'}

function FolderListIcon({item, size}: {item: FileSystemItem; size: 'sm' | 'md'}) {
	const style = LIST_FOLDER_ICONS[item.path] || DEFAULT_FOLDER_STYLE
	const Icon = style.icon
	const containerSize = size === 'md' ? 'h-8 w-8' : 'h-6 w-6'
	const iconSize = size === 'md' ? 'h-4.5 w-4.5' : 'h-3.5 w-3.5'
	return (
		<div className={cn(`flex shrink-0 items-center justify-center rounded-lg ${containerSize}`, style.bg)}>
			<Icon className={cn(iconSize, style.color)} strokeWidth={2} />
		</div>
	)
}

interface ListViewFileItemProps {
	item: FileSystemItem
	isEditingName: boolean
	onEditingNameComplete: () => void
	fadedContent?: boolean
}

export function ListViewFileItem({item, isEditingName, onEditingNameComplete, fadedContent}: ListViewFileItemProps) {
	const isUploading = 'isUploading' in item && item.isUploading
	const uploadingProgress = isUploading && 'progress' in item ? item.progress : 0

	const isMobile = useIsMobile()
	const [languageCode] = useLanguage()

	// Get the file type name from the translation key
	const fileType = item.type ? FILE_TYPE_MAP[item.type as keyof typeof FILE_TYPE_MAP]?.nameTKey : ''
	const translatedFileType = fileType ? t(fileType) : item.type

	// Mobile view
	if (isMobile) {
		return (
			<div className={cn('flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5', isUploading && 'opacity-70')}>
				<div className='flex-shrink-0'>
					{item.type === 'directory' ? <FolderListIcon item={item} size='md' /> : <FileItemIcon item={item} className='h-8 w-8' />}
				</div>
				<div className={cn('flex flex-1 items-center justify-between overflow-hidden', fadedContent && 'opacity-50')}>
					<div className='flex min-w-0 flex-1 flex-col overflow-hidden'>
						{isEditingName ? (
							<EditableName item={item} view='list' onFinish={onEditingNameComplete} />
						) : (
							<TruncatedFilename
								filename={item.name}
								view='list'
								className='min-w-0 overflow-hidden text-ellipsis whitespace-nowrap pr-2 font-medium text-caption'
							/>
						)}
						<span className='min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-caption-sm text-text-tertiary'>
							{isUploading
								? uploadingProgress === 0
									? t('files-state.waiting')
									: `${t('files-state.uploading')} ${uploadingProgress}%`
								: formatFilesystemDate(item.modified, languageCode)}
						</span>
					</div>
					<span className='shrink-0 whitespace-nowrap pl-2 text-right text-caption-sm text-text-tertiary'>
						{item.type === 'directory'
							? isDirectoryAnExternalDrivePartition(item.path)
								? t('files-type.external-drive')
								: isDirectoryANetworkDevice(item.path)
									? t('files-type.network-drive')
									: isDirectoryALivinityBackup(item.name)
										? t('files-type.livinity-backup')
										: t('files-type.directory')
							: formatFilesystemSize(item.size ?? null)}
					</span>
				</div>
			</div>
		)
	}

	// Desktop view
	const tableStyles = 'text-[13px] px-3 py-2.5 whitespace-nowrap overflow-hidden text-ellipsis'

	return (
		<div className={cn('flex items-center rounded-lg transition-colors duration-100', isUploading && 'opacity-70')}>
			<div className={`flex-[5] ${tableStyles}`}>
				<div className='flex items-center gap-2.5'>
					<div className='flex-shrink-0'>
						{item.type === 'directory' ? <FolderListIcon item={item} size='sm' /> : <FileItemIcon item={item} className='h-6 w-6' />}
					</div>
					<div className={cn(fadedContent && 'opacity-50')}>
						{isEditingName ? (
							<EditableName item={item} view='list' onFinish={onEditingNameComplete} />
						) : (
							<TruncatedFilename filename={item.name} view='list' className='min-w-0 text-caption' />
						)}
					</div>
				</div>
			</div>

			<div className={cn(`flex-[2] ${tableStyles} text-text-tertiary`, fadedContent && 'opacity-50')}>
				{isUploading ? <Progress value={uploadingProgress} /> : formatFilesystemDate(item.modified, languageCode)}
			</div>

			<div className={cn(`flex-1 ${tableStyles} text-text-tertiary`, fadedContent && 'opacity-50')}>
				{isUploading
					? `${formatFilesystemSize(
							((item.size ?? 0) * (uploadingProgress ?? 0)) / 100,
						)} / ${formatFilesystemSize(item.size ?? null)}`
					: formatFilesystemSize(item.size ?? null)}
			</div>

			{/* TODO: Add this back in when we have a file system index in livinityd. The name header was previously flex-[3] */}
			{/* <div className={`flex-[2] lg:hidden xl:flex ${tableStyles} text-text-secondary`}>
				{isUploading ? `${formatFilesystemSize(item.speed ?? 0)}/s` : formatFilesystemDate(item.created, languageCode)}
			</div> */}

			<div className={cn(`flex-[2] ${tableStyles} text-text-tertiary`, fadedContent && 'opacity-50')}>
				{isUploading
					? uploadingProgress !== 0
						? t('files-state.uploading')
						: t('files-state.waiting')
					: item.type === 'directory' && isDirectoryAnExternalDrivePartition(item.path)
						? t('files-type.external-drive')
						: isDirectoryANetworkDevice(item.path)
							? t('files-type.network-drive')
							: isDirectoryALivinityBackup(item.name)
								? t('files-type.livinity-backup')
								: translatedFileType}
			</div>
		</div>
	)
}
