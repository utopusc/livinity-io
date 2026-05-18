// livos/packages/ui/src/features/local-setup/ModePickStep.tsx
// Phase 104 plan 104-05 — step 1: pick install mode.
// Phase 142-02 — `hybrid` card renamed → `portal` (recommended).
// Phase 142-01 — `local-lan` card removed (mode retired).
// Phase 142-03 — `cloud` card kept but rendered DISABLED with Coming Soon badge.
import {TbCloud, TbHomeBolt} from 'react-icons/tb'

import {cn} from '@/shadcn-lib/utils'

import type {SelectedMode} from './types'

export interface ModePickStepProps {
	selected: SelectedMode | null
	currentMode: string | null
	onSelect: (mode: SelectedMode) => void
}

const MODES: Array<{
	id: SelectedMode
	icon: React.ComponentType<{className?: string}>
	title: string
	pros: string
	cons: string
	recommended?: boolean
	comingSoon?: boolean
}> = [
	{
		id: 'portal',
		icon: TbHomeBolt,
		title: 'Portal (recommended)',
		pros: 'Works on every device including iPhone/iPad/Mac. Public DNS, real Let’s Encrypt cert, NO data-plane Server5 traffic.',
		cons: 'Requires a Cloudflare API token (free Cloudflare account).',
		recommended: true,
	},
	{
		id: 'cloud',
		icon: TbCloud,
		title: 'Cloud',
		pros: 'Hosted by Livinity — zero setup, instant access from anywhere, no Cloudflare account needed.',
		cons: 'Coming Soon. Currently disabled.',
		comingSoon: true,
	},
]

export function ModePickStep({selected, currentMode, onSelect}: ModePickStepProps) {
	return (
		<div className='space-y-4' data-testid='mode-pick-step'>
			<p className='text-text-secondary'>
				Pick how LivOS should be reachable on your network.
				{currentMode && (
					<>
						{' '}
						Current install mode: <strong>{currentMode}</strong>.
					</>
				)}
			</p>
			<div className='grid gap-3'>
				{MODES.map((m) => {
					const Icon = m.icon
					const isActive = selected === m.id
					const isDisabled = !!m.comingSoon
					return (
						<button
							key={m.id}
							data-testid={`mode-pick-${m.id}`}
							onClick={() => !isDisabled && onSelect(m.id)}
							disabled={isDisabled}
							aria-disabled={isDisabled}
							className={cn(
								'flex items-start gap-3 rounded border p-4 text-left transition',
								isActive ? 'border-accent bg-accent/10' : 'border-border hover:bg-bg-secondary',
								isDisabled && 'cursor-not-allowed opacity-60 hover:bg-transparent',
							)}
						>
							<Icon className='mt-1 h-6 w-6 flex-shrink-0' />
							<div className='flex-1'>
								<div className='flex items-center gap-2'>
									<span className='font-semibold'>{m.title}</span>
									{m.recommended && (
										<span className='rounded bg-accent-green/15 px-2 py-0.5 text-xs text-accent-green'>default</span>
									)}
									{m.comingSoon && (
										<span
											data-testid={`mode-pick-${m.id}-coming-soon`}
											className='rounded bg-accent-amber/15 px-2 py-0.5 text-xs text-accent-amber'
										>
											Coming Soon
										</span>
									)}
								</div>
								<p className='mt-1 text-sm text-text-secondary'>
									<strong>Pros:</strong> {m.pros}
								</p>
								<p className='mt-1 text-sm text-text-secondary'>
									<strong>Cons:</strong> {m.cons}
								</p>
							</div>
						</button>
					)
				})}
			</div>
		</div>
	)
}
