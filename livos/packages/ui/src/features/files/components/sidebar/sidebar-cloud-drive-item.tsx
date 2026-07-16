import {FaEject} from 'react-icons/fa6'

import {Droppable} from '@/features/files/components/shared/drag-and-drop'
import {FileItemIcon} from '@/features/files/components/shared/file-item-icon'
import {useNavigate} from '@/features/files/hooks/use-navigate'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'
import {tw} from '@/utils/tw'

const selectedClass = tw`
  bg-gradient-to-b from-surface-base to-surface-1
  border-border-subtle
  shadow-button-highlight-soft-hpx
`

export interface SidebarCloudDriveItemProps {
	// The user-facing drive name (the rclone remote).
	remote: string
	// The mount path, e.g. /Cloud/<remote>.
	rootPath: string
	onEject: () => Promise<void> | void
	disabled?: boolean
}

// A single mounted cloud drive in the sidebar (clone of sidebar-network-share-item,
// targeting a /Cloud/<remote> rclone FUSE mount instead of a /Network/<host> CIFS mount).
export function SidebarCloudDriveItem({remote, rootPath, onEject, disabled}: SidebarCloudDriveItemProps) {
	const {navigateToDirectory, currentPath} = useNavigate()
	const isActive = currentPath.startsWith(rootPath)

	return (
		<Droppable
			id={`sidebar-${rootPath}`}
			path={rootPath}
			onClick={() => navigateToDirectory(rootPath)}
			className={cn(
				'flex items-center gap-1.5 rounded-lg border border-transparent from-surface-base to-surface-1 px-2 py-1.5 text-12 hover:bg-gradient-to-b',
				isActive ? selectedClass : 'text-text-secondary transition-colors hover:bg-surface-1 hover:text-text-primary',
			)}
			role='button'
		>
			<FileItemIcon
				item={{path: rootPath, type: 'directory', operations: [], size: 0, modified: 0, name: remote}}
				className='h-5 w-5 flex-shrink-0'
			/>
			<span className='min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap'>{remote}</span>

			{/* Eject button — removes (unmounts + forgets) the cloud drive */}
			<button
				onClick={(e) => {
					// prevent navigating into /Cloud/<remote>
					e.stopPropagation()
					onEject()
				}}
				aria-label={t('files-clouddrive.eject')}
				disabled={disabled}
				className={cn(disabled ? 'cursor-not-allowed opacity-50' : 'hover:text-text-primary')}
			>
				<FaEject className='text-text-secondary' />
			</button>
		</Droppable>
	)
}
