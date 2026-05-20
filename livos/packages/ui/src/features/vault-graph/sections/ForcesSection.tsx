// Phase 179-04 — Forces section inside GraphControls panel.
// 4 range sliders (center/repel/link/distance) + Reset button.
// Debounced localStorage persistence (300ms) via useRef-based debounce (no lodash).
//
// Threat T-179-04-A/B: slider values clamped with Math.min/max to prevent NaN/Infinity injection.

import {useRef, useState} from 'react'

export interface ForcesState {
	centerStrength: number
	repelStrength: number
	linkStrength: number
	linkDistance: number
}

export const defaultForces: ForcesState = {
	centerStrength: 0.1,
	repelStrength: -80,
	linkStrength: 0.3,
	linkDistance: 60,
}

export const FORCES_KEY = (userId?: string): string =>
	userId
		? `liv:vault-graph:settings:forces:${userId}`
		: 'liv:vault-graph:settings:forces'

interface Props {
	initialState?: Partial<ForcesState>
	userId?: string
	onForcesChange?: (f: ForcesState) => void
}

export function ForcesSection({initialState, userId, onForcesChange}: Props) {
	const [state, setState] = useState<ForcesState>({
		...defaultForces,
		...initialState,
	})
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	function debouncedSave(key: string, value: unknown) {
		if (debounceRef.current) clearTimeout(debounceRef.current)
		debounceRef.current = setTimeout(() => {
			localStorage.setItem(key, JSON.stringify(value))
		}, 300)
	}

	function update(patch: Partial<ForcesState>) {
		const next = {...state, ...patch}
		setState(next)
		onForcesChange?.(next)
		debouncedSave(FORCES_KEY(userId), next)
	}

	function clamp(min: number, max: number, value: number, fallback: number): number {
		const v = isNaN(value) ? fallback : value
		return Math.min(max, Math.max(min, v))
	}

	function handleReset() {
		setState(defaultForces)
		onForcesChange?.(defaultForces)
		debouncedSave(FORCES_KEY(userId), defaultForces)
	}

	return (
		<div className='flex flex-col gap-2 p-3'>
			<p className='text-xs font-medium text-[color:var(--fg-mute)] uppercase tracking-wide'>
				Forces
			</p>

			<div className='flex flex-col gap-1'>
				<label className='flex items-center justify-between text-sm text-[color:var(--fg)]'>
					<span>Center</span>
					<span className='text-xs text-[color:var(--fg-mute)]'>{state.centerStrength.toFixed(2)}</span>
				</label>
				<input
					type='range'
					data-testid='slider-center'
					min='0'
					max='1'
					step='0.01'
					value={state.centerStrength}
					onChange={(e) =>
						update({centerStrength: clamp(0, 1, parseFloat(e.target.value), defaultForces.centerStrength)})
					}
					className='w-full accent-[color:var(--fg)]'
				/>
			</div>

			<div className='flex flex-col gap-1'>
				<label className='flex items-center justify-between text-sm text-[color:var(--fg)]'>
					<span>Repel</span>
					<span className='text-xs text-[color:var(--fg-mute)]'>{state.repelStrength.toFixed(0)}</span>
				</label>
				<input
					type='range'
					data-testid='slider-repel'
					min='-200'
					max='0'
					step='1'
					value={state.repelStrength}
					onChange={(e) =>
						update({repelStrength: clamp(-200, 0, parseFloat(e.target.value), defaultForces.repelStrength)})
					}
					className='w-full accent-[color:var(--fg)]'
				/>
			</div>

			<div className='flex flex-col gap-1'>
				<label className='flex items-center justify-between text-sm text-[color:var(--fg)]'>
					<span>Link strength</span>
					<span className='text-xs text-[color:var(--fg-mute)]'>{state.linkStrength.toFixed(2)}</span>
				</label>
				<input
					type='range'
					data-testid='slider-link-strength'
					min='0'
					max='1'
					step='0.01'
					value={state.linkStrength}
					onChange={(e) =>
						update({linkStrength: clamp(0, 1, parseFloat(e.target.value), defaultForces.linkStrength)})
					}
					className='w-full accent-[color:var(--fg)]'
				/>
			</div>

			<div className='flex flex-col gap-1'>
				<label className='flex items-center justify-between text-sm text-[color:var(--fg)]'>
					<span>Link distance</span>
					<span className='text-xs text-[color:var(--fg-mute)]'>{state.linkDistance.toFixed(0)}</span>
				</label>
				<input
					type='range'
					data-testid='slider-link-distance'
					min='20'
					max='200'
					step='1'
					value={state.linkDistance}
					onChange={(e) =>
						update({linkDistance: clamp(20, 200, parseFloat(e.target.value), defaultForces.linkDistance)})
					}
					className='w-full accent-[color:var(--fg)]'
				/>
			</div>

			<button
				type='button'
				data-testid='forces-reset'
				onClick={handleReset}
				className='mt-1 rounded border border-[color:var(--line-strong)] bg-[color:var(--bg-2)] px-3 py-1 text-sm text-[color:var(--fg)] hover:bg-[color:var(--bg-3)]'
			>
				Reset to defaults
			</button>
		</div>
	)
}
