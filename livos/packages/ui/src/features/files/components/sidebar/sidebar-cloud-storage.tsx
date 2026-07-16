import {keepPreviousData} from '@tanstack/react-query'
import {AnimatePresence, motion} from 'framer-motion'
import {useMemo} from 'react'
import {FaPlus} from 'react-icons/fa6'
import {TbCloud} from 'react-icons/tb'
import {useNavigate as useReactRouterNavigate} from 'react-router-dom'
import {toast} from 'sonner'

import {Droppable} from '@/features/files/components/shared/drag-and-drop'
import {SidebarCloudDriveItem} from '@/features/files/components/sidebar/sidebar-cloud-drive-item'
import {CLOUD_STORAGE_PATH} from '@/features/files/constants'
import {useNavigate} from '@/features/files/hooks/use-navigate'
import {useQueryParams} from '@/hooks/use-query-params'
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger} from '@/shadcn-components/ui/context-menu'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'
import type {RouterError} from '@/trpc/trpc'
import {t} from '@/utils/i18n'
import {tw} from '@/utils/tw'

// FILES-03 (324-09, D-12) — the Cloud Drives sidebar section: a clone of
// SidebarNetworkStorage (root item + AnimatePresence mounted list + context-menu
// eject) targeting the writable /Cloud base directory and the 324-05 cloudDrive*
// procedures (cloudDriveList / cloudDriveRemove) instead of /Network + the CIFS
// network-share procedures.
export function SidebarCloudStorage() {
	const utils = trpcReact.useUtils()
	const {currentPath, navigateToDirectory} = useNavigate()

	// Live drive list with mount status (never exposes the encrypted config blob).
	const {data: drives, isLoading: isLoadingDrives} = trpcReact.system.cloudDriveList.useQuery(undefined, {
		placeholderData: keepPreviousData,
		staleTime: 15_000,
	})

	// Eject = remove the drive entirely (unmount + forget the stored config), so the
	// ~60s watch loop does not simply re-mount it (mirrors the network donor's
	// "eject" = removeHostOrShare semantics).
	const {mutateAsync: removeDrive, isPending: isRemovingDrive} = trpcReact.system.cloudDriveRemove.useMutation({
		onSuccess: (_res, {remote}) => {
			const mountPath = `${CLOUD_STORAGE_PATH}/${remote}`
			// If we're browsing the drive being ejected, fall back to the /Cloud root.
			if (currentPath.startsWith(mountPath)) navigateToDirectory(CLOUD_STORAGE_PATH)
			utils.files.list.invalidate({path: CLOUD_STORAGE_PATH})
		},
		onError: (error: RouterError) => toast.error(t('files-clouddrive.remove-error', {message: error.message})),
		onSettled: () => utils.system.cloudDriveList.invalidate(),
	})

	// Only render drives that are actually mounted into /Cloud/<remote>.
	const mounted = useMemo(() => {
		if (!drives) return []
		return drives
			.filter((d: {isMounted?: boolean}) => d.isMounted)
			.map((d: {remote: string; mountPath?: string}) => ({
				remote: d.remote,
				mountPath: d.mountPath || `${CLOUD_STORAGE_PATH}/${d.remote}`,
			}))
	}, [drives])

	return (
		<>
			{/* Permanent /Cloud root item with an "Add Cloud Drive" button */}
			<CloudRootItem />

			{/* Mounted cloud drives (if any) */}
			{!isLoadingDrives && mounted.length > 0 && (
				<AnimatePresence initial={false}>
					{mounted.map(({remote, mountPath}: {remote: string; mountPath: string}) => (
						<motion.div
							key={`sidebar-cloud-${remote}`}
							initial={{opacity: 0, height: 0}}
							animate={{opacity: 1, height: 'auto'}}
							exit={{opacity: 0, height: 0}}
							transition={{duration: 0.2}}
						>
							<ContextMenu>
								<ContextMenuTrigger asChild>
									<div>
										<SidebarCloudDriveItem
											remote={remote}
											rootPath={mountPath}
											onEject={() => removeDrive({remote})}
											disabled={isRemovingDrive}
										/>
									</div>
								</ContextMenuTrigger>
								<ContextMenuContent>
									<ContextMenuItem disabled={isRemovingDrive} onClick={() => removeDrive({remote})}>
										{t('files-clouddrive.remove')}
									</ContextMenuItem>
								</ContextMenuContent>
							</ContextMenu>
						</motion.div>
					))}
				</AnimatePresence>
			)}
		</>
	)
}

/* ------------------------------------------------------------------
 * Always rendered /Cloud root item with an "Add Cloud Drive" button
 * ---------------------------------------------------------------- */
const selectedClass = tw`
  bg-gradient-to-b from-surface-base to-surface-1
  border-border-subtle
  shadow-button-highlight-soft-hpx
`

function CloudRootItem() {
	const {navigateToDirectory, currentPath} = useNavigate()
	const isActive = currentPath === CLOUD_STORAGE_PATH
	const navigate = useReactRouterNavigate()
	const {addLinkSearchParams} = useQueryParams()

	return (
		<Droppable
			id={`sidebar-${CLOUD_STORAGE_PATH}`}
			path={CLOUD_STORAGE_PATH}
			onClick={() => navigateToDirectory(CLOUD_STORAGE_PATH)}
			className='group flex items-stretch gap-0.5 rounded-lg text-12'
			role='button'
		>
			<div
				className={cn(
					'flex flex-1 items-center gap-1.5 rounded-l-lg border border-r-0 border-transparent from-surface-base to-surface-1 px-2 py-1.5 group-hover:bg-gradient-to-b',
					isActive ? selectedClass : 'text-text-secondary transition-colors group-hover:bg-surface-1 group-hover:text-text-primary',
				)}
			>
				<TbCloud aria-hidden className='h-5 w-auto flex-shrink-0' />
				<span className='min-w-0 overflow-hidden text-ellipsis whitespace-nowrap'>
					{t('files-clouddrive.sidebar-label')}
				</span>
			</div>
			<div
				className={cn(
					'group/plus flex items-center justify-center rounded-r-lg border border-l-0 border-transparent from-surface-base to-surface-1 px-2 py-1.5 group-hover:bg-gradient-to-b',
					isActive ? selectedClass : 'transition-colors group-hover:bg-surface-1',
				)}
				onClick={(e) => {
					// prevent navigating into /Cloud
					e.stopPropagation()
					// open the guided add-cloud-drive authorize wizard
					navigate({search: addLinkSearchParams({dialog: 'files-clouddrive'})})
				}}
			>
				<button className='flex items-center justify-center text-text-secondary transition-colors group-hover/plus:text-text-primary'>
					<FaPlus className='size-3' strokeWidth={5} />
				</button>
			</div>
		</Droppable>
	)
}
