// Phase 181-02 — MobileTerminalKeyBar
//
// 2-row sticky-bottom virtual key bar for tablet CC PTY sessions.
// All escape sequences generated from static ROW_1/ROW_2 tables only —
// no user input is ever interpolated into escape sequences (T-181-02-01).
//
// Sticky-Ctrl state machine:
//   'off'     → tap CTRL → 'latched'  (dim cyan)
//   'latched' → next non-modifier key → apply Ctrl+key → 'off'
//   'latched' → tap CTRL again → 'off'  (cancel)
//   'off'     → long-press (>600ms) → 'locked'  (solid cyan)
//   'locked'  → tap CTRL → 'off'
//   'locked'  → any non-modifier key → apply Ctrl+key, stay 'locked'
//
// Timer cleared on touchEnd regardless — prevents double-fire from rapid taps
// (T-181-02-02 mitigation).

import {useState, useCallback, useRef} from 'react'
import type {JSX} from 'react'

type CtrlState = 'off' | 'latched' | 'locked'

interface Key {
	label: string
	seq: string
	wide?: boolean
}

// All sequences hardcoded — no user input interpolation (T-181-02-01).
const ROW_1: Key[] = [
	{label: 'ESC', seq: '\x1b'},
	{label: 'TAB', seq: '\x09'},
	{label: 'CTRL', seq: 'ctrl-modifier'},
	{label: '/', seq: '/'},
	{label: '|', seq: '|'},
	{label: '"', seq: '"'},
	{label: "'", seq: "'"},
	{label: '-', seq: '-'},
	{label: '↑', seq: '\x1b[A'},
]

const ROW_2: Key[] = [
	{label: '⌘', seq: 'meta-modifier'},
	{label: '←', seq: '\x1b[D'},
	{label: '↓', seq: '\x1b[B'},
	{label: '→', seq: '\x1b[C'},
	{label: 'PGUP', seq: '\x1b[5~', wide: true},
	{label: 'PGDN', seq: '\x1b[6~', wide: true},
	{label: 'HOME', seq: '\x1b[H'},
	{label: 'END', seq: '\x1b[F'},
	{label: '⏎', seq: '\r'},
]

const CTRL_HOLD_MS = 600

interface MobileTerminalKeyBarProps {
	/** Called with the escape sequence string to write to PTY stdin */
	onKey: (seq: string) => void
	className?: string
}

export function MobileTerminalKeyBar({onKey, className}: MobileTerminalKeyBarProps): JSX.Element {
	const [ctrlState, setCtrlState] = useState<CtrlState>('off')
	const ctrlHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	// Track whether long-press fired so touchEnd doesn't also toggle state
	const longPressFired = useRef(false)

	const handleKey = useCallback(
		(seq: string) => {
			if (seq === 'ctrl-modifier' || seq === 'meta-modifier') return

			// Apply Ctrl encoding for single lowercase letters only
			if (ctrlState !== 'off') {
				const char =
					seq.length === 1 && seq >= 'a' && seq <= 'z'
						? String.fromCharCode(seq.charCodeAt(0) - 64)
						: seq
				onKey(char)
				if (ctrlState === 'latched') {
					setCtrlState('off')
				}
				return
			}
			onKey(seq)
		},
		[ctrlState, onKey],
	)

	const handleCtrlTouchStart = useCallback(() => {
		longPressFired.current = false
		ctrlHoldTimer.current = setTimeout(() => {
			longPressFired.current = true
			setCtrlState('locked')
		}, CTRL_HOLD_MS)
	}, [])

	const handleCtrlTouchEnd = useCallback(() => {
		if (ctrlHoldTimer.current) {
			clearTimeout(ctrlHoldTimer.current)
			ctrlHoldTimer.current = null
		}
		// Only toggle if long-press did NOT fire
		if (!longPressFired.current) {
			setCtrlState((prev) => {
				if (prev === 'locked') return 'off'
				if (prev === 'latched') return 'off'
				return 'latched'
			})
		}
		longPressFired.current = false
	}, [])

	const baseKeyClass =
		'min-w-[2.5rem] h-9 rounded-md text-xs font-mono select-none cursor-pointer ' +
		'bg-muted border border-border hover:bg-accent active:scale-95 transition-transform ' +
		'flex items-center justify-center touch-manipulation px-1'

	function renderKey(key: Key) {
		if (key.seq === 'ctrl-modifier') {
			const ctrlBg =
				ctrlState === 'locked'
					? 'bg-cyan-500/60 border-cyan-400'
					: ctrlState === 'latched'
						? 'bg-cyan-500/20 border-cyan-500'
						: ''
			return (
				<button
					key='CTRL'
					data-key='CTRL'
					className={`${baseKeyClass} ${ctrlBg}`}
					aria-pressed={ctrlState !== 'off'}
					aria-label={`CTRL ${ctrlState}`}
					data-ctrl-state={ctrlState}
					onTouchStart={handleCtrlTouchStart}
					onTouchEnd={handleCtrlTouchEnd}
					// Prevent click fallback from double-firing
					onClick={(e) => e.preventDefault()}
				>
					CTRL
				</button>
			)
		}

		if (key.seq === 'meta-modifier') {
			return (
				<button
					key='meta'
					data-key='⌘'
					className={baseKeyClass}
					aria-label='Meta modifier'
					onTouchStart={() => {}}
					onTouchEnd={() => {}}
					onClick={(e) => e.preventDefault()}
				>
					⌘
				</button>
			)
		}

		return (
			<button
				key={key.label}
				data-key={key.label}
				className={`${baseKeyClass} ${key.wide ? 'min-w-[3.5rem]' : ''}`}
				aria-label={key.label}
				onTouchStart={() => {}}
				onTouchEnd={() => handleKey(key.seq)}
				// Click fallback for non-touch devices / tests
				onClick={() => handleKey(key.seq)}
			>
				{key.label}
			</button>
		)
	}

	return (
		<div
			className={`sticky bottom-0 z-50 border-t border-border bg-background select-none ${className ?? ''}`}
			data-testid='mobile-key-bar'
		>
			{/* Row 1 */}
			<div className='flex flex-row gap-1 p-1 overflow-x-auto'>
				{ROW_1.map(renderKey)}
			</div>
			{/* Row 2 */}
			<div className='flex flex-row gap-1 px-1 pb-1 overflow-x-auto'>
				{ROW_2.map(renderKey)}
			</div>
		</div>
	)
}
