// Phase 46 Plan 46-04 — JailStatusCard (FR-F2B-01 + FR-F2B-02).
//
// Per-jail card showing:
//   - 4 chips: currentlyFailed / totalFailed / currentlyBanned / totalBanned
//   - Banned IP table with columns: IP | Last Attempted User | Last Attempt | Action
//   - Per-row Unban button (variant='outline' size='sm') triggering onUnbanClick
//
// FR-F2B-02 sub-issue #3: backend may not always supply lastAttemptedUser
// (auth.log may be unreadable on dev hosts). Render `—` gracefully when
// undefined — see Plan 03 SUMMARY decisions.

import {formatDistanceToNow, parseISO} from 'date-fns'

import {Badge} from '@/shadcn-components/ui/badge'
import {Button} from '@/shadcn-components/ui/button'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/shadcn-components/ui/table'

export interface BannedIp {
	ip: string
	lastAttemptedUser?: string | null
	lastAttemptedAt?: string | null
}

export interface JailStatus {
	currentlyFailed: number
	totalFailed: number
	currentlyBanned: number
	totalBanned: number
	bannedIps: BannedIp[]
}

interface JailStatusCardProps {
	jail: string
	status: JailStatus
	onUnbanClick: (ip: string, lastAttemptedUser?: string | null, lastAttemptedAt?: string | null) => void
}

function safeFormatRelative(iso: string | undefined | null): string {
	if (!iso) return '—'
	try {
		return formatDistanceToNow(parseISO(iso), {addSuffix: true})
	} catch {
		return iso
	}
}

export function JailStatusCard({jail, status, onUnbanClick}: JailStatusCardProps) {
	const {currentlyFailed, totalFailed, currentlyBanned, totalBanned, bannedIps} = status

	return (
		<div className='flex flex-col gap-3 rounded-radius-md border border-border-default bg-surface-base p-4'>
			{/* Header: jail name + counts chips */}
			<div className='flex flex-wrap items-center gap-2'>
				<h3 className='text-body font-medium text-text-primary'>{jail}</h3>
				<Badge variant='outline'>currently failed: {currentlyFailed}</Badge>
				<Badge variant='outline'>total failed: {totalFailed}</Badge>
				<Badge variant='destructive'>currently banned: {currentlyBanned}</Badge>
				<Badge variant='outline'>total banned: {totalBanned}</Badge>
			</div>

			{/* Banned IPs table */}
			{bannedIps.length === 0 ? (
				<div className='py-3 text-body-sm text-text-tertiary italic'>
					No IPs currently banned in {jail}.
				</div>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Banned IP</TableHead>
							<TableHead>Last Attempted User</TableHead>
							<TableHead>Last Attempt</TableHead>
							<TableHead className='text-right'>Action</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{bannedIps.map((row) => (
							<TableRow key={row.ip}>
								<TableCell className='font-mono'>{row.ip}</TableCell>
								<TableCell>{row.lastAttemptedUser ?? '—'}</TableCell>
								<TableCell title={row.lastAttemptedAt ?? ''}>
									{safeFormatRelative(row.lastAttemptedAt ?? undefined)}
								</TableCell>
								<TableCell className='text-right'>
									<Button
										variant='default'
										size='sm'
										onClick={() => onUnbanClick(row.ip, row.lastAttemptedUser, row.lastAttemptedAt)}
									>
										Unban
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</div>
	)
}
