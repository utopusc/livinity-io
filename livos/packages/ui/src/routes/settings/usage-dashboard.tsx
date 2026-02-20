/**
 * Usage Dashboard — Token usage and cost tracking for Settings.
 *
 * Shows overview cards (total tokens, sessions, cost), a daily bar chart
 * for the last 30 days, and per-model breakdown information.
 */

import {useState} from 'react'
import {TbChartBar, TbCoins, TbMessage, TbArrowUp, TbArrowDown, TbClock} from 'react-icons/tb'

import {Card} from '@/components/ui/card'
import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DailyUsage {
	date: string
	userId: string
	inputTokens: number
	outputTokens: number
	sessions: number
	turns: number
	toolCalls: number
	avgTtfbMs: number
	estimatedCostUsd: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
	return String(n)
}

function formatCost(n: number): string {
	if (n >= 100) return `$${n.toFixed(0)}`
	if (n >= 1) return `$${n.toFixed(2)}`
	return `$${n.toFixed(3)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function UsageDashboard() {
	const [days] = useState(30)

	const overviewQ = trpcReact.ai.getUsageOverview.useQuery(undefined, {
		refetchInterval: 30_000,
	})

	const dailyQ = trpcReact.ai.getUsageDaily.useQuery(
		{userId: 'default', days},
		{refetchInterval: 30_000},
	)

	const overview = overviewQ.data
	const daily = dailyQ.data?.daily || []

	// Reverse so oldest is first (for left-to-right chart)
	const chartData = [...daily].reverse()

	return (
		<div className='space-y-6'>
			{/* Overview Cards */}
			<div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
				<StatCard
					icon={TbChartBar}
					label='Total Tokens'
					value={formatTokens((overview?.totalInputTokens || 0) + (overview?.totalOutputTokens || 0))}
					subtitle={`${formatTokens(overview?.totalInputTokens || 0)} in / ${formatTokens(overview?.totalOutputTokens || 0)} out`}
					loading={overviewQ.isLoading}
				/>
				<StatCard
					icon={TbMessage}
					label='Sessions'
					value={String(overview?.totalSessions || 0)}
					subtitle={`${overview?.totalTurns || 0} total turns`}
					loading={overviewQ.isLoading}
				/>
				<StatCard
					icon={TbCoins}
					label='Est. Cost'
					value={formatCost(overview?.estimatedCostUsd || 0)}
					subtitle='Based on model pricing'
					loading={overviewQ.isLoading}
				/>
				<StatCard
					icon={TbClock}
					label='Active Users'
					value={String(overview?.activeUsers || 0)}
					subtitle='Tracked users'
					loading={overviewQ.isLoading}
				/>
			</div>

			{/* Daily Token Chart */}
			<Card className='!p-4'>
				<h3 className='text-body-md font-medium mb-4'>Daily Token Usage (Last {days} Days)</h3>
				{dailyQ.isLoading ? (
					<div className='flex items-center justify-center py-12 text-text-tertiary text-body-sm'>
						Loading chart data...
					</div>
				) : chartData.length === 0 || chartData.every((d) => d.inputTokens + d.outputTokens === 0) ? (
					<div className='flex items-center justify-center py-12 text-text-tertiary text-body-sm'>
						No usage data yet. Token tracking begins with your next AI session.
					</div>
				) : (
					<DailyChart data={chartData} />
				)}
			</Card>

			{/* Recent Days Table */}
			<Card className='!p-4'>
				<h3 className='text-body-md font-medium mb-4'>Recent Activity</h3>
				<div className='overflow-x-auto'>
					<table className='w-full text-body-sm'>
						<thead>
							<tr className='border-b border-border-default text-left text-text-secondary'>
								<th className='pb-2 pr-4 font-medium'>Date</th>
								<th className='pb-2 pr-4 font-medium text-right'>
									<span className='inline-flex items-center gap-1'>
										<TbArrowDown className='h-3 w-3' /> Input
									</span>
								</th>
								<th className='pb-2 pr-4 font-medium text-right'>
									<span className='inline-flex items-center gap-1'>
										<TbArrowUp className='h-3 w-3' /> Output
									</span>
								</th>
								<th className='pb-2 pr-4 font-medium text-right'>Sessions</th>
								<th className='pb-2 pr-4 font-medium text-right'>Turns</th>
								<th className='pb-2 pr-4 font-medium text-right'>Avg TTFB</th>
								<th className='pb-2 font-medium text-right'>Cost</th>
							</tr>
						</thead>
						<tbody>
							{daily.filter((d) => d.sessions > 0).length === 0 ? (
								<tr>
									<td colSpan={7} className='py-8 text-center text-text-tertiary'>
										No session data recorded yet.
									</td>
								</tr>
							) : (
								daily
									.filter((d) => d.sessions > 0)
									.slice(0, 14)
									.map((d) => (
										<tr key={d.date} className='border-b border-border-default/50'>
											<td className='py-2 pr-4 text-text-primary'>{d.date}</td>
											<td className='py-2 pr-4 text-right tabular-nums'>{formatTokens(d.inputTokens)}</td>
											<td className='py-2 pr-4 text-right tabular-nums'>{formatTokens(d.outputTokens)}</td>
											<td className='py-2 pr-4 text-right tabular-nums'>{d.sessions}</td>
											<td className='py-2 pr-4 text-right tabular-nums'>{d.turns}</td>
											<td className='py-2 pr-4 text-right tabular-nums'>{d.avgTtfbMs > 0 ? `${d.avgTtfbMs}ms` : '-'}</td>
											<td className='py-2 text-right tabular-nums'>{formatCost(d.estimatedCostUsd)}</td>
										</tr>
									))
							)}
						</tbody>
					</table>
				</div>
			</Card>

			{/* Model Pricing Reference */}
			<Card className='!p-4'>
				<h3 className='text-body-md font-medium mb-4'>Model Pricing Reference</h3>
				<div className='overflow-x-auto'>
					<table className='w-full text-body-sm'>
						<thead>
							<tr className='border-b border-border-default text-left text-text-secondary'>
								<th className='pb-2 pr-4 font-medium'>Model</th>
								<th className='pb-2 pr-4 font-medium text-right'>Input (per 1M)</th>
								<th className='pb-2 font-medium text-right'>Output (per 1M)</th>
							</tr>
						</thead>
						<tbody>
							<tr className='border-b border-border-default/50'>
								<td className='py-2 pr-4 text-text-primary'>Haiku</td>
								<td className='py-2 pr-4 text-right tabular-nums'>$0.25</td>
								<td className='py-2 text-right tabular-nums'>$1.25</td>
							</tr>
							<tr className='border-b border-border-default/50'>
								<td className='py-2 pr-4 text-text-primary'>Sonnet</td>
								<td className='py-2 pr-4 text-right tabular-nums'>$3.00</td>
								<td className='py-2 text-right tabular-nums'>$15.00</td>
							</tr>
							<tr>
								<td className='py-2 pr-4 text-text-primary'>Opus</td>
								<td className='py-2 pr-4 text-right tabular-nums'>$15.00</td>
								<td className='py-2 text-right tabular-nums'>$75.00</td>
							</tr>
						</tbody>
					</table>
					<p className='mt-3 text-body-xs text-text-tertiary'>
						Note: Cost estimates assume per-API pricing. Subscription plans (Claude Code) may have different billing.
					</p>
				</div>
			</Card>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({
	icon: Icon,
	label,
	value,
	subtitle,
	loading,
}: {
	icon: React.ComponentType<{className?: string}>
	label: string
	value: string
	subtitle: string
	loading?: boolean
}) {
	return (
		<Card className='!p-4'>
			<div className='flex items-start gap-3'>
				<div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-radius-sm bg-surface-2'>
					<Icon className='h-4 w-4 text-text-secondary' />
				</div>
				<div className='min-w-0'>
					<p className='text-body-xs text-text-secondary'>{label}</p>
					{loading ? (
						<div className='h-7 w-16 animate-pulse rounded bg-surface-2 mt-0.5' />
					) : (
						<p className='text-heading-lg font-semibold -tracking-2 tabular-nums'>{value}</p>
					)}
					<p className='text-body-xs text-text-tertiary mt-0.5 truncate'>{subtitle}</p>
				</div>
			</div>
		</Card>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS Bar Chart
// ─────────────────────────────────────────────────────────────────────────────

function DailyChart({data}: {data: DailyUsage[]}) {
	const maxTokens = Math.max(...data.map((d) => d.inputTokens + d.outputTokens), 1)

	return (
		<div className='flex items-end gap-[2px]' style={{height: 160}}>
			{data.map((d) => {
				const total = d.inputTokens + d.outputTokens
				const heightPct = Math.max((total / maxTokens) * 100, total > 0 ? 2 : 0)
				const inputPct = total > 0 ? (d.inputTokens / total) * 100 : 0
				const outputPct = total > 0 ? (d.outputTokens / total) * 100 : 0

				return (
					<div
						key={d.date}
						className='group relative flex-1 flex flex-col justify-end'
						style={{height: '100%'}}
					>
						{/* Tooltip on hover */}
						<div className='pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10'>
							<div className='rounded-radius-sm bg-surface-3 px-2 py-1.5 text-body-xs shadow-md whitespace-nowrap'>
								<div className='font-medium'>{d.date}</div>
								<div className='text-text-secondary'>
									{formatTokens(d.inputTokens)} in / {formatTokens(d.outputTokens)} out
								</div>
								{d.sessions > 0 && (
									<div className='text-text-tertiary'>
										{d.sessions} sessions | {formatCost(d.estimatedCostUsd)}
									</div>
								)}
							</div>
						</div>

						{/* Bar */}
						<div
							className={cn(
								'w-full rounded-t-sm transition-all duration-200 overflow-hidden',
								total === 0 ? 'bg-transparent' : 'group-hover:opacity-80'
							)}
							style={{height: `${heightPct}%`}}
						>
							{/* Output portion (top, lighter) */}
							<div
								className='w-full bg-blue-400/60'
								style={{height: `${outputPct}%`}}
							/>
							{/* Input portion (bottom, darker) */}
							<div
								className='w-full bg-blue-500'
								style={{height: `${inputPct}%`}}
							/>
						</div>
					</div>
				)
			})}
		</div>
	)
}

export default UsageDashboard
