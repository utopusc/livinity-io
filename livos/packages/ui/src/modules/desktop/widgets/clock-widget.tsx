import {useState, useEffect} from 'react'

import {WidgetContainer} from './widget-container'

export function ClockWidget({config}: {config?: Record<string, unknown>}) {
	const [now, setNow] = useState(new Date())
	const mode = (config?.mode as string) || 'digital'

	useEffect(() => {
		const interval = setInterval(() => setNow(new Date()), 1000)
		return () => clearInterval(interval)
	}, [])

	if (mode === 'analog') return <AnalogClock now={now} />
	return <DigitalClock now={now} />
}

function DigitalClock({now}: {now: Date}) {
	const hours = now.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'})
	const secs = String(now.getSeconds()).padStart(2, '0')
	const dayName = now.toLocaleDateString('en-US', {weekday: 'long'})
	const dayNum = now.getDate()
	const month = now.toLocaleDateString('en-US', {month: 'long'})

	return (
		<WidgetContainer>
			<div className='flex flex-1 flex-col items-center justify-center gap-0.5'>
				<span className='text-[38px] font-[200] leading-none tabular-nums tracking-tight text-gray-800'>{hours}</span>
				<span className='text-[11px] font-medium tabular-nums text-gray-800/30'>{secs}</span>
				<div className='mt-1 flex items-center gap-1'>
					<span className='text-[11px] font-medium capitalize text-gray-500'>{dayName},</span>
					<span className='text-[11px] font-semibold text-gray-700'>{dayNum}</span>
					<span className='text-[11px] font-medium capitalize text-gray-500'>{month}</span>
				</div>
			</div>
		</WidgetContainer>
	)
}

function AnalogClock({now}: {now: Date}) {
	const h = now.getHours()
	const m = now.getMinutes()
	const s = now.getSeconds()

	const hAngle = (h % 12 + m / 60) * 30 - 90
	const mAngle = m * 6 - 90
	const sAngle = s * 6 - 90

	const pt = (angle: number, len: number) => {
		const rad = (angle * Math.PI) / 180
		return {x: 50 + len * Math.cos(rad), y: 50 + len * Math.sin(rad)}
	}

	const hp = pt(hAngle, 22)
	const mp = pt(mAngle, 32)
	const sp = pt(sAngle, 36)

	return (
		<WidgetContainer>
			<div className='flex flex-1 items-center justify-center'>
				<svg viewBox='0 0 100 100' className='h-[90%] w-[90%]'>
					{/* Minute ticks */}
					{Array.from({length: 60}).map((_, i) => {
						const a = (i * 6 * Math.PI) / 180 - Math.PI / 2
						const isMajor = i % 5 === 0
						const r1 = isMajor ? 40 : 43
						const r2 = 46
						return (
							<line key={i}
								x1={50 + r1 * Math.cos(a)} y1={50 + r1 * Math.sin(a)}
								x2={50 + r2 * Math.cos(a)} y2={50 + r2 * Math.sin(a)}
								stroke={isMajor ? '#334155' : '#cbd5e1'}
								strokeWidth={isMajor ? 1.8 : 0.5}
								strokeLinecap='round'
							/>
						)
					})}

					{/* Hour hand */}
					<line x1='50' y1='50' x2={hp.x} y2={hp.y} stroke='#1e293b' strokeWidth='3' strokeLinecap='round' />
					{/* Minute hand */}
					<line x1='50' y1='50' x2={mp.x} y2={mp.y} stroke='#475569' strokeWidth='2' strokeLinecap='round' />
					{/* Second hand */}
					<line x1='50' y1='50' x2={sp.x} y2={sp.y} stroke='#ef4444' strokeWidth='0.8' strokeLinecap='round' />

					{/* Center */}
					<circle cx='50' cy='50' r='2.5' fill='#1e293b' />
					<circle cx='50' cy='50' r='1' fill='#ef4444' />
				</svg>
			</div>
		</WidgetContainer>
	)
}
