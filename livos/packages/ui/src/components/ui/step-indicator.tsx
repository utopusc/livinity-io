import {cn} from '@/shadcn-lib/utils'

interface StepIndicatorProps {
	steps: number
	currentStep: number // 0-indexed
	className?: string
}

export function StepIndicator({steps, currentStep, className}: StepIndicatorProps) {
	return (
		<div className={cn('flex items-center gap-2.5', className)}>
			{Array.from({length: steps}, (_, i) => (
				<div
					key={i}
					className={cn(
						'h-1.5 rounded-full transition-all duration-500',
						i === currentStep
							? 'w-8 bg-brand shadow-[0_0_10px_rgba(139,92,246,0.5)]'
							: i < currentStep
								? 'w-2 bg-brand/40'
								: 'w-2 bg-surface-2',
					)}
				/>
			))}
		</div>
	)
}
