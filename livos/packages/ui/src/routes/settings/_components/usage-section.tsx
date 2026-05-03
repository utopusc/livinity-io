/**
 * Phase 44 Plan 44-04 — Top-level Usage section for Settings > AI Configuration.
 *
 * Renders:
 *  - Banner (conditional via D-44-10 thresholds)
 *  - Phase 62 Plan 62-05: "Filter by API key" Select dropdown (FR-BROKER-E2-02)
 *  - 3 stat cards (today / cumulative prompt / cumulative completion)
 *  - Last-30-days BarChart
 *  - Per-app sortable table
 *  - "View as admin" toggle for admins (probe-gated — non-admins see nothing)
 *
 * The admin probe pattern is per AUDIT.md Section 3 + Plan 44-04: invoke
 * usage.getAll silently with retry:false; if it succeeds the user is admin
 * and the toggle renders; if it fails (FORBIDDEN), the toggle is hidden.
 * The backend tRPC adminProcedure is the authoritative gate (Plan 44-03 T4).
 *
 * Phase 62 Plan 62-05 — FR-BROKER-E2-02 frontend half:
 *   - Select dropdown above the chart/table groups options as
 *     "All keys" + one per key from apiKeys.list (Phase 59).
 *   - Selected apiKeyId is passed to usage.getMine.useQuery so chart + table
 *     refresh with filtered data; admin view (AdminCrossUserView) has its
 *     own dropdown sourced from apiKeys.listAll.
 *   - Last selection persisted via useUsageFilter (localStorage key
 *     'livinity:usage:filter:apiKeyId' — see use-usage-filter.ts).
 *   - Revoked keys still appear in the dropdown with a "(revoked)" suffix
 *     so users can review historical attribution (RESEARCH.md Pitfall 5).
 *   - When a filter is active and yields zero rows we render the empty
 *     copy "No usage recorded for this key." in place of the chart + table.
 */

import {useState} from 'react'
import {TbActivity, TbChartBar, TbLoader2} from 'react-icons/tb'

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/shadcn-components/ui/select'
import {trpcReact} from '@/trpc/trpc'

import {UsageBanner} from './usage-banner'
import {PerAppTable} from './per-app-table'
import {DailyCountsChart} from './daily-counts-chart'
import {AdminCrossUserView} from './admin-cross-user-view'
import {useUsageFilter} from './use-usage-filter'

// Phase 59 contract: trpcReact.apiKeys.list returns snake_case rows
// (verified against api-keys/routes.ts list resolver — same shape that
// ApiKeysSection consumes).
interface KeyOption {
	id: string
	key_prefix: string
	name: string
	revoked_at: Date | string | null
}

