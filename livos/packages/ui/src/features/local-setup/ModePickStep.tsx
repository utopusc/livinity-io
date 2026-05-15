// livos/packages/ui/src/features/local-setup/ModePickStep.tsx
// Phase 104 plan 104-05 — step 1: pick local-lan / hybrid / cloud.
import {TbCloud, TbWorldWww, TbHomeBolt} from 'react-icons/tb'

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
}> = [
	{
		id: 'hybrid',
		icon: TbHomeBolt,
		title: 'Hybrid (recommended)',
		pros: 'Works on every device including iPhone/iPad/Mac. Public DNS, real Let’s Encrypt cert, NO data-plane Server5 traffic.',
		cons: 'Requires a Cloudflare API token (free Cloudflare account).',
		recommended: true,
	},
	{
		id: 'local-lan',
		icon: TbWorldWww,
		title: 'Local-LAN (air-gapped)',
		pros: 'Zero cloud dependency. dnsmasq + Caddy internal CA, fully on-LAN.',
		cons: 'Does NOT work on Apple devices (RFC 6762 mDNS + macOS 26). Requires per-device CA install.',
	},
	{
		id: 'cloud',
		icon: TbCloud,
		title: 'Cloud',
		pros: 'Existing Mini PC path. Reachable from anywhere via livinity.io.',
		cons: 'All traffic routes via Server5 relay. Requires Cloudflare DNS at livinity.io.',
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
					return (
						<button
							key={m.id}
							data-testid={`mode-pick-${m.id}`}
							onClick={() => onSelect(m.id)}
							className={cn(
								'flex items-start gap-3 rounded border p-4 text-left transition',
								isActive ? 'border-accent bg-accent/10' : 'border-border hover:bg-bg-secondary',
							)}
						>
							<Icon className='mt-1 h-6 w-6 flex-shrink-0' />
							<div className='flex-1'>
								<div className='flex items-center gap-2'>
									<span className='font-semibold'>{m.title}</span>
									{m.recommended && (
										<span className='rounded bg-accent-green/15 px-2 py-0.5 text-xs text-accent-green'>default</span>
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
