// Phase 26 Plan 26-01 (DOC-07 + DOC-20 partial) — Docker Containers section.
// Replaces the Phase 24 placeholder. Body extracted from
// routes/server-control/index.tsx <TabsContent value='containers'>
// (lines 4348-4740) with three additions:
//   1. Search input (NEW — phase success criterion 6).
//   2. selectedContainer state migrated to useDockerResource zustand
//      store so external surfaces can deep-link (DOC-20 partial).
//   3. Wrapped in flex h-full overflow-y-auto p-4 sm:p-6 wrapper.
// The legacy file is NOT modified (Phase 27 deletes it whole).
//
// State that previously lived on the ServerControl() top-level (removeTarget,
// selectedContainer, showCreateForm, editTarget, duplicateTarget, renameTarget,
// selectedContainers, bulkRemoveOpen) is now LOCAL to this component — no
// prop drilling. selectedContainer is the lone exception, hoisted to the
// useDockerResource store for external programmatic access.
//
// Cross-imports: ContainerCreateForm + ContainerDetailSheet still live in
// routes/server-control/* (Plan 27 will relocate).

import {useCallback, useEffect, useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {
	IconBox,
	IconCopy,
	IconHandStop,
	IconLock,
	IconPencil,
	IconPlayerPause,
	IconPlayerPlay,
	IconPlayerStop,
	IconPlus,
	IconRefresh,
	IconRotateClockwise,
	IconSearch,
	IconServer,
	IconTag,
	IconTrash,
	IconX,
} from '@tabler/icons-react'

import {useIsMobile} from '@/hooks/use-is-mobile'
import {useContainers} from '@/hooks/use-containers'
import {ContainerCreateForm} from '@/routes/server-control/container-create-form'
import {ContainerDetailSheet} from '@/routes/server-control/container-detail-sheet'
import {Button} from '@/shadcn-components/ui/button'
import {Checkbox} from '@/shadcn-components/ui/checkbox'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/shadcn-components/ui/table'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'

import {useDockerResource, useSelectedContainer} from '../resource-store'
import {ActionButton} from './action-button'
import {filterByQuery} from './filter-rows'
import {formatPorts} from './format-ports'
import {RenameDialog} from './rename-dialog'
import {StateBadge} from './state-badge'

// Remove-container confirmation dialog — port of server-control/index.tsx:937-996.
// Inlined here (vs. a separate file) because Containers is the only consumer.
function RemoveDialog({
	containerName,
	open,
	onOpenChange,
	onConfirm,
	isManaging,
}: {
	containerName: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: (confirmName: string) => void
	isManaging: boolean
}) {
	const [typedName, setTypedName] = useState('')

	useEffect(() => {
		if (!open) setTypedName('')
	}, [open])

	const canConfirm = typedName === containerName && !isManaging

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Remove Container</DialogTitle>
					<DialogDescription>
						This action cannot be undone. Type the container name to confirm:
					</DialogDescription>
				</DialogHeader>
				<div className='py-2'>
					<p className='mb-3 text-sm text-text-secondary'>
						Container: <span className='font-bold font-mono text-text-primary'>{containerName}</span>
					</p>
					<Input
						sizeVariant='short-square'
						placeholder='Type container name...'
						value={typedName}
						onValueChange={setTypedName}
						autoFocus
					/>
				</div>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant='destructive'
						size='dialog'
						disabled={!canConfirm}
						onClick={() => onConfirm(typedName)}
					>
						Remove
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

export function ContainerSection() {
	const isMobile = useIsMobile()
	const {
		containers,
		isLoading,
		isError,
		error,
		isFetching,
		refetch,
		manage,
		isManaging,
		bulkManage,
		isBulkManaging,
		actionResult,
		runningCount,
		totalCount,
	} = useContainers()

	const selectedContainer = useSelectedContainer()
	const setSelectedContainer = useDockerResource((s) => s.setSelectedContainer)

	const [searchQuery, setSearchQuery] = useState('')
	const [removeTarget, setRemoveTarget] = useState<string | null>(null)
	const [showCreateForm, setShowCreateForm] = useState(false)
	const [editTarget, setEditTarget] = useState<string | null>(null)
	const [duplicateTarget, setDuplicateTarget] = useState<string | null>(null)
	const [renameTarget, setRenameTarget] = useState<string | null>(null)
	const [selectedContainers, setSelectedContainers] = useState<Set<string>>(new Set())
	const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false)

	const renameMutation = trpcReact.docker.renameContainer.useMutation({
		onSuccess: () => {
			refetch()
			setRenameTarget(null)
		},
	})

	const handleRemoveConfirm = (confirmName: string) => {
		if (!removeTarget) return
		manage(removeTarget, 'remove', {force: true, confirmName})
		setRemoveTarget(null)
	}

	// Selection helpers — operate on `containers` (full set) so 'select all'
	// under an active filter still selects every visible row in the unfiltered
	// list. The bulk action bar surfaces the count regardless of filter state.
	const toggleSelect = useCallback((name: string) => {
		setSelectedContainers((prev) => {
			const next = new Set(prev)
			if (next.has(name)) next.delete(name)
			else next.add(name)
			return next
		})
	}, [])

	const toggleSelectAll = useCallback(() => {
		setSelectedContainers((prev) => {
			if (prev.size === containers.length) return new Set()
			return new Set(containers.map((c) => c.name))
		})
	}, [containers])

	const clearSelection = useCallback(() => {
		setSelectedContainers(new Set())
	}, [])

	// Drop stale references when the containers list changes (e.g. env switch).
	useEffect(() => {
		setSelectedContainers((prev) => {
			const containerNames = new Set(containers.map((c) => c.name))
			const filtered = new Set([...prev].filter((name) => containerNames.has(name)))
			if (filtered.size !== prev.size) return filtered
			return prev
		})
	}, [containers])

	const handleBulkAction = useCallback(
		(operation: 'start' | 'stop' | 'restart' | 'kill' | 'remove') => {
			if (selectedContainers.size === 0) return
			if (operation === 'remove') {
				setBulkRemoveOpen(true)
				return
			}
			bulkManage(Array.from(selectedContainers), operation)
			clearSelection()
		},
		[selectedContainers, bulkManage, clearSelection],
	)

	const handleBulkRemoveConfirm = useCallback(() => {
		bulkManage(Array.from(selectedContainers), 'remove', {force: true})
		clearSelection()
		setBulkRemoveOpen(false)
	}, [selectedContainers, bulkManage, clearSelection])

	const filteredContainers = filterByQuery(
		containers,
		searchQuery,
		(c) => `${c.name} ${c.image}`,
	)

	const isFiltered = searchQuery.trim().length > 0
	const noFilterResults = isFiltered && filteredContainers.length === 0 && containers.length > 0

	return (
		<div className='flex h-full flex-col overflow-y-auto p-4 sm:p-6'>
			{/* Search + summary + actions row */}
			<div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
				<div className='relative w-full max-w-xs'>
					<IconSearch size={14} className='absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary' />
					<Input
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder='Search containers…'
						className='pl-8'
						maxLength={200}
					/>
				</div>
				<div className='flex flex-wrap items-center gap-2 text-sm text-text-secondary'>
					<span>
						<span className='font-medium text-emerald-500'>{runningCount}</span>
						<span className='mx-1'>/</span>
						<span>{totalCount}</span>
						<span className='ml-1'>running</span>
					</span>
					<button
						onClick={() => setShowCreateForm(true)}
						className='flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand/90'
					>
						<IconPlus size={14} />
						Add Container
					</button>
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

			{/* Action result toast */}
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

			{/* Container Table */}
			{isLoading ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconRefresh size={24} className='mx-auto mb-3 animate-spin text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>Loading containers...</p>
				</div>
			) : isError ? (
				<div className='rounded-xl border border-red-500/20 bg-red-500/10 p-8 text-center'>
					<IconServer size={24} className='mx-auto mb-3 text-red-400' />
					<p className='text-sm text-red-400'>Failed to load containers</p>
					<p className='mt-1 text-xs text-red-400/60'>{error?.message}</p>
				</div>
			) : !containers.length ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconBox size={32} className='mx-auto mb-3 text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>No Docker containers found</p>
					<p className='mt-1 text-xs text-text-tertiary'>Install an app from the App Store to get started</p>
				</div>
			) : noFilterResults ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconSearch size={28} className='mx-auto mb-3 text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>
						No containers match "<span className='font-mono'>{searchQuery}</span>"
					</p>
				</div>
			) : isMobile ? (
				/* Mobile card layout */
				<div className='space-y-2'>
					{filteredContainers.map((container) => {
						const isRunning = container.state === 'running'
						const isPaused = container.state === 'paused'
						return (
							<div
								key={container.id}
								onClick={() => setSelectedContainer(container.name)}
								className={cn(
									'rounded-xl border border-border-default bg-surface-base p-3 transition-colors active:bg-surface-1',
									selectedContainers.has(container.name) && 'border-brand/30 bg-brand/5',
								)}
							>
								<div className='flex items-center gap-2'>
									<span onClick={(e) => e.stopPropagation()}>
										<Checkbox
											checked={selectedContainers.has(container.name)}
											onCheckedChange={() => toggleSelect(container.name)}
										/>
									</span>
									{container.isProtected && <IconLock size={14} className='shrink-0 text-amber-500' />}
									<span className='min-w-0 flex-1 truncate text-sm font-medium text-text-primary'>{container.name}</span>
									<StateBadge state={container.state} />
								</div>
								<div className='mt-1.5 pl-7 text-xs text-text-secondary truncate'>{container.image.split('@')[0]}</div>
								{container.ports.length > 0 && (
									<div className='mt-1 pl-7 text-xs text-text-tertiary font-mono truncate'>{formatPorts(container.ports)}</div>
								)}
								<div className='mt-2 flex flex-wrap items-center gap-1 pl-7' onClick={(e) => e.stopPropagation()}>
									<ActionButton
										icon={IconPencil}
										onClick={() => {
											setSelectedContainer(null)
											setEditTarget(container.name)
										}}
										disabled={isManaging || container.isProtected}
										color='blue'
										title='Edit'
									/>
									<ActionButton
										icon={IconCopy}
										onClick={() => {
											setSelectedContainer(null)
											setDuplicateTarget(container.name)
										}}
										disabled={isManaging}
										color='blue'
										title='Duplicate'
									/>
									<ActionButton
										icon={IconTag}
										onClick={() => {
											setSelectedContainer(null)
											setRenameTarget(container.name)
										}}
										disabled={isManaging || container.isProtected}
										color='blue'
										title='Rename'
									/>
									{!isRunning && !isPaused && (
										<ActionButton icon={IconPlayerPlay} onClick={() => manage(container.name, 'start')} disabled={isManaging} color='emerald' title='Start' />
									)}
									{isRunning && (
										<ActionButton icon={IconPlayerStop} onClick={() => manage(container.name, 'stop')} disabled={isManaging || container.isProtected} color='amber' title='Stop' />
									)}
									{isRunning && (
										<ActionButton icon={IconPlayerPause} onClick={() => manage(container.name, 'pause')} disabled={isManaging || container.isProtected} color='amber' title='Pause' />
									)}
									{isPaused && (
										<ActionButton icon={IconPlayerPlay} onClick={() => manage(container.name, 'unpause')} disabled={isManaging} color='emerald' title='Resume' />
									)}
									{(isRunning || isPaused) && (
										<ActionButton icon={IconHandStop} onClick={() => manage(container.name, 'kill')} disabled={isManaging} color='red' title='Kill' />
									)}
									<ActionButton icon={IconRotateClockwise} onClick={() => manage(container.name, 'restart')} disabled={isManaging} color='blue' title='Restart' />
									<ActionButton icon={IconTrash} onClick={() => setRemoveTarget(container.name)} disabled={isManaging || container.isProtected} color='red' title='Remove' />
								</div>
							</div>
						)
					})}
				</div>
			) : (
				/* Desktop table layout */
				<div className='rounded-xl border border-border-default bg-surface-base overflow-hidden'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className='w-10 pl-4'>
									<span onClick={(e) => e.stopPropagation()}>
										<Checkbox
											checked={
												containers.length > 0 && selectedContainers.size === containers.length
													? true
													: selectedContainers.size > 0
														? 'indeterminate'
														: false
											}
											onCheckedChange={() => toggleSelectAll()}
										/>
									</span>
								</TableHead>
								<TableHead>Name</TableHead>
								<TableHead>Image</TableHead>
								<TableHead>State</TableHead>
								<TableHead>Ports</TableHead>
								<TableHead className='text-right pr-4'>Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filteredContainers.map((container) => {
								const isRunning = container.state === 'running'
								const isPaused = container.state === 'paused'
								return (
									<TableRow
										key={container.id}
										onClick={() => setSelectedContainer(container.name)}
										className={cn(
											'cursor-pointer transition-colors hover:bg-surface-1/50',
											selectedContainers.has(container.name) && 'bg-brand/5',
										)}
									>
										<TableCell className='w-10 pl-4'>
											<span onClick={(e) => e.stopPropagation()}>
												<Checkbox
													checked={selectedContainers.has(container.name)}
													onCheckedChange={() => toggleSelect(container.name)}
												/>
											</span>
										</TableCell>
										<TableCell className='font-medium'>
											<div className='flex items-center gap-2'>
												{container.isProtected && (
													<IconLock size={14} className='shrink-0 text-amber-500' />
												)}
												<span className='truncate' title={container.name}>
													{container.name}
												</span>
											</div>
										</TableCell>
										<TableCell>
											<span className='truncate text-text-secondary text-xs' title={container.image}>
												{container.image.split('@')[0]}
											</span>
										</TableCell>
										<TableCell>
											<StateBadge state={container.state} />
										</TableCell>
										<TableCell>
											<span className='text-xs text-text-secondary font-mono'>
												{formatPorts(container.ports)}
											</span>
										</TableCell>
										<TableCell className='text-right pr-4'>
											<div className='flex items-center justify-end gap-1'>
												<span onClick={(e) => e.stopPropagation()}>
													<ActionButton
														icon={IconPencil}
														onClick={() => {
															setSelectedContainer(null)
															setEditTarget(container.name)
														}}
														disabled={isManaging || container.isProtected}
														color='blue'
														title={container.isProtected ? 'Protected — cannot edit' : 'Edit'}
													/>
												</span>
												<span onClick={(e) => e.stopPropagation()}>
													<ActionButton
														icon={IconCopy}
														onClick={() => {
															setSelectedContainer(null)
															setDuplicateTarget(container.name)
														}}
														disabled={isManaging}
														color='blue'
														title='Duplicate'
													/>
												</span>
												<span onClick={(e) => e.stopPropagation()}>
													<ActionButton
														icon={IconTag}
														onClick={() => {
															setSelectedContainer(null)
															setRenameTarget(container.name)
														}}
														disabled={isManaging || container.isProtected}
														color='blue'
														title={container.isProtected ? 'Protected — cannot rename' : 'Rename'}
													/>
												</span>
												{!isRunning && !isPaused && (
													<span onClick={(e) => e.stopPropagation()}>
														<ActionButton
															icon={IconPlayerPlay}
															onClick={() => manage(container.name, 'start')}
															disabled={isManaging}
															color='emerald'
															title='Start'
														/>
													</span>
												)}
												{isRunning && (
													<span onClick={(e) => e.stopPropagation()}>
														<ActionButton
															icon={IconPlayerStop}
															onClick={() => manage(container.name, 'stop')}
															disabled={isManaging || container.isProtected}
															color='amber'
															title={container.isProtected ? 'Protected — cannot stop' : 'Stop'}
														/>
													</span>
												)}
												{isRunning && (
													<span onClick={(e) => e.stopPropagation()}>
														<ActionButton
															icon={IconPlayerPause}
															onClick={() => manage(container.name, 'pause')}
															disabled={isManaging || container.isProtected}
															color='amber'
															title={container.isProtected ? 'Protected — cannot pause' : 'Pause'}
														/>
													</span>
												)}
												{isPaused && (
													<span onClick={(e) => e.stopPropagation()}>
														<ActionButton
															icon={IconPlayerPlay}
															onClick={() => manage(container.name, 'unpause')}
															disabled={isManaging}
															color='emerald'
															title='Resume'
														/>
													</span>
												)}
												{(isRunning || isPaused) && (
													<span onClick={(e) => e.stopPropagation()}>
														<ActionButton
															icon={IconHandStop}
															onClick={() => manage(container.name, 'kill')}
															disabled={isManaging}
															color='red'
															title='Kill (SIGKILL)'
														/>
													</span>
												)}
												<span onClick={(e) => e.stopPropagation()}>
													<ActionButton
														icon={IconRotateClockwise}
														onClick={() => manage(container.name, 'restart')}
														disabled={isManaging}
														color='blue'
														title='Restart'
													/>
												</span>
												<span onClick={(e) => e.stopPropagation()}>
													<ActionButton
														icon={IconTrash}
														onClick={() => setRemoveTarget(container.name)}
														disabled={isManaging || container.isProtected}
														color='red'
														title={container.isProtected ? 'Protected — cannot remove' : 'Remove'}
													/>
												</span>
											</div>
										</TableCell>
									</TableRow>
								)
							})}
						</TableBody>
					</Table>
				</div>
			)}

			{/* Floating Bulk Action Bar */}
			<AnimatePresence>
				{selectedContainers.size > 0 && (
					<motion.div
						initial={{opacity: 0, y: 20}}
						animate={{opacity: 1, y: 0}}
						exit={{opacity: 0, y: 20}}
						transition={{duration: 0.2}}
						className='fixed bottom-4 left-3 right-3 z-50 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:bottom-6'
					>
						<div className='flex flex-wrap items-center gap-2 rounded-xl border border-border-default bg-surface-base px-3 py-2 shadow-lg sm:flex-nowrap sm:gap-3 sm:px-4 sm:py-2.5'>
							<span className='text-sm font-medium text-text-primary'>
								{selectedContainers.size} selected
							</span>
							<div className='h-4 w-px bg-border-default' />
							<div className='flex items-center gap-2'>
								<button
									onClick={() => handleBulkAction('start')}
									disabled={isBulkManaging}
									className='flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-[11px] sm:text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/30 disabled:opacity-50'
								>
									<IconPlayerPlay size={14} />
									Start
								</button>
								<button
									onClick={() => handleBulkAction('stop')}
									disabled={isBulkManaging}
									className='flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-[11px] sm:text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/30 disabled:opacity-50'
								>
									<IconPlayerStop size={14} />
									Stop
								</button>
								<button
									onClick={() => handleBulkAction('restart')}
									disabled={isBulkManaging}
									className='flex items-center gap-1.5 rounded-lg bg-blue-500/20 px-3 py-1.5 text-[11px] sm:text-xs font-medium text-blue-600 transition-colors hover:bg-blue-500/30 disabled:opacity-50'
								>
									<IconRotateClockwise size={14} />
									Restart
								</button>
								<button
									onClick={() => handleBulkAction('kill')}
									disabled={isBulkManaging}
									className='flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-[11px] sm:text-xs font-medium text-red-600 transition-colors hover:bg-red-500/30 disabled:opacity-50'
								>
									<IconHandStop size={14} />
									Kill
								</button>
								<button
									onClick={() => handleBulkAction('remove')}
									disabled={isBulkManaging}
									className='flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-[11px] sm:text-xs font-medium text-red-600 transition-colors hover:bg-red-500/30 disabled:opacity-50'
								>
									<IconTrash size={14} />
									Remove
								</button>
							</div>
							<div className='h-4 w-px bg-border-default' />
							<button
								onClick={clearSelection}
								className='rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary'
								title='Clear selection'
							>
								<IconX size={14} />
							</button>
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Bulk Remove Confirmation Dialog */}
			<Dialog open={bulkRemoveOpen} onOpenChange={setBulkRemoveOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Remove {selectedContainers.size} containers?</DialogTitle>
						<DialogDescription>
							This will force-remove the selected containers. This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant='outline' onClick={() => setBulkRemoveOpen(false)}>
							Cancel
						</Button>
						<Button variant='destructive' onClick={handleBulkRemoveConfirm} disabled={isBulkManaging}>
							{isBulkManaging ? 'Removing...' : 'Confirm Remove'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Container Create Form */}
			<ContainerCreateForm
				open={showCreateForm || !!editTarget || !!duplicateTarget}
				onClose={() => {
					setShowCreateForm(false)
					setEditTarget(null)
					setDuplicateTarget(null)
				}}
				onSuccess={() => refetch()}
				editContainerName={editTarget}
				duplicateContainerName={duplicateTarget}
			/>

			{/* Remove Confirmation Dialog */}
			{removeTarget && (
				<RemoveDialog
					containerName={removeTarget}
					open={!!removeTarget}
					onOpenChange={(open) => {
						if (!open) setRemoveTarget(null)
					}}
					onConfirm={handleRemoveConfirm}
					isManaging={isManaging}
				/>
			)}

			{/* Rename Dialog */}
			{renameTarget && (
				<RenameDialog
					containerName={renameTarget}
					open={!!renameTarget}
					onOpenChange={(open) => {
						if (!open) setRenameTarget(null)
					}}
					onConfirm={(newName) => renameMutation.mutate({name: renameTarget, newName})}
					isPending={renameMutation.isPending}
					error={renameMutation.error}
				/>
			)}

			{/* Container Detail Sheet — store-driven for DOC-20 programmatic deep-link */}
			<ContainerDetailSheet
				containerName={selectedContainer}
				open={selectedContainer !== null}
				onOpenChange={(open) => {
					if (!open) setSelectedContainer(null)
				}}
				onEdit={(name) => {
					setSelectedContainer(null)
					setEditTarget(name)
				}}
				onDuplicate={(name) => {
					setSelectedContainer(null)
					setDuplicateTarget(name)
				}}
			/>
		</div>
	)
}
