// Phase 23 AID-02 — AlertsBell dropdown.
//
// Mounted in the Server Control header next to <EnvironmentSelector />.
// Shows a bell icon with a red badge when un-dismissed alerts exist;
// click opens a 320px dropdown panel listing the latest 10 alerts with
// per-row Dismiss buttons + a header "Dismiss all" action.
//
// Severity colour map: critical=red, warning=amber, info=blue.
// Time uses date-fns formatDistanceToNow (already established in agents-panel.tsx).

import {IconBell, IconX} from '@tabler/icons-react'
import {formatDistanceToNow} from 'date-fns'

import {useAiAlerts} from '@/hooks/use-ai-alerts'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '@/shadcn-components/ui/dropdown-menu'
import {Button} from '@/shadcn-components/ui/button'
import {cn} from '@/shadcn-lib/utils'

const SEVERITY_DOT: Record<string, string> = {
	critical: 'bg-red-500',
	warning: 'bg-amber-500',
	info: 'bg-blue-500',
}

const VISIBLE_LIMIT = 10

function safeTimeAgo(iso: string): string {
	try {
		return formatDistanceToNow(new Date(iso), {addSuffix: true})
	} catch {
		return iso
	}
}

export function AlertsBell() {
	const {alerts, unreadCount, isLoading, dismissAlert, dismissAllAlerts, isDismissing} =
		useAiAlerts()

	const visible = alerts.slice(0, VISIBLE_LIMIT)
	const overflow = Math.max(0, alerts.length - VISIBLE_LIMIT)
	const badgeText = unreadCount > 9 ? '9+' : String(unreadCount)

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type='button'
					aria-label={
						unreadCount > 0
							? `AI Alerts (${unreadCount} un-dismissed)`
							: 'AI Alerts (none)'
					}
					className='relative inline-flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-white/5 hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40'
				>
					<IconBell size={18} />
					{unreadCount > 0 && (
						<span className='absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white'>
							{badgeText}
						</span>
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align='end' className='w-[320px] p-0'>
				{/* Header */}
				<div className='flex items-center justify-between border-b border-border-subtle px-3 py-2'>
					<div className='flex items-center gap-2'>
						<span className='text-sm font-semibold text-text-primary'>AI Alerts</span>
						{unreadCount > 0 && (
							<span className='inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-text-tertiary/15 px-1.5 text-xs text-text-secondary'>
								{unreadCount}
							</span>
						)}
					</div>
					<Button
						type='button'
						variant='ghost'
						size='sm'
						disabled={unreadCount === 0 || isDismissing}
						onClick={() => dismissAllAlerts()}
						className='h-7 px-2 text-xs'
					>
						Dismiss all
					</Button>
				</div>

				{/* List */}
				<div className='max-h-[420px] overflow-y-auto'>
					{isLoading ? (
						<div className='py-8 text-center text-xs text-text-tertiary'>Loading…</div>
					) : visible.length === 0 ? (
						<div className='py-8 text-center text-xs text-text-tertiary'>No active alerts</div>
					) : (
						<ul className='divide-y divide-border-subtle/50'>
							{visible.map((a) => (
								<li key={a.id} className='flex items-start gap-2 px-3 py-2.5'>
									<span
										className={cn(
											'mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full',
											SEVERITY_DOT[a.severity] ?? 'bg-text-tertiary',
										)}
										aria-hidden
									/>
									<div className='min-w-0 flex-1'>
										<div className='flex items-baseline justify-between gap-2'>
											<span className='truncate font-mono text-xs text-text-primary'>
												{a.containerName}
											</span>
											<span className='shrink-0 text-[10px] text-text-tertiary'>
												{safeTimeAgo(a.createdAt)}
											</span>
										</div>
										<p
											className='mt-0.5 line-clamp-2 break-words text-[12px] leading-snug text-text-secondary'
											title={a.message}
										>
											{a.message}
										</p>
									</div>
									<button
										type='button'
										aria-label={`Dismiss alert for ${a.containerName}`}
										disabled={isDismissing}
										onClick={() => dismissAlert(a.id)}
										className='ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-tertiary hover:bg-white/5 hover:text-text-primary disabled:opacity-40'
									>
										<IconX size={14} />
									</button>
								</li>
							))}
						</ul>
					)}
				</div>

				{/* Footer */}
				{overflow > 0 && (
					<div className='border-t border-border-subtle px-3 py-1.5 text-center text-[11px] text-text-tertiary'>
						Showing {VISIBLE_LIMIT} of {alerts.length} alerts
					</div>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
