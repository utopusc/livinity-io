// Phase 179-04 — Display section inside GraphControls panel.
// 3 range sliders + 2 checkboxes + background select.
// Debounced localStorage persistence (300ms) via useRef-based debounce (no lodash).
//
// Threat T-179-04-A/B: slider values clamped with Math.min/max to prevent NaN/Infinity injection.
// Threat T-179-04-C: localStorage key namespaced by userId.

import {useRef, useState} from 'react'

export interface DisplayState {
	labelZoomThreshold: number
	nodeSizeScale: number
	linkThickness: number
	showArrows: boolean
	showDirectoryEdges: boolean
	backgroundMode: 'transparent' | 'dark' | 'light'
}

export const defaultDisplay: DisplayState = {
	labelZoomThreshold: 2.5,
	nodeSizeScale: 1.0,
	linkThickness: 0.5,
	showArrows: false,
	showDirectoryEdges: true,
	backgroundMode: 'transparent',
}

export const DISPLAY_KEY = (userId?: string): string =>
	userId
		? `liv:vault-graph:settings:display:${userId}`
		: 'liv:vault-graph:settings:display'

interface Props {
	initialState?: Partial<DisplayState>
	userId?: string
	onDisplayChange?: (d: DisplayState) => void
	onAnimateRequest?: () => void
}

export function DisplaySection({initialState, userId, onDisplayChange, onAnimateRequest}: Props) {
	const [state, setState] = useState<DisplayState>({
		...defaultDisplay,
		...initialState,
	})
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	function debouncedSave(key: string, value: unknown) {
		if (debounceRef.current) clearTimeout(debounceRef.current)
		debounceRef.current = setTimeout(() => {
			localStorage.setItem(key, JSON.stringify(value))
		}, 300)
	}

	function update(patch: Partial<DisplayState>) {
		const next = {...state, ...patch}
		setState(next)
		onDisplayChange?.(next)
		debouncedSave(DISPLAY_KEY(userId), next)
	}

	function clamp(min: number, max: number, value: number, fallback: number): number {
		const v = isNaN(value) ? fallback : value
		return Math.min(max, Math.max(min, v))
	}

	return (
		<div className='flex flex-col gap-2 p-3'>
			<p className='text-xs font-medium text-[color:var(--fg-mute)] uppercase tracking-wide'>
				Display
			</p>

			<div className='flex flex-col gap-1'>
				<label className='flex items-center justify-between text-sm text-[color:var(--fg)]'>
					<span>Label zoom threshold</span>
					<span className='text-xs text-[color:var(--fg-mute)]'>{state.labelZoomThreshold.toFixed(1)}</span>
				</label>
				<input
					type='range'
					data-testid='slider-label-zoom'
					min='0'
					max='8'
					step='0.1'
					value={state.labelZoomThreshold}
					onChange={(e) =>
						update({labelZoomThreshold: clamp(0, 8, parseFloat(e.target.value), defaultDisplay.labelZoomThreshold)})
					}
					className='w-full accent-[color:var(--fg)]'
				/>
			</div>

			<div className='flex flex-col gap-1'>
				<label className='flex items-center justify-between text-sm text-[color:var(--fg)]'>
					<span>Node size</span>
					<span className='text-xs text-[color:var(--fg-mute)]'>{state.nodeSizeScale.toFixed(1)}</span>
				</label>
				<input
					type='range'
					data-testid='slider-node-size'
					min='0.5'
					max='3'
					step='0.1'
					value={state.nodeSizeScale}
					onChange={(e) =>
						update({nodeSizeScale: clamp(0.5, 3, parseFloat(e.target.value), defaultDisplay.nodeSizeScale)})
					}
					className='w-full accent-[color:var(--fg)]'
				/>
			</div>

			<div className='flex flex-col gap-1'>
				<label className='flex items-center justify-between text-sm text-[color:var(--fg)]'>
					<span>Link thickness</span>
					<span className='text-xs text-[color:var(--fg-mute)]'>{state.linkThickness.toFixed(1)}</span>
				</label>
				<input
					type='range'
					data-testid='slider-link-thickness'
					min='0.5'
					max='4'
					step='0.1'
					value={state.linkThickness}
					onChange={(e) =>
						update({linkThickness: clamp(0.5, 4, parseFloat(e.target.value), defaultDisplay.linkThickness)})
					}
					className='w-full accent-[color:var(--fg)]'
				/>
			</div>

			<label className='flex items-center gap-2 cursor-pointer'>
				<input
					type='checkbox'
					data-testid='toggle-arrows'
					checked={state.showArrows}
					onChange={(e) => update({showArrows: e.target.checked})}
					className='accent-[color:var(--fg)]'
				/>
				<span className='text-sm text-[color:var(--fg)]'>Show arrows</span>
			</label>

			<label className='flex items-center gap-2 cursor-pointer'>
				<input
					type='checkbox'
					data-testid='toggle-dir-edges'
					checked={state.showDirectoryEdges}
					onChange={(e) => update({showDirectoryEdges: e.target.checked})}
					className='accent-[color:var(--fg)]'
				/>
				<span className='text-sm text-[color:var(--fg)]'>Directory edges</span>
			</label>

			<div className='flex flex-col gap-1'>
				<label className='text-xs text-[color:var(--fg-mute)]' htmlFor='select-background-input'>
					Background
				</label>
				<select
					id='select-background-input'
					data-testid='select-background'
					value={state.backgroundMode}
					onChange={(e) =>
						update({backgroundMode: e.target.value as DisplayState['backgroundMode']})
					}
					className='rounded border border-[color:var(--line-strong)] bg-[color:var(--bg-2)] px-2 py-1 text-sm text-[color:var(--fg)]'
				>
					<option value='transparent'>Transparent</option>
					<option value='dark'>Dark</option>
					<option value='light'>Light</option>
				</select>
			</div>

			{/* Phase 180-02: Animate appearance button */}
			{onAnimateRequest && (
				<button
					type='button'
					data-testid='animate-btn'
					onClick={onAnimateRequest}
					className='mt-1 w-full rounded border border-[color:var(--line-strong)] bg-[color:var(--bg-2)] px-2 py-1 text-sm text-[color:var(--fg)] hover:bg-[color:var(--bg-3)] transition-colors'
				>
					Animate appearance
				</button>
			)}
		</div>
	)
}
