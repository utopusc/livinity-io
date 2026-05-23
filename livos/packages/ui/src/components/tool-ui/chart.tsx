/**
 * Phase 198-03 Task 2 — Chart tool-ui primitive.
 *
 * Renders a recharts LineChart / BarChart / PieChart based on the `kind`
 * prop. Auto-resizes via ResponsiveContainer.
 *
 * T-198-04 mitigation: ZERO raw HTML injection — recharts uses SVG
 * primitives + React text interpolation only.
 */

import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Legend,
	Line,
	LineChart,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts'

export type ChartKind = 'line' | 'bar' | 'pie'

export type ChartProps = {
	kind?: ChartKind
	data: Array<Record<string, number | string>>
	xKey: string
	yKey: string
	height?: number
}

const PIE_COLORS = [
	'#0ea5e9',
	'#10b981',
	'#f59e0b',
	'#ef4444',
	'#a855f7',
	'#ec4899',
	'#14b8a6',
	'#6366f1',
]

export function Chart({kind = 'line', data, xKey, yKey, height = 280}: ChartProps) {
	if (!data || data.length === 0) {
		return (
			<div className='rounded-lg border bg-muted/30 p-4 text-muted-foreground text-sm'>
				No chart data returned.
			</div>
		)
	}

	if (kind === 'pie') {
		return (
			<div style={{width: '100%', height}}>
				<ResponsiveContainer width='100%' height='100%'>
					<PieChart>
						<Pie
							data={data}
							dataKey={yKey}
							nameKey={xKey}
							outerRadius='80%'
							label
						>
							{data.map((_, idx) => (
								<Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
							))}
						</Pie>
						<Tooltip />
						<Legend />
					</PieChart>
				</ResponsiveContainer>
			</div>
		)
	}

	if (kind === 'bar') {
		return (
			<div style={{width: '100%', height}}>
				<ResponsiveContainer width='100%' height='100%'>
					<BarChart data={data}>
						<CartesianGrid strokeDasharray='3 3' />
						<XAxis dataKey={xKey} />
						<YAxis />
						<Tooltip />
						<Bar dataKey={yKey} fill='#0ea5e9' />
					</BarChart>
				</ResponsiveContainer>
			</div>
		)
	}

	// Default: line
	return (
		<div style={{width: '100%', height}}>
			<ResponsiveContainer width='100%' height='100%'>
				<LineChart data={data}>
					<CartesianGrid strokeDasharray='3 3' />
					<XAxis dataKey={xKey} />
					<YAxis />
					<Tooltip />
					<Line type='monotone' dataKey={yKey} stroke='#0ea5e9' strokeWidth={2} />
				</LineChart>
			</ResponsiveContainer>
		</div>
	)
}

export default Chart
