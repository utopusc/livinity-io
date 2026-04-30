/**
 * Phase 44 Plan 44-04 — Rate-limit banner.
 *
 * State transitions per D-44-10:
 *  - 'none'     → renders null (banner hidden)
 *  - 'warn'     → yellow banner, "X/Y daily messages used (tier)" + reset note
 *  - 'critical' → red banner, "Subscription cap reached" + last-throttle ts
 *
 * Reset copy is pinned to "midnight UTC" (D-44-09 + planner guard) — server
 * uses CURRENT_DATE AT TIME ZONE 'UTC' for the daily count, so the user's
 * local clock is irrelevant for cap rollover. Date formatting uses
 * {timeZone: 'UTC'} option to avoid local-TZ confusion.
 */

import {TbAlertCircle, TbAlertTriangle} from 'react-icons/tb'

type BannerProps = {
	state: 'none' | 'warn' | 'critical'
	todayCount: number
	dailyCap: number
	tier: string
	lastThrottleAt: Date | null
}

export function UsageBanner({state, todayCount, dailyCap, tier, lastThrottleAt}: BannerProps) {
	if (state === 'none') return null

	if (state === 'warn') {
		return (
			<div className='flex items-start gap-2 rounded-radius-sm border border-amber-500/30 bg-amber-500/10 p-3 text-body-sm text-amber-300'>
				<TbAlertTriangle className='mt-0.5 size-4 shrink-0' />
				<div>
					<div className='font-medium'>
						{todayCount}/{dailyCap} daily messages used ({tier} tier)
					</div>
					<div className='text-amber-200/80 text-caption mt-0.5'>Resets at midnight UTC.</div>
				</div>
			</div>
		)
	}

	// critical: 100% reached or recent 429
	const lastThrottleCopy = lastThrottleAt
		? `Last 429 at ${lastThrottleAt.toLocaleString(undefined, {timeZone: 'UTC'})} UTC. Resets at midnight UTC.`
		: 'Resets at midnight UTC.'

	return (
		<div className='flex items-start gap-2 rounded-radius-sm border border-red-500/30 bg-red-500/10 p-3 text-body-sm text-red-300'>
			<TbAlertCircle className='mt-0.5 size-4 shrink-0' />
			<div>
				<div className='font-medium'>Subscription cap reached ({tier} tier)</div>
				<div className='text-red-200/80 text-caption mt-0.5'>{lastThrottleCopy}</div>
			</div>
		</div>
	)
}
