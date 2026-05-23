/**
 * Phase 198-03 Task 2 — Link Preview tool-ui primitive.
 *
 * OpenGraph-style card: thumbnail + title + description + URL with
 * favicon. Click anywhere navigates the URL (new tab).
 *
 * T-198-04 mitigation: ZERO raw HTML injection.
 */

export type LinkPreviewProps = {
	url: string
	title: string
	description?: string
	image?: string
	favicon?: string
}

export function LinkPreview({url, title, description, image, favicon}: LinkPreviewProps) {
	let host = ''
	try {
		host = new URL(url).host
	} catch {
		host = url
	}

	return (
		<a
			href={url}
			target='_blank'
			rel='noopener noreferrer'
			className='block overflow-hidden rounded-xl border bg-card transition hover:shadow-md'
		>
			<div className='flex'>
				{image && (
					<div className='w-32 shrink-0 bg-muted'>
						<img
							src={image}
							alt={title}
							loading='lazy'
							className='h-full w-full object-cover'
						/>
					</div>
				)}
				<div className='flex flex-1 flex-col justify-center gap-1 p-3'>
					<div className='flex items-center gap-2 text-muted-foreground text-xs'>
						{favicon && (
							<img
								src={favicon}
								alt=''
								width={14}
								height={14}
								loading='lazy'
								className='inline-block h-3.5 w-3.5'
							/>
						)}
						<span className='line-clamp-1'>{host}</span>
					</div>
					<div className='line-clamp-2 font-medium text-sm'>{title}</div>
					{description && (
						<div className='line-clamp-2 text-muted-foreground text-xs'>
							{description}
						</div>
					)}
				</div>
			</div>
		</a>
	)
}

export default LinkPreview
