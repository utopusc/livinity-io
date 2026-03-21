import {useState, useEffect} from 'react'
import {cn} from '@/shadcn-lib/utils'

export type OrbState = null | 'idle' | 'pulse' | 'breathe'

interface OrbProps {
	colors?: [string, string]
	seed?: number
	state?: OrbState
	className?: string
	initials?: string
	userId?: string
}

/** Hash string to deterministic number 0-1 */
function hashToFloat(s: string, offset = 0): number {
	let h = offset
	for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
	return (Math.abs(h) % 10000) / 10000
}

/** Pick from array using hash */
function pick<T>(arr: T[], s: string, offset = 0): T {
	return arr[Math.floor(hashToFloat(s, offset) * arr.length)]
}

// Animal/nature emoji avatars — unique per user
const AVATARS = ['🦊', '🐼', '🦄', '🐸', '🦁', '🐧', '🦋', '🐬', '🦉', '🐺', '🦈', '🐮', '🐯', '🐰', '🦜', '🐻', '🦒', '🐙', '🦝', '🐨', '🦩', '🐵', '🦕', '🐢']

const BG_GRADIENTS: [string, string][] = [
	['#dbeafe', '#bfdbfe'], // blue
	['#fce7f3', '#fbcfe8'], // pink
	['#d1fae5', '#a7f3d0'], // green
	['#fef3c7', '#fde68a'], // amber
	['#ede9fe', '#ddd6fe'], // violet
	['#e0f2fe', '#bae6fd'], // sky
	['#fce4ec', '#f8bbd0'], // rose
	['#e8f5e9', '#c8e6c9'], // emerald
	['#fff3e0', '#ffe0b2'], // orange
	['#f3e5f5', '#e1bee7'], // purple
]

/**
 * User avatar with deterministic animal emoji and pastel gradient.
 * No external dependencies — works offline.
 */
export function Orb({colors, state = 'breathe', className, initials, userId}: OrbProps) {
	const id = userId || initials || 'default'

	// Check localStorage for user-selected emoji, fall back to deterministic pick
	const [customEmoji, setCustomEmoji] = useState<string | null>(null)
	useEffect(() => {
		if (!userId) return
		const stored = localStorage.getItem(`livinity-avatar-${userId}`)
		if (stored) setCustomEmoji(stored)

		const handler = (e: StorageEvent) => {
			if (e.key === `livinity-avatar-${userId}`) setCustomEmoji(e.newValue)
		}
		window.addEventListener('storage', handler)
		return () => window.removeEventListener('storage', handler)
	}, [userId])

	const emoji = customEmoji || pick(AVATARS, id, 1)
	const gradient = colors || pick(BG_GRADIENTS, id, 2)
	const animClass = state === 'pulse' ? 'animate-[orb-pulse_1.5s_ease-in-out_infinite]' : state === 'breathe' ? 'animate-[orb-breathe_4s_ease-in-out_infinite]' : ''

	return (
		<div className={cn('relative', className)}>
			<div
				className={cn('relative h-full w-full rounded-full overflow-hidden shadow-lg', animClass)}
				style={{
					background: `linear-gradient(145deg, ${gradient[0]}, ${gradient[1]})`,
					boxShadow: `0 4px 20px ${gradient[0]}60, 0 0 40px ${gradient[0]}20`,
				}}
			>
				{/* Emoji avatar */}
				<div className='absolute inset-0 flex items-center justify-center select-none text-5xl md:text-6xl'>
					<span className='drop-shadow-md'>{emoji}</span>
				</div>

				{/* Glossy highlight */}
				<div
					className='absolute inset-0 rounded-full pointer-events-none'
					style={{
						background: 'radial-gradient(circle at 35% 25%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.15) 35%, transparent 65%)',
					}}
				/>
			</div>

			{/* Subtle animated ring */}
			<div
				className='absolute -inset-0.5 rounded-full -z-10 animate-[orb-glow_4s_ease-in-out_infinite]'
				style={{
					background: `linear-gradient(135deg, ${gradient[0]}50, ${gradient[1]}50)`,
					filter: 'blur(6px)',
				}}
			/>
		</div>
	)
}
