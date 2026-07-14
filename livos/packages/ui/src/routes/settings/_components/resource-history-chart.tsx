/**
 * Phase 320 Plan 320-05 (MON-01) — Resource-history AreaChart.
 *
 * Presentational, props-in component: the parent (`monitoring-section.tsx`)
 * fetches the persisted history once from the monitoring history route and
 * passes the result down as `data`. There is NO client-side ring buffer and no
 * timer-driven refetch here — unlike `server-control/index.tsx`'s live 2s
 * poller, this chart is a pure function of its `data` prop (a server-persisted
 * series).
 *
 * The four metric families live on two Y axes because they have incompatible
 * units: CPU and memory are rendered as percentages on the left axis, disk and
 * network throughput as bytes/second on the right axis. Memory is normalised to
 * a percentage of total here so it shares the left (0-100) scale with CPU.
 *
 * Visual style (gradient-filled monotone Areas) is reused verbatim from the
 * network AreaChart in `server-control/index.tsx` (lines 550-584).
 */

import {Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis} from 'recharts'

import {t} from '@/utils/i18n'

export type ResourceHistoryPoint = {
	time: string
	cpuPct: number | null
	memUsedBytes: number | null
	memTotalBytes: number | null
	diskReadBps: number | null
	diskWriteBps: number | null
	netRxBps: number | null
	netTxBps: number | null
}

// Distinct hues per metric family — matches the design-token palette used by
// the server-control monitoring charts.
const COLOR_CPU = 'hsl(265, 80%, 65%)'
const COLOR_MEM = 'hsl(160, 80%, 45%)'
const COLOR_DISK = 'hsl(35, 90%, 55%)'
const COLOR_NET = 'hsl(210, 80%, 60%)'

type ChartRow = {
	time: string
	cpuPct: number | null
	memPct: number | null
	diskBps: number | null
	netBps: number | null
}

/** Sum two nullable rates, preserving "no sample" (both null) as null. */
export function sumRates(a: number | null, b: number | null): number | null {
	if (a == null && b == null) return null
	return (a ?? 0) + (b ?? 0)
}

/** Compact bytes/second formatter for the tooltip + right-axis ticks. */
export function fmtBps(n: number): string {
	if (!Number.isFinite(n)) return '—'
	const units = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s']
	let v = n
	let i = 0
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024
		i++
	}
	return `${v.toFixed(i === 0 || v >= 100 ? 0 : 1)} ${units[i]}`
}

/** Best-effort HH:MM tick for the time axis; falls back to the raw string. */
function fmtTime(time: string): string {
	const d = new Date(time)
	if (Number.isNaN(d.getTime())) return time
	return d.toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'})
}

export function toRows(data: ResourceHistoryPoint[]): ChartRow[] {
	return data.map((p) => {
		const memPct =
			p.memUsedBytes != null && p.memTotalBytes != null && p.memTotalBytes > 0
				? (p.memUsedBytes / p.memTotalBytes) * 100
				: null
		return {
			time: p.time,
			cpuPct: p.cpuPct,
			memPct,
			diskBps: sumRates(p.diskReadBps, p.diskWriteBps),
			netBps: sumRates(p.netRxBps, p.netTxBps),
		}
	})
}

type TooltipEntry = {dataKey?: string | number; name?: string; value?: number | null; color?: string}

function HistoryTooltip({active, payload, label}: {active?: boolean; payload?: TooltipEntry[]; label?: string}) {
	if (!active || !payload || payload.length === 0) return null
	return (
		<div
			style={{
				background: 'rgba(0,0,0,0.85)',
				border: '1px solid rgba(255,255,255,0.1)',
				borderRadius: 4,
				fontSize: 12,
				padding: '6px 8px',
			}}
		>
			<div style={{marginBottom: 4, opacity: 0.7}}>{fmtTime(String(label ?? ''))}</div>
			{payload.map((p) => {
				const isPct = p.dataKey === 'cpuPct' || p.dataKey === 'memPct'
				const val = p.value == null ? '—' : isPct ? `${Math.round(p.value)}%` : fmtBps(p.value)
				return (
					<div key={String(p.dataKey)} style={{color: p.color}}>
						{p.name}: {val}
					</div>
				)
			})}
		</div>
	)
}

