// Phase 26 Plan 26-02 (DOC-09 + DOC-20 partial) — Docker Volumes section.
// Replaces the Phase 24 placeholder. Body extracted from
// routes/server-control/index.tsx VolumesTab() (lines 2265-2436) with:
//   1. Search input (NEW — phase success criterion 6, filters by volume name).
//   2. Per-row "Schedule backup" link button — sets DockerSection to
//      'schedules' via useSetDockerSection. The actual backup-job-create
//      flow lands in Phase 27 (DOC-12 scheduler) which owns the Schedules
//      section content. This plan ships the navigation seam only.
//      Phase 27 will read useSelectedVolume() in the Schedules section to
//      pre-fill the backup-job form — the contract is documented inline so
//      a future planner doesn't lose the thread.
//   3. expandedVolume state migrated to useDockerResource.selectedVolume
//      zustand store so external surfaces can deep-link (DOC-20 partial).
//   4. Wrapped in flex h-full overflow-y-auto p-4 sm:p-6.

import {Fragment, useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {
	IconCalendarTime,
	IconChevronDown,
	IconChevronRight,
	IconFolder,
	IconLink,
	IconPlus,
	IconRefresh,
	IconSearch,
	IconTrash,
} from '@tabler/icons-react'
import {toast} from 'sonner'

import {useVolumes} from '@/hooks/use-volumes'
import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/shadcn-components/ui/table'
import {cn} from '@/shadcn-lib/utils'

import {copyDeepLinkToClipboard} from '../deep-link'
import {useDockerResource, useSelectedVolume} from '../resource-store'
import {useSetDockerSection} from '../store'
import {ActionButton} from './action-button'
import {filterByQuery} from './filter-rows'
import {CreateVolumeDialog, RemoveVolumeDialog} from './volume-dialogs'
import {VolumeUsagePanel} from './volume-usage-panel'

export function VolumeSection() {
	const {
		volumes,
		isLoading,
		isError,
		error,
		isFetching,
		refetch,
		removeVolume,
		isRemoving,
		createVolume,
		isCreatingVolume,
		actionResult,
		totalCount,
	} = useVolumes()

	const expandedVolume = useSelectedVolume()
	const setExpandedVolume = useDockerResource((s) => s.setSelectedVolume)
	const setSection = useSetDockerSection()

	const [searchQuery, setSearchQuery] = useState('')
	const [removeTarget, setRemoveTarget] = useState<string | null>(null)
	const [showCreateDialog, setShowCreateDialog] = useState(false)

	const filteredVolumes = filterByQuery(volumes, searchQuery, (v) => v.name)
	const isFiltered = searchQuery.trim().length > 0
	const noFilterResults = isFiltered && filteredVolumes.length === 0 && volumes.length > 0

	const onScheduleBackup = (volumeName: string) => {
		// Phase 27 (DOC-12) will read useSelectedVolume() in the Schedules
		// section to pre-fill the backup-job-create form. This plan only
		// ships the navigation seam — flipping the section AND keeping the
		// selectedVolume slot set so the consumer can read it.
		setExpandedVolume(volumeName)
		setSection('schedules')
	}

	return (
		<div className='flex h-full flex-col overflow-y-auto p-4 sm:p-6'>
			{/* Search + summary + Create + Refresh row */}
			<div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
				<div className='relative w-full max-w-xs'>
					<IconSearch size={14} className='absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary' />
					<Input
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder='Search volumes…'
						className='pl-8'
						maxLength={200}
					/>
				</div>
				<div className='flex flex-wrap items-center gap-2 text-sm text-text-secondary'>
					<span>
						<span className='font-medium text-text-primary'>{totalCount}</span>
						<span className='ml-1'>volumes</span>
					</span>
					<Button variant='default' size='sm' onClick={() => setShowCreateDialog(true)} disabled={isCreatingVolume}>
						<IconPlus size={14} className='mr-1.5' />
						{isCreatingVolume ? 'Creating...' : 'Create Volume'}
					</Button>
					<button
						onClick={() => refetch()}
						disabled={isFetching}
						className='flex items-center gap-2 rounded-lg bg-surface-1 px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50'
					>
						<IconRefresh size={14} className={isFetching ? 'animate-spin' : ''} />
						Refresh
					</button>
				</div>
			</div>

			{/* Action Result Toast */}
			<AnimatePresence>
				{actionResult && (
					<motion.div
						initial={{opacity: 0, y: -10}}
						animate={{opacity: 1, y: 0}}
						exit={{opacity: 0, y: -10}}
						className={cn(
							'mb-4 rounded-lg px-4 py-3 text-sm font-medium',
							actionResult.type === 'success'
								? 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30'
								: 'bg-red-500/20 text-red-600 border border-red-500/30',
						)}
					>
						{actionResult.message}
					</motion.div>
				)}
			</AnimatePresence>

			{/* Volumes Table */}
			{isLoading ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconRefresh size={24} className='mx-auto mb-3 animate-spin text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>Loading volumes...</p>
				</div>
			) : isError ? (
				<div className='rounded-xl border border-red-500/20 bg-red-500/10 p-8 text-center'>
					<IconFolder size={24} className='mx-auto mb-3 text-red-400' />
					<p className='text-sm text-red-400'>Failed to load volumes</p>
					<p className='mt-1 text-xs text-red-400/60'>{error?.message}</p>
				</div>
			) : !volumes.length ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconFolder size={32} className='mx-auto mb-3 text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>No Docker volumes found</p>
				</div>
			) : noFilterResults ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconSearch size={28} className='mx-auto mb-3 text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>
						No volumes match "<span className='font-mono'>{searchQuery}</span>"
					</p>
				</div>
			) : (
				<div className='overflow-x-auto'>
					<div className='rounded-xl border border-border-default bg-surface-base overflow-hidden'>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className='pl-4'>Name</TableHead>
									<TableHead>Driver</TableHead>
									<TableHead>Mount Point</TableHead>
									<TableHead className='text-right pr-4'>Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredVolumes.map((volume) => {
									const isExpanded = expandedVolume === volume.name
									return (
										<Fragment key={volume.name}>
											<TableRow>
												<TableCell className='pl-4'>
													<div className='flex items-center gap-2'>
														<button
															onClick={() => setExpandedVolume(isExpanded ? null : volume.name)}
															className='shrink-0 text-text-tertiary hover:text-text-primary transition-colors'
														>
															{isExpanded
																? <IconChevronDown size={14} />
																: <IconChevronRight size={14} />
															}
														</button>
														<span className='font-mono text-sm font-medium'>{volume.name}</span>
													</div>
												</TableCell>
												<TableCell>
													<span className='text-sm text-text-secondary'>{volume.driver}</span>
												</TableCell>
												<TableCell>
													<span className='truncate font-mono text-xs text-text-secondary' title={volume.mountpoint}>
														{volume.mountpoint}
													</span>
												</TableCell>
												<TableCell className='text-right pr-4'>
													<div className='flex items-center justify-end gap-0.5'>
														<ActionButton
															icon={IconLink}
															onClick={() =>
																copyDeepLinkToClipboard({section: 'volumes', id: volume.name}).then(
																	() => toast.success('Deep link copied'),
																	() => toast.error('Could not copy to clipboard'),
																)
															}
															color='blue'
															title='Copy deep link to this volume'
														/>
														<ActionButton
															icon={IconCalendarTime}
															onClick={() => onScheduleBackup(volume.name)}
															color='blue'
															title='Schedule backup'
														/>
														<ActionButton
															icon={IconTrash}
															onClick={() => setRemoveTarget(volume.name)}
															disabled={isRemoving}
															color='red'
															title='Remove volume'
														/>
													</div>
												</TableCell>
											</TableRow>
											{isExpanded && (
												<TableRow>
													<TableCell colSpan={4} className='p-0 bg-surface-1/50'>
														<VolumeUsagePanel volumeName={volume.name} />
													</TableCell>
												</TableRow>
											)}
										</Fragment>
									)
								})}
							</TableBody>
						</Table>
					</div>
				</div>
			)}

			{/* Remove Volume Dialog */}
			{removeTarget && (
				<RemoveVolumeDialog
					volumeName={removeTarget}
					open={!!removeTarget}
					onOpenChange={(open) => {
						if (!open) setRemoveTarget(null)
					}}
					onConfirm={(confirmName) => {
						removeVolume(removeTarget, confirmName)
						setRemoveTarget(null)
					}}
					isRemoving={isRemoving}
				/>
			)}

			{/* Create Volume Dialog */}
			<CreateVolumeDialog
				open={showCreateDialog}
				onOpenChange={setShowCreateDialog}
				onConfirm={(input) => createVolume(input)}
				isCreating={isCreatingVolume}
			/>
		</div>
	)
}
