import {cn} from '@/shadcn-lib/utils'

interface StepIndicatorProps {
	steps: number
	currentStep: number // 0-indexed
	className?: string
}

export function StepIndicator({steps, currentStep, className}: StepIndicatorProps) {
	return (
		<div className={cn('flex items-center gap-2', className)}>
			{Array.from({length: steps}, (_, i) => (
				<div
					key={i}
					className={cn(
						'h-1.5 rounded-full transition-all duration-300',
						i === currentStep
							? 'w-6 bg-brand'
							: i < currentStep
								? 'w-1.5 bg-brand/50'
								: 'w-1.5 bg-surface-3',
					)}
				/>
			))}
		</div>
	)
}
