/**
 * Phase 198-03 Task 2 — Image Gallery tool-ui primitive.
 *
 * Renders a responsive grid of images with optional names + descriptions.
 * Click an image to expand it fullscreen in a Dialog.
 *
 * SUBSET STRATEGY: written minimally instead of porting the multi-file
 * tool-ui upstream variant (which depends on shadcn Card/Avatar/Carousel
 * primitives + a Lightbox sibling component none of which exist here).
 * Plan 198-02 documented this fallback pattern. Public API
 * (`<ImageGallery items={...} />`) matches the contract used by Plan
 * 198-03's tool-renderers.tsx.
 *
 * T-198-04 mitigation: ZERO raw HTML injection — only React text
 * interpolation and standard `<img src>` attributes.
 * T-198-06 mitigation: caps at MAX_IMAGES (24) — rest are dropped with a
 * footer count.
 */

import {useState} from 'react'

import {Dialog, DialogContent, DialogTitle} from '@/shadcn-components/ui/dialog'

const MAX_IMAGES = 24

export type ImageGalleryItem = {
	name: string
	imageUrl: string
	description?: string
	lat?: number
	lng?: number
}

export type ImageGalleryProps = {
	items: ImageGalleryItem[]
}

export function ImageGallery({items}: ImageGalleryProps) {
	const [open, setOpen] = useState<ImageGalleryItem | null>(null)
	const visible = items.slice(0, MAX_IMAGES)
	const overflow = Math.max(0, items.length - MAX_IMAGES)

	if (visible.length === 0) {
		return (
			<div className='rounded-lg border bg-muted/30 p-4 text-muted-foreground text-sm'>
				No images returned.
			</div>
		)
	}

	return (
		<div className='space-y-2'>
			<div className='grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4'>
				{visible.map((item, idx) => (
					<button
						key={`${item.imageUrl}-${idx}`}
						type='button'
						onClick={() => setOpen(item)}
						className='group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring/40'
						aria-label={`Open ${item.name || 'image'} fullscreen`}
					>
						<div className='aspect-video w-full overflow-hidden bg-muted'>
							<img
								src={item.imageUrl}
								alt={item.name}
								loading='lazy'
								className='h-full w-full object-cover transition-transform group-hover:scale-105'
							/>
						</div>
						{(item.name || item.description) && (
							<div className='p-2'>
								{item.name && (
									<div className='line-clamp-1 font-medium text-sm'>{item.name}</div>
								)}
								{item.description && (
									<div className='line-clamp-2 text-muted-foreground text-xs'>
										{item.description}
									</div>
								)}
							</div>
						)}
					</button>
				))}
			</div>
			{overflow > 0 && (
				<div className='text-muted-foreground text-xs'>
					+{overflow} more not shown
				</div>
			)}

			<Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
				<DialogContent className='max-w-4xl'>
					<DialogTitle className='sr-only'>{open?.name ?? 'Image'}</DialogTitle>
					{open && (
						<div className='flex flex-col gap-3'>
							<img
								src={open.imageUrl}
								alt={open.name}
								className='max-h-[70vh] w-full rounded-lg object-contain'
							/>
							{(open.name || open.description) && (
								<div>
									{open.name && <div className='font-medium'>{open.name}</div>}
									{open.description && (
										<div className='text-muted-foreground text-sm'>
											{open.description}
										</div>
									)}
								</div>
							)}
						</div>
					)}
				</DialogContent>
			</Dialog>
		</div>
	)
}

export default ImageGallery
