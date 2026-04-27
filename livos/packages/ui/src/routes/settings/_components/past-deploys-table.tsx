// Phase 33 Plan 33-03 — Past Deploys table (OBS-02 surface).
//
// Renders the most recent 50 deploys (newest-first, sorted server-side
// by Plan 33-01) inside Settings > Software Update. Click a row to open
// the UpdateLogViewerDialog with the corresponding .log file's basename.
//
// Backend contract (Plan 33-01):
//   listUpdateHistory({limit}): Array<{
//     filename, timestamp, status, duration_ms?,
//     from_sha?, to_sha?, log_path?, reason?
//   }>
//   - Returns [] on ENOENT (dev hosts without /opt/livos/data/...)
//   - Skips corrupt JSON entries (defensive read)
//   - Sorted by timestamp descending
//
// Security (R-10 mitigation): JSON's `log_path` is the SERVER-absolute
// path. The UI MUST strip to basename before calling readUpdateLog —
// the readUpdateLog 3-layer guard rejects anything else with BAD_REQUEST.
// We use plain string ops (split('/').pop()) — no path-browserify dep
// needed.
//
// Edge cases handled:
//   - Loading state: shows "Loading…" placeholder
//   - Error state: shows the TRPC error message
//   - Empty state: shows "No deploys yet."
//   - Rows lacking log_path (e.g., precheck-failed before SHA known per
//     R-06 / O-08): non-clickable + opacity-80 to signal "no log link"
//   - Unknown status values: falls back to default Badge variant
//   - Bad timestamps: falls back to displaying the raw string

import {useState} from 'react'
import {formatDistanceToNow, parseISO} from 'date-fns'

import {trpcReact} from '@/trpc/trpc'
import {Badge} from '@/shadcn-components/ui/badge'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/shadcn-components/ui/table'

import {UpdateLogViewerDialog} from '@/components/update-log-viewer-dialog'

type DeployStatus = 'success' | 'failed' | 'rolled-back' | 'precheck-failed'

const STATUS_VARIANT: Record<DeployStatus, 'default' | 'primary' | 'destructive' | 'outline'> = {
	success: 'primary',
	failed: 'destructive',
	'rolled-back': 'destructive',
	'precheck-failed': 'outline',
}

function formatDuration(ms: number | undefined | null): string {
	if (typeof ms !== 'number' || ms < 0) return '—'
	const s = Math.round(ms / 1000)
	if (s < 60) return `${s}s`
	const m = Math.floor(s / 60)
	const rem = s % 60
	return `${m}m ${rem}s`
}

function safeFormatRelative(iso: string | undefined): string {
	if (!iso) return '—'
	try {
		return formatDistanceToNow(parseISO(iso), {addSuffix: true})
	} catch {
		return iso
	}
}

// R-10 mitigation: backend returns log_path as an absolute server path
// (e.g., /opt/livos/data/update-history/update-...log). The UI strips to
// basename before calling readUpdateLog (which expects basename per the
// 3-layer guard). Returns null when log_path is missing/empty so callers
// can render a non-clickable row.
function basenameFromLogPath(logPath: unknown): string | null {
	if (typeof logPath !== 'string' || logPath.length === 0) return null
	const parts = logPath.split('/')
	const base = parts[parts.length - 1]
	return base || null
}

export function PastDeploysTable() {
	const historyQ = trpcReact.system.listUpdateHistory.useQuery(
		{limit: 50},
		{
			refetchOnWindowFocus: true,
			staleTime: 30_000,
		},
	)
	const [openLog, setOpenLog] = useState<string | null>(null)

	if (historyQ.isLoading) {
		return <div className='py-4 text-text-tertiary text-body-sm'>Loading…</div>
	}
	if (historyQ.isError) {
		return (
			<div className='py-4 text-destructive2 text-body-sm'>
				Error: {historyQ.error?.message ?? 'unknown'}
			</div>
		)
	}
	const rows = (historyQ.data ?? []) as Array<Record<string, unknown>>
	if (rows.length === 0) {
		return <div className='py-4 text-text-tertiary text-body-sm'>No deploys yet.</div>
	}

	return (
		<>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>SHA</TableHead>
						<TableHead>When</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Duration</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row, i) => {
						const sha =
							typeof row.to_sha === 'string' && row.to_sha.length > 0
								? row.to_sha.slice(0, 7)
								: '—'
						const logName = basenameFromLogPath(row.log_path)
						const clickable = !!logName
						const tsRaw = typeof row.timestamp === 'string' ? row.timestamp : undefined
						let isoTitle = tsRaw ?? ''
						if (tsRaw) {
							try {
								isoTitle = `${tsRaw} (${new Date(tsRaw).toLocaleString()})`
							} catch {
								// keep raw timestamp on bad dates
							}
						}
						const statusStr = typeof row.status === 'string' ? row.status : 'unknown'
						const variant =
							(STATUS_VARIANT as Record<string, 'default' | 'primary' | 'destructive' | 'outline'>)[
								statusStr
							] ?? 'default'
						const key =
							typeof row.filename === 'string' && row.filename.length > 0
								? row.filename
								: `${tsRaw ?? 'no-ts'}-${statusStr}-${i}`
						return (
							<TableRow
								key={key}
								className={clickable ? 'cursor-pointer hover:bg-surface-2' : 'opacity-80'}
								onClick={clickable && logName ? () => setOpenLog(logName) : undefined}
							>
								<TableCell className='font-mono'>{sha}</TableCell>
								<TableCell title={isoTitle}>{safeFormatRelative(tsRaw)}</TableCell>
								<TableCell>
									<Badge variant={variant}>{statusStr}</Badge>
								</TableCell>
								<TableCell>
									{formatDuration(
										typeof row.duration_ms === 'number' ? row.duration_ms : undefined,
									)}
								</TableCell>
							</TableRow>
						)
					})}
				</TableBody>
			</Table>
			{openLog && (
				<UpdateLogViewerDialog
					filename={openLog}
					open={!!openLog}
					onOpenChange={(o) => {
						if (!o) setOpenLog(null)
					}}
				/>
			)}
		</>
	)
}
