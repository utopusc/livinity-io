/**
 * Phase 44 Plan 44-04 — Last-30-days request count BarChart.
 *
 * Uses recharts (already in livos/packages/ui deps line 104). Tooltip label
 * appends "UTC" so the user understands the bucket alignment matches the
 * server's UTC midnight reset.
 */

import {Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts'

type Daily = {date: string; count: number}

export function DailyCountsChart({data}: {data: Daily[]}) {
	const tickInterval = data.length > 0 ? Math.max(1, Math.floor(data.length / 7)) : 0
	return (
		<div className='h-32 w-full'>
			<ResponsiveContainer width='100%' height='100%'>
				<BarChart data={data} margin={{top: 0, right: 8, left: 0, bottom: 0}}>
					<XAxis
						dataKey='date'
						tickFormatter={(v: string) => v.slice(5)}
						interval={tickInterval}
						tick={{fontSize: 10, fill: 'currentColor'}}
						axisLine={false}
						tickLine={false}
					/>
					<YAxis
						allowDecimals={false}
						tick={{fontSize: 10, fill: 'currentColor'}}
						axisLine={false}
						tickLine={false}
						width={24}
					/>
					<Tooltip
						contentStyle={{
							background: 'rgba(0,0,0,0.85)',
							border: '1px solid rgba(255,255,255,0.1)',
							borderRadius: 4,
							fontSize: 12,
						}}
						labelFormatter={(v: string) => `${v} UTC`}
					/>
					<Bar dataKey='count' fill='currentColor' fillOpacity={0.7} radius={[2, 2, 0, 0]} />
				</BarChart>
			</ResponsiveContainer>
		</div>
	)
}
