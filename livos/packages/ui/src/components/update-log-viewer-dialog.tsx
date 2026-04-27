// Phase 33 Plan 33-03 — Update log viewer dialog (OBS-03 surface).
//
// Modal that opens when the user clicks a row in the Past Deploys table.
// On open: fetches the last 500 lines of the deploy's .log file via the
// readUpdateLog admin tRPC route (full=false). The Download button uses
// the vanilla trpcClient to fetch the FULL log (full=true), then triggers
// a browser download via Blob → anchor.click().
//
// Backend contract (Plan 33-01):
//   readUpdateLog({filename, full}): {filename, content, truncated, totalLines?}
//   - filename MUST be a basename (the 3-layer guard rejects paths)
//   - tail mode: content = last 500 lines, truncated=true if file had >500
//   - full mode: content = entire file (capped at 50MB upstream — R-04)
//
// Plan 33-03 deviations from research skeleton:
//   - DialogScrollableContent in this repo wraps a ScrollArea and takes
//     a `showClose` prop — different shape than the research skeleton
//     assumed. Falls back to the inline `max-h-[60vh] overflow-y-auto`
//     wrapper inside DialogContent (per the plan's <action> note).
//   - Adds null-safety on `tailQ.error.message` so a TRPCClientError
//     without a message string doesn't blow up the render.

import {useState} from 'react'

import {Button} from '@/shadcn-components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/shadcn-components/ui/dialog'
import {trpcClient, trpcReact} from '@/trpc/trpc'

export type UpdateLogViewerDialogProps = {
	filename: string
	open: boolean
	onOpenChange: (o: boolean) => void
}

export function UpdateLogViewerDialog({filename, open, onOpenChange}: UpdateLogViewerDialogProps) {
	const tailQ = trpcReact.system.readUpdateLog.useQuery(
		{filename, full: false},
		{enabled: open, staleTime: Infinity, retry: false},
	)
	const [downloading, setDownloading] = useState(false)

	const handleDownload = async () => {
		setDownloading(true)
		try {
			const full = await trpcClient.system.readUpdateLog.query({filename, full: true})
			const blob = new Blob([full.content], {type: 'text/plain'})
			const url = URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			a.download = filename
			document.body.appendChild(a)
			a.click()
			document.body.removeChild(a)
			URL.revokeObjectURL(url)
		} finally {
			setDownloading(false)
		}
	}

	// Defensive truncated banner extraction — backend guarantees totalLines
	// when truncated:true, but the typed shape is union, so widen via cast.
	const truncated = tailQ.data?.truncated === true
	const totalLines = (tailQ.data as {totalLines?: number} | undefined)?.totalLines

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-[900px]'>
				<DialogHeader>
					<DialogTitle className='font-mono text-body-sm break-all'>{filename}</DialogTitle>
				</DialogHeader>
				<div className='max-h-[60vh] overflow-y-auto'>
					<pre className='whitespace-pre-wrap break-words bg-surface-1 p-3 text-caption font-mono leading-tight'>
						{tailQ.isLoading
							? 'Loading…'
							: tailQ.error
								? `Error: ${tailQ.error.message ?? 'unknown'}`
								: (tailQ.data?.content ?? '')}
					</pre>
					{truncated && (
						<p className='mt-2 px-3 text-caption text-text-tertiary'>
							Showing last 500 of {totalLines ?? '?'} lines.
						</p>
					)}
				</div>
				<DialogFooter>
					<Button onClick={handleDownload} disabled={downloading || tailQ.isLoading}>
						{downloading ? 'Downloading…' : 'Download full log'}
					</Button>
					<Button variant='secondary' onClick={() => onOpenChange(false)}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
