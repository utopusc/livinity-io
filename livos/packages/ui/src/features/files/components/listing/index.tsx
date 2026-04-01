import {FolderX} from 'lucide-react'
import {ComponentType, useRef} from 'react'
import {TbFolder} from 'react-icons/tb'

import {AnimatedGroup} from '@/components/motion-primitives/animated-group'
import {Card} from '@/components/ui/card'
import {ListingAndFileItemContextMenu} from '@/features/files/components/listing/listing-and-file-item-context-menu'
import {ListingBody} from '@/features/files/components/listing/listing-body'
import {MarqueeSelection} from '@/features/files/components/listing/marquee-selection'
import {Droppable} from '@/features/files/components/shared/drag-and-drop'
import {FileUploadDropZone} from '@/features/files/components/shared/file-upload-drop-zone'
import {usePreferences} from '@/features/files/hooks/use-preferences'
import {useFilesKeyboardShortcuts} from '@/features/files/hooks/use-files-keyboard-shortcuts'
import {useIsTouchDevice} from '@/features/files/hooks/use-is-touch-device'
import {useNavigate} from '@/features/files/hooks/use-navigate'
import {useIsFilesReadOnly} from '@/features/files/providers/files-capabilities-context'
import {useFilesStore} from '@/features/files/store/use-files-store'
import type {FileSystemItem} from '@/features/files/types'
import {t} from '@/utils/i18n'
import {formatNumberI18n} from '@/utils/number'

export interface ListingProps {
	items: FileSystemItem[] // array of items to display
	totalItems?: number // total number of items in the listing
	truncatedAt?: number // if the listing is truncated at this number
	selectableItems?: FileSystemItem[] // array of items that are selectable, eg. for keyboard shortcuts we want to ignore uploading items
	isLoading: boolean // if the items are still loading
	error?: unknown // if there is an error loading the items
	hasMore: boolean // if there are more items to load
	onLoadMore: () => Promise<boolean> // callback to load more items (removed startIndex)
	CustomEmptyView?: ComponentType // custom empty placeholder component
	additionalContextMenuItems?: React.ReactNode // additional items for the context menu
	enableFileDrop?: boolean // if file upload drop zone is enabled
	marqueeScale?: number // scale factor applied to marquee math so the overlay stays aligned inside scaled embeds (see Rewind)
}

function ListingContent({
	items,
	totalItems,
	truncatedAt,
	hasMore,
	onLoadMore,
	scrollAreaRef,
	isLoading,
	error,
	isEmpty,
	CustomEmptyView,
}: {
	items: FileSystemItem[]
	totalItems?: number
	truncatedAt?: number
	hasMore: boolean
	onLoadMore: () => Promise<boolean>
	scrollAreaRef: React.RefObject<HTMLDivElement>
	isLoading: boolean
	error: unknown
	isEmpty: boolean
	CustomEmptyView?: ComponentType
}) {
	const selectedItems = useFilesStore((s) => s.selectedItems)
	return (
		<Card className='h-[calc(100svh-180px)] !border-transparent !p-0 !pt-4 !shadow-none bg-white/40 lg:h-[calc(100vh-300px)]'>
			{(() => {
				if (isLoading) return <LoadingView />
				if (error) return <ErrorView error={error} />
				if (isEmpty) return CustomEmptyView ? <CustomEmptyView /> : <EmptyView />

				return (
					<ListingBody
						scrollAreaRef={scrollAreaRef}
						items={items}
						hasMore={hasMore}
						isLoading={isLoading}
						onLoadMore={onLoadMore}
					/>
				)
			})()}

			{/* Display total item count (or truncated count) when no items are selected */}
			{totalItems && !selectedItems.length ? (
				<span className='absolute bottom-2 right-4 text-[11px] font-medium text-neutral-400'>
					{truncatedAt
						? t('files-listing.item-count-truncated', {
								formattedCount: formatNumberI18n({n: truncatedAt, showDecimals: false}),
							})
						: t('files-listing.item-count', {
								count: totalItems,
								formattedCount: formatNumberI18n({n: totalItems, showDecimals: false}),
							})}
				</span>
			) : null}

			{/* Display selected count vs total (or truncated count) when items are selected */}
			{selectedItems.length > 0 && (
				<span className='absolute bottom-2 right-4 text-[11px] font-medium text-neutral-400'>
					{truncatedAt
						? t('files-listing.selected-count-truncated', {
								selectedCount: selectedItems.length,
								totalCount: truncatedAt,
							})
						: t('files-listing.selected-count', {
								selectedCount: selectedItems.length,
								totalCount: totalItems,
							})}
				</span>
			)}
		</Card>
	)
}

