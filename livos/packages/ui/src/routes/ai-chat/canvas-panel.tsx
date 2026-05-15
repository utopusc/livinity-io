import {useState} from 'react'
import {IconCode, IconX, IconAlertTriangle} from '@tabler/icons-react'
import {cn} from '@/shadcn-lib/utils'
import {CanvasIframe} from './canvas-iframe'

interface CanvasPanelProps {
	artifact: {
		id: string
		type: string
		title: string
		content: string
		version: number
	}
	onClose: () => void
}

function typeColorClass(type: string): string {
	switch (type) {
		case 'react':
			return 'bg-accent-blue/15 text-accent-blue'
		case 'html':
			return 'bg-emerald-500/15 text-emerald-400'
		case 'svg':
			return 'bg-accent-amber/15 text-accent-amber'
		case 'mermaid':
			return 'bg-purple-500/15 text-purple-400'
		case 'recharts':
			return 'bg-cyan-500/15 text-cyan-400'
		default:
			return 'bg-surface-2 text-text-tertiary'
	}
}

export function CanvasPanel({artifact, onClose}: CanvasPanelProps) {
	const [error, setError] = useState<string | null>(null)

	return (
		<div className='flex h-full flex-col border-l border-border-default bg-surface-base'>
			{/* Header */}
			<div className='flex flex-shrink-0 items-center gap-3 border-b border-border-default px-4 py-3'>
				<div className='flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/30 to-blue-500/30'>
					<IconCode size={14} className='text-cyan-400' />
				</div>
				<div className='min-w-0 flex-1'>
					<span className='truncate text-body-sm font-semibold text-text-primary'>{artifact.title}</span>
				</div>
				<span
					className={cn(
						'rounded-radius-sm px-2 py-0.5 text-caption-sm font-medium',
						typeColorClass(artifact.type),
					)}
				>
					{artifact.type}
				</span>
				<span className='rounded-radius-sm bg-surface-2 px-1.5 py-0.5 font-mono text-caption-sm text-text-tertiary'>
					v{artifact.version}
				</span>
				<button
					onClick={onClose}
					className='rounded-radius-sm p-1.5 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary'
				>
					<IconX size={16} />
				</button>
			</div>

			{/* Canvas iframe */}
			<div className='flex-1 overflow-hidden'>
				<CanvasIframe content={artifact.content} type={artifact.type as any} onError={setError} />
			</div>

			{/* Error bar */}
			{error && (
				<div className='flex items-start gap-2 border-t border-accent-red/20 bg-accent-red/10 px-4 py-2'>
					<IconAlertTriangle size={14} className='mt-0.5 flex-shrink-0 text-accent-red' />
					<span className='flex-1 text-caption text-accent-red'>{error}</span>
					<button onClick={() => setError(null)} className='text-accent-red/60 hover:text-accent-red'>
						<IconX size={12} />
					</button>
				</div>
			)}
		</div>
	)
}
