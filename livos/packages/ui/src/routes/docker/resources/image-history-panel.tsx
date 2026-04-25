// Phase 26 Plan 26-01 — Image layer history panel.
//
// Verbatim port of legacy routes/server-control/index.tsx:1294-1359 (deleted
// Phase 27-02). Renders its own <Table> (Phase 19 D-08 fix — when the panel
// was inside a parent Tabs > TabsContent, nesting Tables broke the row
// striping; rendering its own Table here keeps the fix intact).
//
// Imports adjusted to the new resources/ paths for formatBytes +
// formatRelativeDate.

import {IconRefresh} from '@tabler/icons-react'

import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/shadcn-components/ui/table'
import {trpcReact} from '@/trpc/trpc'

import {formatBytes} from './format-bytes'
import {formatRelativeDate} from './format-relative-date'

export function ImageHistoryPanel({imageId}: {imageId: string}) {
	const historyQuery = trpcReact.docker.imageHistory.useQuery({id: imageId})

	if (historyQuery.isLoading) {
		return (
			<div className='flex items-center gap-2 px-4 py-3 text-sm text-text-tertiary'>
				<IconRefresh size={14} className='animate-spin' />
				Loading layer history...
			</div>
		)
	}

	if (historyQuery.isError || !historyQuery.data) {
		return (
			<div className='px-4 py-3'>
				<p className='text-sm text-red-400'>Failed to load layer history</p>
			</div>
		)
	}

	if (historyQuery.data.length === 0) {
		return (
			<div className='px-4 py-3'>
				<p className='text-sm text-text-tertiary'>No layer history available.</p>
			</div>
		)
	}

	return (
		<div className='overflow-x-auto'>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead colSpan={2} className='pl-4'>Layer command</TableHead>
						<TableHead>Size</TableHead>
						<TableHead className='text-right pr-4'>Created</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{historyQuery.data.map((layer, idx) => (
						<TableRow key={`${imageId}-layer-${idx}`} className='bg-surface-1/50'>
							<TableCell className='pl-4 pr-4' colSpan={2}>
								<span
									className='block truncate max-w-[500px] font-mono text-xs text-text-secondary'
									title={layer.createdBy}
								>
									{layer.createdBy || '(empty)'}
								</span>
							</TableCell>
							<TableCell>
								<span className='text-xs text-text-tertiary'>
									{layer.size > 0 ? formatBytes(layer.size) : '0 B'}
								</span>
							</TableCell>
							<TableCell className='text-right pr-4'>
								<span className='text-xs text-text-tertiary'>
									{formatRelativeDate(layer.created)}
								</span>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	)
}
