/**
 * Phase 198-03 Task 2 — Sources tool-ui primitive.
 *
 * Renders a vertical list of web_search source rows: favicon + title +
 * URL. Each row is a link opening in a new tab. Snippet rendered
 * underneath the title when present.
 *
 * T-198-04 mitigation: ZERO raw HTML injection.
 */

export type SourceItem = {
	title: string
	url: string
	snippet?: string
	favicon?: string
}

export type SourcesProps = {
	sources: SourceItem[]
}

export function Sources({sources}: SourcesProps) {
	if (!sources || sources.length === 0) {
		return (
			<div className='rounded-lg border bg-muted/30 p-4 text-muted-foreground text-sm'>
				No sources returned.
			</div>
		)
	}

	return (
		<div className='space-y-2 rounded-lg border bg-card p-2'>
			{sources.map((s, idx) => {
				let host = ''
				try {
					host = new URL(s.url).host
				} catch {
					host = s.url
				}
				return (
					<a
						key={`${s.url}-${idx}`}
						href={s.url}
						target='_blank'
						rel='noopener noreferrer'
						className='block rounded-md p-2 transition hover:bg-muted'
					>
						<div className='flex items-center gap-2 text-muted-foreground text-xs'>
							{s.favicon && (
								<img
									src={s.favicon}
									alt=''
									width={14}
									height={14}
									loading='lazy'
									className='inline-block h-3.5 w-3.5'
								/>
							)}
							<span className='line-clamp-1'>{host}</span>
						</div>
						<div className='line-clamp-1 font-medium text-sm'>{s.title}</div>
						{s.snippet && (
							<div className='line-clamp-2 text-muted-foreground text-xs'>
								{s.snippet}
							</div>
						)}
					</a>
				)
			})}
		</div>
	)
}

export default Sources
