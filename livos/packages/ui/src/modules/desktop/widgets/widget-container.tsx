import {ReactNode} from 'react'

interface WidgetContainerProps {
	children: ReactNode
	className?: string
}

export function WidgetContainer({children, className = ''}: WidgetContainerProps) {
	return (
		<div className={`flex h-full w-full flex-col overflow-hidden rounded-[20px] bg-white/[0.55] shadow-[0_2px_20px_rgba(0,0,0,0.08)] backdrop-blur-2xl ${className}`}>
			{children}
		</div>
	)
}