export function Listing({
	items,
	totalItems = 0,
	truncatedAt,
	selectableItems = [],
	isLoading,
	error,
	hasMore = false,
	onLoadMore = async () => false,
	CustomEmptyView,
	additionalContextMenuItems,
	enableFileDrop = true,
	marqueeScale = 1,
}: ListingProps) {
	const isTouchDevice = useIsTouchDevice()
	const scrollAreaRef = useRef<HTMLDivElement>(null)
	const {currentPath} = useNavigate()
	const isReadOnly = useIsFilesReadOnly()

	useFilesKeyboardShortcuts({items: selectableItems})

	const isEmpty = !isLoading && items.length === 0

	const content = (
		// Wrap in a flex column to ensure the context menu works
		<div className='flex flex-col'>
			<ListingContent
				items={items}
				totalItems={totalItems}
				truncatedAt={truncatedAt}
				hasMore={hasMore}
				onLoadMore={onLoadMore}
				scrollAreaRef={scrollAreaRef}
				isLoading={isLoading}
				error={error}
				isEmpty={isEmpty}
				CustomEmptyView={CustomEmptyView}
			/>
		</div>
	)

	// if read-only, return the content without the context menu
	const contentWithContextMenu = !isReadOnly ? (
		<ListingAndFileItemContextMenu menuItems={additionalContextMenuItems}>{content}</ListingAndFileItemContextMenu>
	) : (
		content
	)

	// For touch devices, disable marquee selection + file upload drop zone and droppable
	if (isTouchDevice) {
		return contentWithContextMenu
	}

	// For desktop, wrap in marquee selection, enable file upload drop zone and droppable
	return (
		<MarqueeSelection scrollAreaRef={scrollAreaRef} items={selectableItems} scale={marqueeScale}>
			{/* if read-only, return the content without the file upload drop zone */}
			{enableFileDrop && !isReadOnly ? (
				<FileUploadDropZone>
					<Droppable
						id={`files-listing-${currentPath}`}
						path={currentPath}
						className='relative flex h-full flex-col outline-none'
						dropOverClassName='bg-transparent'
					>
						{contentWithContextMenu}
					</Droppable>
				</FileUploadDropZone>
			) : (
				contentWithContextMenu
			)}
		</MarqueeSelection>
	)
}

function ErrorView({error}: {error: unknown}) {
	const message = error instanceof Error ? error.message : t('files-listing.error')

	const isNotFound =
		message.startsWith('ENOENT') ||
		message.startsWith('Cannot map') ||
		message.startsWith('[does-not-exist]') ||
		message.startsWith('EIO')

	return (
		<div className='flex h-full items-center justify-center p-4 text-center'>
			<AnimatedGroup preset='blur-slide' className='flex flex-col items-center gap-3'>
				<div className='flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50/80'>
					<FolderX className='h-7 w-7 text-red-400' strokeWidth={1.5} />
				</div>
				<span className='text-[13px] font-medium text-neutral-500'>
					{isNotFound ? t('files-listing.no-such-file') : message}
				</span>
			</AnimatedGroup>
		</div>
	)
}

function SkeletonPulse({className}: {className?: string}) {
	return <div className={`animate-pulse rounded-lg bg-neutral-100/80 ${className || ''}`} />
}

function LoadingView() {
	const {preferences} = usePreferences()
	const isGridView = preferences?.view === 'icons'

	if (isGridView) {
		return (
			<div className='p-6 pt-2'>
				<AnimatedGroup
					preset='fade'
					className='grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4'
				>
					{Array.from({length: 12}).map((_, i) => (
						<div key={i} className='flex flex-col items-center gap-2.5 rounded-[20px] p-3'>
							<SkeletonPulse className='h-[72px] w-[72px] rounded-2xl' />
							<SkeletonPulse className='h-3 w-16' />
						</div>
					))}
				</AnimatedGroup>
			</div>
		)
	}

	return (
		<div className='p-6 pt-2'>
			<AnimatedGroup preset='fade' className='flex flex-col gap-1'>
				{Array.from({length: 10}).map((_, i) => (
					<div key={i} className='flex items-center gap-3 rounded-lg px-2 py-2'>
						<SkeletonPulse className='h-5 w-5 shrink-0' />
						<SkeletonPulse className='h-3.5 w-[40%]' />
						<div className='ml-auto flex items-center gap-4'>
							<SkeletonPulse className='hidden h-3 w-20 lg:block' />
							<SkeletonPulse className='hidden h-3 w-12 lg:block' />
						</div>
					</div>
				))}
			</AnimatedGroup>
		</div>
	)
}

function EmptyView() {
	return (
		<div className='flex h-full items-center justify-center p-4 text-center'>
			<AnimatedGroup preset='blur-slide' className='flex flex-col items-center gap-4'>
				<div className='flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100/80'>
					<TbFolder className='h-8 w-8 text-neutral-400' strokeWidth={1.5} />
				</div>
				<p className='text-[13px] font-medium text-neutral-500'>{t('files-listing.empty')}</p>
			</AnimatedGroup>
		</div>
	)
}
