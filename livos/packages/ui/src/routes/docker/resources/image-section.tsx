// Phase 26 Plan 26-01 (DOC-08 + DOC-20 partial) — Docker Images section.
// Replaces the Phase 24 placeholder. Body extracted from
// routes/server-control/index.tsx ImagesTab() (lines 1995-2262) with:
//   1. Search input (NEW — phase success criterion 6, filters by joined
//      repoTags).
//   2. expandedImage state migrated to useDockerResource.selectedImage
//      zustand store so external surfaces can deep-link (DOC-20 partial).
//   3. Wrapped in flex h-full overflow-y-auto p-4 sm:p-6.
// Phase 19 (vuln scan via ScanResultPanel) and Phase 23 (Explain CVEs
// via the same panel) carry over UNCHANGED — both are gated by the same
// ScanResultPanel sub-component which we ported in Task 2.
//
// The four legacy file-local dialogs (RemoveImage / PruneImages /
// PullImage / TagImage) were ported into resources/image-dialogs.tsx
// since they were never exported from server-control/index.tsx.

import {Fragment, useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {
	IconChevronDown,
	IconChevronRight,
	IconDownload,
	IconPhoto,
	IconRefresh,
	IconSearch,
	IconShieldCheck,
	IconTag,
	IconTrash,
} from '@tabler/icons-react'

import {formatBytes, useImages} from '@/hooks/use-images'
import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/shadcn-components/ui/table'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/shadcn-components/ui/tabs'
import {cn} from '@/shadcn-lib/utils'

import {useDockerResource, useSelectedImage} from '../resource-store'
import {ActionButton} from './action-button'
import {filterByQuery} from './filter-rows'
import {formatRelativeDate} from './format-relative-date'
import {ImageHistoryPanel} from './image-history-panel'
import {PruneImagesDialog, PullImageDialog, RemoveImageDialog, TagImageDialog} from './image-dialogs'
import {ScanResultPanel} from './scan-result-panel'

export function ImageSection() {
	const {
		images,
		isLoading,
		isError,
		error,
		isFetching,
		refetch,
		removeImage,
		isRemoving,
		pullImage,
		isPulling,
		tagImage,
		isTagging,
		pruneImages,
		isPruning,
		scanImage,
		isScanning,
		actionResult,
		totalSize,
		totalCount,
	} = useImages()

	const expandedImage = useSelectedImage()
	const setExpandedImage = useDockerResource((s) => s.setSelectedImage)

	const [searchQuery, setSearchQuery] = useState('')
	const [removeTarget, setRemoveTarget] = useState<{id: string; tag: string} | null>(null)
	const [showPruneDialog, setShowPruneDialog] = useState(false)
	const [showPullDialog, setShowPullDialog] = useState(false)
	const [tagTarget, setTagTarget] = useState<{id: string; tag: string} | null>(null)
	const [imageTabState, setImageTabState] = useState<Record<string, 'history' | 'scan'>>({})
	const getActiveImageTab = (id: string): 'history' | 'scan' => imageTabState[id] ?? 'history'
	const setActiveImageTab = (id: string, value: 'history' | 'scan') =>
		setImageTabState((prev) => ({...prev, [id]: value}))

	const filteredImages = filterByQuery(images, searchQuery, (img) => img.repoTags.join(' '))

	const isFiltered = searchQuery.trim().length > 0
	const noFilterResults = isFiltered && filteredImages.length === 0 && images.length > 0

	return (
		<div className='flex h-full flex-col overflow-y-auto p-4 sm:p-6'>
			{/* Search + summary + actions row */}
			<div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
				<div className='relative w-full max-w-xs'>
					<IconSearch size={14} className='absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary' />
					<Input
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder='Search images…'
						className='pl-8'
						maxLength={200}
					/>
				</div>
				<div className='flex flex-wrap items-center gap-2 text-sm text-text-secondary'>
					<span>
						<span className='font-medium text-text-primary'>{totalCount}</span>
						<span className='ml-1'>images,</span>
						<span className='ml-1 font-medium text-text-primary'>{formatBytes(totalSize)}</span>
						<span className='ml-1'>total</span>
					</span>
					<Button
						variant='default'
						size='sm'
						onClick={() => setShowPullDialog(true)}
						disabled={isPulling}
					>
						<IconDownload size={14} className='mr-1.5' />
						{isPulling ? 'Pulling...' : 'Pull Image'}
					</Button>
					<Button
						variant='default'
						size='sm'
						onClick={() => setShowPruneDialog(true)}
						disabled={isPruning}
					>
						Prune Unused Images
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

			{/* Images Table */}
			{isLoading ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconRefresh size={24} className='mx-auto mb-3 animate-spin text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>Loading images...</p>
				</div>
			) : isError ? (
				<div className='rounded-xl border border-red-500/20 bg-red-500/10 p-8 text-center'>
					<IconPhoto size={24} className='mx-auto mb-3 text-red-400' />
					<p className='text-sm text-red-400'>Failed to load images</p>
					<p className='mt-1 text-xs text-red-400/60'>{error?.message}</p>
				</div>
			) : !images.length ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconPhoto size={32} className='mx-auto mb-3 text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>No Docker images found</p>
				</div>
			) : noFilterResults ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconSearch size={28} className='mx-auto mb-3 text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>
						No images match "<span className='font-mono'>{searchQuery}</span>"
					</p>
				</div>
			) : (
				<div className='overflow-x-auto'>
					<div className='rounded-xl border border-border-default bg-surface-base overflow-hidden'>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className='pl-4'>Repository:Tag</TableHead>
									<TableHead>Size</TableHead>
									<TableHead>Created</TableHead>
									<TableHead className='text-right pr-4'>Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredImages.map((image) => {
									const isNone = image.repoTags.length === 1 && image.repoTags[0] === '<none>:<none>'
									const primaryTag = isNone ? '<none>:<none>' : image.repoTags[0]
									const extraCount = image.repoTags.length - 1
									const isExpanded = expandedImage === image.id
									return (
										<Fragment key={image.id}>
											<TableRow
												className='cursor-pointer'
												onClick={() => setExpandedImage(isExpanded ? null : image.id)}
											>
												<TableCell className='pl-4'>
													<div className='flex items-center gap-2'>
														{isExpanded
															? <IconChevronDown size={14} className='shrink-0 text-text-tertiary' />
															: <IconChevronRight size={14} className='shrink-0 text-text-tertiary' />
														}
														<span
															className={cn('truncate font-mono text-sm', isNone && 'italic text-text-tertiary')}
															title={image.repoTags.join(', ')}
														>
															{primaryTag}
														</span>
														{extraCount > 0 && (
															<span className='inline-flex items-center rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600'>
																+{extraCount} more
															</span>
														)}
													</div>
												</TableCell>
												<TableCell>
													<span className='text-sm text-text-secondary'>{formatBytes(image.size)}</span>
												</TableCell>
												<TableCell>
													<span className='text-sm text-text-secondary'>{formatRelativeDate(image.created)}</span>
												</TableCell>
												<TableCell className='text-right pr-4'>
													<div className='flex items-center justify-end gap-0.5' onClick={(e) => e.stopPropagation()}>
														<ActionButton
															icon={IconShieldCheck}
															onClick={() => {
																setExpandedImage(image.id)
																setActiveImageTab(image.id, 'scan')
																scanImage(isNone ? image.id : primaryTag)
															}}
															disabled={isScanning || isNone}
															color='amber'
															title={isNone ? 'Cannot scan untagged image' : 'Scan for vulnerabilities'}
														/>
														<ActionButton
															icon={IconTag}
															onClick={() => setTagTarget({id: image.id, tag: primaryTag})}
															disabled={isTagging}
															color='blue'
															title='Tag image'
														/>
														<ActionButton
															icon={IconTrash}
															onClick={() => setRemoveTarget({id: image.id, tag: primaryTag})}
															disabled={isRemoving}
															color='red'
															title='Remove image'
														/>
													</div>
												</TableCell>
											</TableRow>
											{isExpanded && (
												<TableRow>
													<TableCell colSpan={4} className='p-0 border-t border-border-default bg-surface-1/30'>
														<Tabs
															value={getActiveImageTab(image.id)}
															onValueChange={(v) => setActiveImageTab(image.id, v as 'history' | 'scan')}
															className='px-4 py-3'
														>
															<TabsList className='mb-3'>
																<TabsTrigger value='history'>Layer history</TabsTrigger>
																<TabsTrigger value='scan'>Vulnerabilities</TabsTrigger>
															</TabsList>
															<TabsContent value='history'>
																<ImageHistoryPanel imageId={image.id} />
															</TabsContent>
															<TabsContent value='scan'>
																<ScanResultPanel imageRef={isNone ? image.id : primaryTag} />
															</TabsContent>
														</Tabs>
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

			{/* Remove Image Dialog */}
			{removeTarget && (
				<RemoveImageDialog
					imageTag={removeTarget.tag}
					open={!!removeTarget}
					onOpenChange={(open) => {
						if (!open) setRemoveTarget(null)
					}}
					onConfirm={() => {
						removeImage(removeTarget.id, true)
						setRemoveTarget(null)
					}}
					isRemoving={isRemoving}
				/>
			)}

			{/* Prune Images Dialog */}
			<PruneImagesDialog
				open={showPruneDialog}
				onOpenChange={setShowPruneDialog}
				onConfirm={() => {
					pruneImages()
					setShowPruneDialog(false)
				}}
				isPruning={isPruning}
			/>

			{/* Pull Image Dialog */}
			<PullImageDialog
				open={showPullDialog}
				onOpenChange={setShowPullDialog}
				onConfirm={(image) => {
					pullImage(image)
					setShowPullDialog(false)
				}}
				isPulling={isPulling}
			/>

			{/* Tag Image Dialog */}
			{tagTarget && (
				<TagImageDialog
					open={!!tagTarget}
					onOpenChange={(open) => {
						if (!open) setTagTarget(null)
					}}
					imageId={tagTarget.id}
					currentTag={tagTarget.tag}
					onConfirm={(id, repo, tag) => {
						tagImage(id, repo, tag)
						setTagTarget(null)
					}}
					isTagging={isTagging}
				/>
			)}
		</div>
	)
}