export function ResourceHistoryChart({data}: {data: ResourceHistoryPoint[]}) {
	const rows = toRows(data)

	return (
		<div className='h-[220px] w-full'>
			<ResponsiveContainer width='100%' height='100%'>
				<AreaChart data={rows} margin={{top: 8, right: 8, bottom: 4, left: 0}}>
					<defs>
						<linearGradient id='resCpuGradient' x1='0' y1='0' x2='0' y2='1'>
							<stop offset='5%' stopColor={COLOR_CPU} stopOpacity={0.3} />
							<stop offset='95%' stopColor={COLOR_CPU} stopOpacity={0} />
						</linearGradient>
						<linearGradient id='resMemGradient' x1='0' y1='0' x2='0' y2='1'>
							<stop offset='5%' stopColor={COLOR_MEM} stopOpacity={0.3} />
							<stop offset='95%' stopColor={COLOR_MEM} stopOpacity={0} />
						</linearGradient>
						<linearGradient id='resDiskGradient' x1='0' y1='0' x2='0' y2='1'>
							<stop offset='5%' stopColor={COLOR_DISK} stopOpacity={0.3} />
							<stop offset='95%' stopColor={COLOR_DISK} stopOpacity={0} />
						</linearGradient>
						<linearGradient id='resNetGradient' x1='0' y1='0' x2='0' y2='1'>
							<stop offset='5%' stopColor={COLOR_NET} stopOpacity={0.3} />
							<stop offset='95%' stopColor={COLOR_NET} stopOpacity={0} />
						</linearGradient>
					</defs>
					<CartesianGrid strokeDasharray='3 3' stroke='currentColor' strokeOpacity={0.08} vertical={false} />
					<XAxis
						dataKey='time'
						tickFormatter={fmtTime}
						tick={{fontSize: 10, fill: 'currentColor'}}
						axisLine={false}
						tickLine={false}
						minTickGap={32}
					/>
					<YAxis
						yAxisId='pct'
						domain={[0, 100]}
						tickFormatter={(v: number) => `${v}%`}
						tick={{fontSize: 10, fill: 'currentColor'}}
						axisLine={false}
						tickLine={false}
						width={34}
					/>
					<YAxis
						yAxisId='bps'
						orientation='right'
						tickFormatter={fmtBps}
						tick={{fontSize: 10, fill: 'currentColor'}}
						axisLine={false}
						tickLine={false}
						width={54}
					/>
					<RechartsTooltip content={<HistoryTooltip />} />
					<Legend wrapperStyle={{fontSize: 11}} iconType='plainline' />
					<Area
						yAxisId='pct'
						type='monotone'
						dataKey='cpuPct'
						name={t('settings.monitoring.metric-cpu')}
						stroke={COLOR_CPU}
						fill='url(#resCpuGradient)'
						fillOpacity={1}
						dot={false}
						connectNulls
						isAnimationActive={false}
					/>
					<Area
						yAxisId='pct'
						type='monotone'
						dataKey='memPct'
						name={t('settings.monitoring.metric-mem')}
						stroke={COLOR_MEM}
						fill='url(#resMemGradient)'
						fillOpacity={1}
						dot={false}
						connectNulls
						isAnimationActive={false}
					/>
					<Area
						yAxisId='bps'
						type='monotone'
						dataKey='diskBps'
						name={t('settings.monitoring.metric-disk')}
						stroke={COLOR_DISK}
						fill='url(#resDiskGradient)'
						fillOpacity={1}
						dot={false}
						connectNulls
						isAnimationActive={false}
					/>
					<Area
						yAxisId='bps'
						type='monotone'
						dataKey='netBps'
						name={t('settings.monitoring.metric-net')}
						stroke={COLOR_NET}
						fill='url(#resNetGradient)'
						fillOpacity={1}
						dot={false}
						connectNulls
						isAnimationActive={false}
					/>
				</AreaChart>
			</ResponsiveContainer>
		</div>
	)
}
