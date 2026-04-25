// Phase 27-01 (DOC-11) — ported from routes/server-control/index.tsx
// StacksTab() (lines 3542-3856) with these structural changes:
//   1. Search input (NEW — maxLength=200, T-27-01 mitigation; legacy lacked
//      search). filterByQuery is the same primitive used by ContainerSection
//      / ImageSection — empty-query path returns same array reference.
//   2. expandedStack migrated to useDockerResource.selectedStack zustand
//      store (DOC-20 partial: programmatic deep-link half closed for stacks).
//      External code can now call setSelectedStack(name) to expand a row.
//   3. Constituent-container rows are clickable → opens the existing
//      ContainerDetailSheet via setSelectedContainer (preserves Phase 17
//      logs xterm + Phase 18 file browser + Phase 19 vuln-scan via the
//      existing per-container detail sheet — see Open Item in SUMMARY.md).
//   4. Wrapped in flex h-full overflow-y-auto p-4 sm:p-6 to match the
//      routes/docker/resources/*-section.tsx shape from Plan 26-01.
//   5. noFilterResults empty-state branch (Plan 26-02 D-05 precedent).
//
// Cross-imports retained from routes/server-control/* (Plan 27-02 will
// relocate them post-server-control delete):
//   - ComposeGraphViewer (Phase 19 — Graph tab inside expanded row).
//   - ContainerDetailSheet (Phase 17/18/19 — opened on constituent click).

