import {TbStack2} from 'react-icons/tb'

import {Droppable} from '@/features/files/components/shared/drag-and-drop'
import {POOL_PATH} from '@/features/files/constants'
import {useNavigate} from '@/features/files/hooks/use-navigate'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'
import {tw} from '@/utils/tw'

// POOL-02 (318-10, D-12) — the Files sidebar `/Pool` entry: a MINIMAL single nav
// item (no drives list, no eject) targeting the writable `/Pool` base directory the
// storage-pool (mergerfs union) is surfaced under. It is a leaner sibling of
// SidebarCloudStorage's root item. The UI only ever knows the virtual `/Pool` path —
// the raw host mountpoint is never referenced client-side (D-12 guard).
//
// Render-on-live gate: the item renders ONLY when `files.list({path: '/Pool'})`
// succeeds — i.e. a pool exists and its base dir is registered (318-10 backend
// hook). On error/loading it renders null (graceful no-pool state: no dead sidebar
// entry). This is DELIBERATELY gated off files.list, NOT storagePool.poolStatus, so
// the sidebar stays independent of the 318-06 storagePool router (W3-parallel).
// retry:false so an absent-pool error (`[invalid-base]`/ENOENT) resolves to null
// immediately rather than after backoff.
const selectedClass = tw`
  bg-gradient-to-b from-surface-base to-surface-1
  border-border-subtle
  shadow-button-highlight-soft-hpx
`

export function SidebarPool() {
	const {isSuccess} = trpcReact.files.list.useQuery(
		{path: POOL_PATH},
		{retry: false, refetchOnWindowFocus: false, staleTime: 15_000},
	)
	const {navigateToDirectory, currentPath} = useNavigate()
	const isActive = currentPath === POOL_PATH

	// Graceful no-pool state: nothing rendered until /Pool lists successfully.
	if (!isSuccess) return null

	return (
		<Droppable
			id={`sidebar-${POOL_PATH}`}
			path={POOL_PATH}
			onClick={() => navigateToDirectory(POOL_PATH)}
			className='group flex items-stretch gap-0.5 rounded-lg text-12'
			role='button'
		>
			<div
				className={cn(
					'flex flex-1 items-center gap-1.5 rounded-lg border border-transparent from-surface-base to-surface-1 px-2 py-1.5 group-hover:bg-gradient-to-b',
					isActive
						? selectedClass
						: 'text-text-secondary transition-colors group-hover:bg-surface-1 group-hover:text-text-primary',
				)}
			>
				<TbStack2 aria-hidden className='h-5 w-auto flex-shrink-0' />
				<span className='min-w-0 overflow-hidden text-ellipsis whitespace-nowrap'>{t('files-sidebar.pool')}</span>
			</div>
		</Droppable>
	)
}
