/**
 * Phase 198-03 Task 2 — Data Table tool-ui primitive.
 *
 * Renders an array of row objects as an HTML table using the shadcn
 * Table primitives. Columns are derived from the first row's keys
 * unless an explicit `columns` prop is provided.
 *
 * T-198-04 mitigation: ZERO raw HTML injection — JSON.stringify
 * + React text interpolation for non-primitive cells.
 * T-198-06 mitigation: VIRTUALIZATION via slice(0, INITIAL_PAGE) and a
 * "Show more" button — avoids rendering 1000+ row blobs.
 */

import {useState} from 'react'

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'

const INITIAL_PAGE = 50

export type DataTableProps = {
	rows: Array<Record<string, unknown>>
	columns?: string[]
}

function renderCell(value: unknown): string {
	if (value === null || value === undefined) return ''
	if (typeof value === 'string') return value
	if (typeof value === 'number' || typeof value === 'boolean') return String(value)
	try {
		return JSON.stringify(value)
	} catch {
		return String(value)
	}
}

export function DataTable({rows, columns}: DataTableProps) {
	const [expanded, setExpanded] = useState(false)

	if (!rows || rows.length === 0) {
		return (
			<div className='rounded-lg border bg-muted/30 p-4 text-muted-foreground text-sm'>
				No rows returned.
			</div>
		)
	}

	const cols =
		columns && columns.length > 0
			? columns
			: Array.from(new Set(rows.flatMap((r) => Object.keys(r))))

	const visibleRows = expanded ? rows : rows.slice(0, INITIAL_PAGE)
	const hiddenCount = Math.max(0, rows.length - visibleRows.length)

	return (
		<div className='space-y-2'>
			<div className='overflow-hidden rounded-lg border'>
				<Table>
					<TableHeader>
						<TableRow>
							{cols.map((c) => (
								<TableHead key={c} className='font-medium text-xs uppercase'>
									{c}
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{visibleRows.map((row, idx) => (
							<TableRow key={idx}>
								{cols.map((c) => (
									<TableCell key={c} className='align-top text-sm'>
										{renderCell(row[c])}
									</TableCell>
								))}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
			{hiddenCount > 0 && (
				<button
					type='button'
					onClick={() => setExpanded(true)}
					className='rounded-md border bg-card px-3 py-1 text-sm hover:bg-muted'
				>
					Show {hiddenCount} more row{hiddenCount === 1 ? '' : 's'}
				</button>
			)}
		</div>
	)
}

export default DataTable
