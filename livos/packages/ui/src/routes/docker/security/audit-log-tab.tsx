// Phase 46 Plan 46-04 — AuditLogTab (FR-F2B-04).
//
// Read-side surface of the device_audit_log filtered by sentinel
// device_id='fail2ban-host' AND tool_name IN ('unban_ip','ban_ip','whitelist_ip').
// Backend wires this via Plan 03 listEvents (limit 1-200, default 50).
//
// Mirrors past-deploys-table.tsx structure: shadcn Table + relative timestamps
// + status Badge + safe formatters.

import {formatDistanceToNow, parseISO} from 'date-fns'

import {trpcReact} from '@/trpc/trpc'
import {Badge} from '@/shadcn-components/ui/badge'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/shadcn-components/ui/table'

type ActionKind = 'ban_ip' | 'unban_ip' | 'whitelist_ip' | string

const ACTION_VARIANT: Record<string, 'default' | 'primary' | 'destructive' | 'outline'> = {
	ban_ip: 'destructive',
	unban_ip: 'primary',
	whitelist_ip: 'outline',
}

function safeFormatRelative(iso: string | undefined | null): string {
	if (!iso) return '—'
	try {
		return formatDistanceToNow(parseISO(iso), {addSuffix: true})
	} catch {
		return iso
	}
}

export function AuditLogTab() {
	const eventsQuery = trpcReact.fail2ban.listEvents.useQuery(
		{limit: 50},
		{
			refetchInterval: 5_000,
			staleTime: 2_500,
			retry: false,
		},
	)

	if (eventsQuery.isLoading) {
		return <div className='py-4 text-text-tertiary text-body-sm'>Loading…</div>
	}
	if (eventsQuery.isError) {
		return (
			<div className='py-4 text-destructive2 text-body-sm'>
				Error: {eventsQuery.error?.message ?? 'unknown'}
			</div>
		)
	}
	const rows = (eventsQuery.data ?? []) as Array<Record<string, unknown>>
	if (rows.length === 0) {
		return <div className='py-4 text-text-tertiary text-body-sm'>No ban/unban events recorded yet.</div>
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>When</TableHead>
					<TableHead>Action</TableHead>
					<TableHead>Jail</TableHead>
					<TableHead>IP</TableHead>
					<TableHead>Admin</TableHead>
					<TableHead>Result</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row, i) => {
					const tsRaw = typeof row.ts === 'string' ? row.ts : undefined
					const action = (typeof row.action === 'string' ? row.action : 'unknown') as ActionKind
					const jail = typeof row.jail === 'string' ? row.jail : '—'
					const ip = typeof row.ip === 'string' ? row.ip : '—'
					const admin = typeof row.admin_username === 'string' && row.admin_username.length > 0 ? row.admin_username : '—'
					const success = row.success === true
					const errMsg = typeof row.error === 'string' ? row.error : null
					const variant = ACTION_VARIANT[action] ?? 'default'
					const key = `${tsRaw ?? 'no-ts'}-${action}-${ip}-${i}`
					let isoTitle = tsRaw ?? ''
					if (tsRaw) {
						try {
							isoTitle = `${tsRaw} (${new Date(tsRaw).toLocaleString()})`
						} catch {
							// keep raw
						}
					}
					return (
						<TableRow key={key}>
							<TableCell title={isoTitle}>{safeFormatRelative(tsRaw)}</TableCell>
							<TableCell>
								<Badge variant={variant}>{action}</Badge>
							</TableCell>
							<TableCell>{jail}</TableCell>
							<TableCell className='font-mono'>{ip}</TableCell>
							<TableCell>{admin}</TableCell>
							<TableCell>
								{success ? (
									<Badge variant='primary'>success</Badge>
								) : (
									<Badge variant='destructive' title={errMsg ?? undefined}>
										failed
									</Badge>
								)}
							</TableCell>
						</TableRow>
					)
				})}
			</TableBody>
		</Table>
	)
}