export function UsageSection() {
	const [showAdminView, setShowAdminView] = useState(false)

	// FR-BROKER-E2-02 — apiKeyId filter (persisted via localStorage).
	const {filter, setFilter} = useUsageFilter()
	const keysQ = trpcReact.apiKeys.list.useQuery()

	const myUsageQ = trpcReact.usage.getMine.useQuery(
		{apiKeyId: filter ?? undefined},
		{
			refetchInterval: 30_000, // poll every 30s so banner reflects fresh today_count
		},
	)

	// Admin probe: silently invoke getAll once. Failure (FORBIDDEN) means
	// non-admin → toggle hidden. Success means admin → toggle visible.
	// retry:false + refetchOnWindowFocus:false avoids spam.
	const adminProbeQ = trpcReact.usage.getAll.useQuery(undefined, {
		retry: false,
		refetchOnWindowFocus: false,
	})
	const isAdmin = adminProbeQ.isSuccess

	if (myUsageQ.isLoading) {
		return (
			<div className='space-y-4'>
				<h2 className='text-body font-semibold flex items-center gap-2'>
					<TbActivity className='size-4' /> Usage
				</h2>
				<div className='flex items-center gap-2 text-body-sm text-text-secondary'>
					<TbLoader2 className='size-4 animate-spin' /> Loading usage…
				</div>
			</div>
		)
	}

	if (myUsageQ.isError || !myUsageQ.data) {
		return (
			<div className='space-y-4'>
				<h2 className='text-body font-semibold flex items-center gap-2'>
					<TbActivity className='size-4' /> Usage
				</h2>
				<div className='text-body-sm text-text-secondary italic'>Usage data unavailable.</div>
			</div>
		)
	}

	const {stats, today_count, banner} = myUsageQ.data
	const lastThrottleAt = banner.lastThrottleAt ? new Date(banner.lastThrottleAt) : null

	const keyOptions: KeyOption[] = (keysQ.data ?? []) as KeyOption[]
	const isFilterActive = filter !== null
	const isFilterEmpty =
		isFilterActive &&
		stats.per_app.length === 0 &&
		stats.daily_last_30.every((d) => d.count === 0)

	return (
		<div className='space-y-4'>
			<div className='flex items-center justify-between'>
				<h2 className='text-body font-semibold flex items-center gap-2'>
					<TbActivity className='size-4' /> Usage
				</h2>
				{isAdmin && (
					<button
						type='button'
						onClick={() => setShowAdminView((v) => !v)}
						className='text-caption text-text-secondary hover:text-text-primary underline-offset-2 hover:underline'
					>
						{showAdminView ? 'Show my usage' : 'View as admin'}
					</button>
				)}
			</div>

			{showAdminView && isAdmin ? (
				<AdminCrossUserView />
			) : (
				<>
					{/* FR-BROKER-E2-02 filter dropdown — above banner; persists via useUsageFilter. */}
					<div className='flex items-center justify-between'>
						<span className='text-caption text-text-secondary'>Filter by API key</span>
						<Select
							value={filter ?? 'all'}
							onValueChange={(v) => setFilter(v === 'all' ? null : v)}
						>
							<SelectTrigger className='w-48'>
								<SelectValue placeholder='All keys' />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='all'>All keys</SelectItem>
								{keyOptions.map((k) => (
									<SelectItem key={k.id} value={k.id}>
										{k.name} ({k.key_prefix})
										{k.revoked_at ? ' (revoked)' : ''}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<UsageBanner
						state={banner.state}
						todayCount={banner.todayCount}
						dailyCap={banner.dailyCap}
						tier={banner.tier}
						lastThrottleAt={lastThrottleAt}
					/>

					<div className='grid grid-cols-3 gap-2'>
						<StatCard
							label='Today'
							value={`${today_count} / ${banner.dailyCap}`}
							sub={`${(banner.percentUsed * 100).toFixed(0)}% of ${banner.tier} cap`}
						/>
						<StatCard
							label='Prompt tokens (30d)'
							value={stats.cumulative_prompt_tokens.toLocaleString()}
						/>
						<StatCard
							label='Completion tokens (30d)'
							value={stats.cumulative_completion_tokens.toLocaleString()}
						/>
					</div>

					{isFilterEmpty ? (
						<div className='rounded-radius-md border border-border-default bg-surface-base p-4 text-body-sm text-text-secondary italic'>
							No usage recorded for this key.
						</div>
					) : (
						<>
							{stats.daily_last_30.length > 0 && (
								<div className='rounded-radius-sm border border-border-default bg-surface-raised p-3'>
									<div className='text-caption text-text-secondary mb-2 flex items-center gap-1'>
										<TbChartBar className='size-3' /> Last 30 days (UTC)
									</div>
									<DailyCountsChart data={stats.daily_last_30} />
								</div>
							)}

							<div>
								<div className='text-caption text-text-secondary mb-2'>Per app</div>
								<PerAppTable
									rows={stats.per_app.map((p) => ({
										...p,
										last_used_at: p.last_used_at as unknown as string,
									}))}
								/>
							</div>
						</>
					)}
				</>
			)}
		</div>
	)
}

function StatCard({label, value, sub}: {label: string; value: string; sub?: string}) {
	return (
		<div className='rounded-radius-sm border border-border-default bg-surface-raised p-3'>
			<div className='text-caption text-text-secondary'>{label}</div>
			<div className='text-body font-medium text-text-primary mt-1'>{value}</div>
			{sub && <div className='text-caption text-text-secondary/70 mt-0.5'>{sub}</div>}
		</div>
	)
}
