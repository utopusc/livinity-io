/**
 * Phase 198-03 Task 2 — Item Carousel tool-ui primitive.
 *
 * Renders a horizontally-scrollable list of comparison cards (image +
 * title + bullet list). Uses native CSS scroll-snap rather than embla
 * to keep this primitive self-contained (no embla wiring in this Wave 2
 * scaffold — Plan 198-07 may upgrade later).
 *
 * T-198-04 mitigation: ZERO raw HTML injection.
 * T-198-06 mitigation: arbitrary item count is fine — native scroll
 * does NOT mount all items at once visually; no virtualization needed.
 */

export type CarouselItem = {
	title: string
	imageUrl?: string
	subtitle?: string
	bullets?: string[]
}

export type ItemCarouselProps = {
	items: CarouselItem[]
}

export function ItemCarousel({items}: ItemCarouselProps) {
	if (!items || items.length === 0) {
		return (
			<div className='rounded-lg border bg-muted/30 p-4 text-muted-foreground text-sm'>
				No items to compare.
			</div>
		)
	}

	return (
		<div className='-mx-2 flex snap-x snap-mandatory gap-3 overflow-x-auto px-2 pb-2'>
			{items.map((item, idx) => (
				<div
					key={`${item.title}-${idx}`}
					className='flex w-64 shrink-0 snap-start flex-col overflow-hidden rounded-xl border bg-card'
				>
					{item.imageUrl && (
						<div className='aspect-video w-full overflow-hidden bg-muted'>
							<img
								src={item.imageUrl}
								alt={item.title}
								loading='lazy'
								className='h-full w-full object-cover'
							/>
						</div>
					)}
					<div className='space-y-1 p-3'>
						<div className='font-medium text-sm'>{item.title}</div>
						{item.subtitle && (
							<div className='text-muted-foreground text-xs'>{item.subtitle}</div>
						)}
						{item.bullets && item.bullets.length > 0 && (
							<ul className='mt-2 list-disc space-y-0.5 pl-4 text-muted-foreground text-xs'>
								{item.bullets.map((b, bIdx) => (
									<li key={bIdx}>{b}</li>
								))}
							</ul>
						)}
					</div>
				</div>
			))}
		</div>
	)
}

export default ItemCarousel