import {Fragment, useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {
	IconChevronDown,
	IconChevronRight,
	IconCloudDownload,
	IconPencil,
	IconPlayerPlay,
	IconPlayerStop,
	IconPlus,
	IconRefresh,
	IconRotateClockwise,
	IconSearch,
	IconStack2,
	IconTrash,
} from '@tabler/icons-react'

import {useStacks} from '@/hooks/use-stacks'
import {ComposeGraphViewer} from '@/routes/server-control/compose-graph-viewer'
import {ContainerDetailSheet} from '@/routes/server-control/container-detail-sheet'
import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/shadcn-components/ui/table'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/shadcn-components/ui/tabs'
import {cn} from '@/shadcn-lib/utils'

import {useDockerResource, useSelectedContainer, useSelectedStack} from '../resource-store'
import {ActionButton} from '../resources/action-button'
import {filterByQuery} from '../resources/filter-rows'
import {DeployStackForm} from './deploy-stack-form'
import {RedeployStackDialog, RemoveStackDialog} from './stack-dialogs'

// Status pill — verbatim from legacy lines 3563-3574.
function statusBadge(status: 'running' | 'stopped' | 'partial') {
	const classes: Record<string, string> = {
		running: 'bg-emerald-500/20 text-emerald-600',
		stopped: 'bg-red-500/20 text-red-600',
		partial: 'bg-amber-500/20 text-amber-600',
	}
	return (
		<span
			className={cn(
				'inline-block rounded-full px-2.5 py-0.5 text-xs font-medium',
				classes[status] || 'bg-neutral-500/20 text-neutral-500',
			)}
		>
			{status}
		</span>
	)
}

export function StackSection() {
	const {
		stacks,
		isLoading,
		isError,
		error,
		isFetching,
		refetch,
		controlStack,
		isControlling,
		removeStack,
		isRemoving,
		actionResult,
	} = useStacks()

	// Plan 27-01: hoist expandedStack to useDockerResource zustand store so
	// external surfaces can programmatically expand a stack row (DOC-20 partial).
	const expandedStack = useSelectedStack()
	const setExpandedStack = useDockerResource((s) => s.setSelectedStack)

	// Constituent-container click-through: opens the per-container detail sheet
	// (Phase 17 logs + Phase 18 files + Phase 19 vuln-scan all live inside it).
	const selectedContainer = useSelectedContainer()
	const setSelectedContainer = useDockerResource((s) => s.setSelectedContainer)

	const [searchQuery, setSearchQuery] = useState('')
	const [deployFormOpen, setDeployFormOpen] = useState(false)
	const [editTarget, setEditTarget] = useState<string | null>(null)
	const [removeTarget, setRemoveTarget] = useState<string | null>(null)
	const [redeployTarget, setRedeployTarget] = useState<string | null>(null)

	const filteredStacks = filterByQuery(stacks, searchQuery, (s) => s.name)
	const isFiltered = searchQuery.trim().length > 0
	const noFilterResults = isFiltered && filteredStacks.length === 0 && stacks.length > 0

	return (
		<div className='flex h-full flex-col overflow-y-auto p-4 sm:p-6'>
			{/* Search + summary + actions row */}
			<div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
				<div className='relative w-full max-w-xs'>
					<IconSearch
						size={14}
						className='absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary'
					/>
					<Input
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder='Search stacks…'
						className='pl-8'
						maxLength={200}
					/>
				</div>
				<div className='flex flex-wrap items-center gap-2 text-sm text-text-secondary'>
					<span>
						<span className='font-medium text-text-primary'>{stacks.length}</span>
						<span className='ml-1'>stack(s)</span>
					</span>
					<Button variant='default' size='sm' onClick={() => setDeployFormOpen(true)}>
						<IconPlus size={14} className='mr-1.5' />
						Deploy Stack
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

			{/* Stack Table */}
			{isLoading ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconRefresh size={24} className='mx-auto mb-3 animate-spin text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>Loading stacks...</p>
				</div>
			) : isError ? (
				<div className='rounded-xl border border-red-500/20 bg-red-500/10 p-8 text-center'>
					<IconStack2 size={24} className='mx-auto mb-3 text-red-400' />
					<p className='text-sm text-red-400'>Failed to load stacks</p>
					<p className='mt-1 text-xs text-red-400/60'>{error?.message}</p>
				</div>
			) : !stacks.length ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconStack2 size={32} className='mx-auto mb-3 text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>No stacks found. Deploy your first stack.</p>
				</div>
			) : noFilterResults ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconSearch size={28} className='mx-auto mb-3 text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>
						No stacks match "<span className='font-mono'>{searchQuery}</span>"
					</p>
				</div>
			) : (
				<div className='overflow-x-auto'>
					<div className='rounded-xl border border-border-default bg-surface-base overflow-hidden'>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className='pl-4'>Name</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Containers</TableHead>
									<TableHead className='text-right pr-4'>Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredStacks.map((stack) => {
									const isExpanded = expandedStack === stack.name
									const isRunning = stack.status === 'running'
									const isStopped = stack.status === 'stopped'
									return (
										<Fragment key={stack.name}>
											<TableRow
												onClick={() => setExpandedStack(isExpanded ? null : stack.name)}
												className={cn(
													'cursor-pointer transition-colors hover:bg-surface-1/50',
													isExpanded && 'bg-surface-1',
												)}
											>
												<TableCell className='pl-4 font-medium'>
													<div className='flex items-center gap-2'>
														{isExpanded ? (
															<IconChevronDown size={14} className='shrink-0 text-text-tertiary' />
														) : (
															<IconChevronRight size={14} className='shrink-0 text-text-tertiary' />
														)}
														<span className='truncate' title={stack.name}>
															{stack.name}
														</span>
													</div>
												</TableCell>
												<TableCell>{statusBadge(stack.status)}</TableCell>
												<TableCell>
													<span className='text-sm text-text-secondary'>{stack.containerCount}</span>
												</TableCell>
												<TableCell className='text-right pr-4'>
													<div className='flex items-center justify-end gap-1'>
														{/* Start (when stopped or partial) */}
														{(isStopped || stack.status === 'partial') && (
															<span onClick={(e) => e.stopPropagation()}>
																<ActionButton
																	icon={IconPlayerPlay}
																	onClick={() => controlStack(stack.name, 'up')}
																	disabled={isControlling}
																	color='emerald'
																	title='Start'
																/>
															</span>
														)}
														{/* Stop (when running or partial) */}
														{(isRunning || stack.status === 'partial') && (
															<span onClick={(e) => e.stopPropagation()}>
																<ActionButton
																	icon={IconPlayerStop}
																	onClick={() => controlStack(stack.name, 'stop')}
																	disabled={isControlling}
																	color='amber'
																	title='Stop'
																/>
															</span>
														)}
														{/* Restart */}
														<span onClick={(e) => e.stopPropagation()}>
															<ActionButton
																icon={IconRotateClockwise}
																onClick={() => controlStack(stack.name, 'restart')}
																disabled={isControlling}
																color='blue'
																title='Restart'
															/>
														</span>
														{/* Redeploy (pull latest images) — QW-03 */}
														<span onClick={(e) => e.stopPropagation()}>
															<ActionButton
																icon={IconCloudDownload}
																onClick={() => setRedeployTarget(stack.name)}
																disabled={isControlling}
																color='blue'
																title='Redeploy (pull latest images)'
															/>
														</span>
														{/* Edit */}
														<span onClick={(e) => e.stopPropagation()}>
															<ActionButton
																icon={IconPencil}
																onClick={() => setEditTarget(stack.name)}
																disabled={isControlling}
																color='blue'
																title='Edit'
															/>
														</span>
														{/* Remove */}
														<span onClick={(e) => e.stopPropagation()}>
															<ActionButton
																icon={IconTrash}
																onClick={() => setRemoveTarget(stack.name)}
																disabled={isRemoving}
																color='red'
																title='Remove'
															/>
														</span>
													</div>
												</TableCell>
											</TableRow>
											{/* Expanded row: constituent containers + compose graph */}
											{isExpanded && (
												<TableRow>
													<TableCell
														colSpan={4}
														className='p-0 border-t border-border-default bg-surface-1/30'
													>
														<div className='px-4 py-3'>
															<Tabs defaultValue='containers'>
																<TabsList className='mb-3'>
																	<TabsTrigger value='containers'>
																		Containers ({stack.containers.length})
																	</TabsTrigger>
																	<TabsTrigger value='graph'>Graph</TabsTrigger>
																</TabsList>
																<TabsContent value='containers'>
																	{stack.containers.length === 0 ? (
																		<p className='text-xs text-text-tertiary'>
																			No containers running for this stack.
																		</p>
																	) : (
																		<Table>
																			<TableHeader>
																				<TableRow>
																					<TableHead className='text-xs'>Name</TableHead>
																					<TableHead className='text-xs'>Image</TableHead>
																					<TableHead className='text-xs'>State</TableHead>
																				</TableRow>
																			</TableHeader>
																			<TableBody>
																				{stack.containers.map((container) => (
																					<TableRow
																						key={container.id}
																						onClick={(e) => {
																							e.stopPropagation()
																							setSelectedContainer(container.name)
																						}}
																						className='cursor-pointer hover:bg-surface-1/50'
																					>
																						<TableCell className='py-1.5'>
																							<span className='font-mono text-xs font-medium'>
																								{container.name}
																							</span>
																						</TableCell>
																						<TableCell className='py-1.5'>
																							<span className='text-xs text-text-secondary'>
																								{container.image}
																							</span>
																						</TableCell>
																						<TableCell className='py-1.5'>
																							<span
																								className={cn(
																									'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
																									container.state === 'running'
																										? 'bg-emerald-500/20 text-emerald-600'
																										: container.state === 'exited'
																											? 'bg-red-500/20 text-red-600'
																											: 'bg-neutral-500/20 text-neutral-500',
																								)}
																							>
																								{container.state}
																							</span>
																						</TableCell>
																					</TableRow>
																				))}
																			</TableBody>
																		</Table>
																	)}
																</TabsContent>
																<TabsContent value='graph'>
																	<ComposeGraphViewer stackName={stack.name} />
																</TabsContent>
															</Tabs>
														</div>
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

			{/* Deploy/Edit Stack Form */}
			<DeployStackForm
				open={deployFormOpen || !!editTarget}
				onClose={() => {
					setDeployFormOpen(false)
					setEditTarget(null)
				}}
				editStackName={editTarget}
				onDeploySuccess={() => refetch()}
			/>

			{/* Remove Stack Dialog */}
			{removeTarget && (
				<RemoveStackDialog
					stackName={removeTarget}
					open={!!removeTarget}
					onOpenChange={(open) => {
						if (!open) setRemoveTarget(null)
					}}
					onConfirm={(removeVols) => {
						removeStack(removeTarget, removeVols)
						setRemoveTarget(null)
					}}
					isRemoving={isRemoving}
				/>
			)}

			{/* Redeploy (pull latest) Stack Dialog — QW-03 */}
			{redeployTarget && (
				<RedeployStackDialog
					stackName={redeployTarget}
					open={!!redeployTarget}
					onOpenChange={(open) => {
						if (!open) setRedeployTarget(null)
					}}
					onConfirm={() => {
						controlStack(redeployTarget, 'pull-and-up')
						setRedeployTarget(null)
					}}
					isBusy={isControlling}
				/>
			)}

			{/* Container Detail Sheet — opened by clicking a constituent-container
			    row inside the expanded stack. Same store-driven shape as
			    ContainerSection (Plan 26-01) so deep-link contracts compose. */}
			<ContainerDetailSheet
				containerName={selectedContainer}
				open={selectedContainer !== null}
				onOpenChange={(open) => {
					if (!open) setSelectedContainer(null)
				}}
			/>
		</div>
	)
}
