/**
 * Phase 198-03 Task 2 — Weather Widget tool-ui primitive.
 *
 * Renders a current-conditions panel with optional multi-day forecast.
 *
 * T-198-04 mitigation: ZERO raw HTML injection — React text only.
 */

export type WeatherData = {
	temperature: number
	conditions: string
	humidity?: number
	windSpeed?: number
	unit?: 'C' | 'F'
	forecast?: Array<{day: string; high: number; low: number; conditions?: string}>
}

export type WeatherWidgetProps = {
	location: string
	data: WeatherData
}

export function WeatherWidget({location, data}: WeatherWidgetProps) {
	const unit = data.unit ?? 'C'
	return (
		<div className='rounded-xl border bg-card p-4'>
			<div className='flex items-baseline justify-between'>
				<div>
					<div className='font-medium text-sm text-muted-foreground'>{location}</div>
					<div className='font-semibold text-3xl'>
						{Math.round(data.temperature)}°{unit}
					</div>
					<div className='text-sm'>{data.conditions}</div>
				</div>
				<div className='space-y-1 text-right text-muted-foreground text-xs'>
					{typeof data.humidity === 'number' && (
						<div>Humidity: {data.humidity}%</div>
					)}
					{typeof data.windSpeed === 'number' && (
						<div>Wind: {data.windSpeed} km/h</div>
					)}
				</div>
			</div>
			{data.forecast && data.forecast.length > 0 && (
				<div className='mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5'>
					{data.forecast.slice(0, 7).map((f, idx) => (
						<div
							key={`${f.day}-${idx}`}
							className='rounded-lg bg-muted/50 p-2 text-center'
						>
							<div className='font-medium text-xs'>{f.day}</div>
							{f.conditions && (
								<div className='line-clamp-1 text-muted-foreground text-xs'>
									{f.conditions}
								</div>
							)}
							<div className='mt-1 text-sm'>
								<span className='font-semibold'>{Math.round(f.high)}°</span>
								<span className='ml-1 text-muted-foreground'>
									{Math.round(f.low)}°
								</span>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

export default WeatherWidget
