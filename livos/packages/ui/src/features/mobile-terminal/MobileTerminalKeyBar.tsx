// Phase 181-02 — MobileTerminalKeyBar stub
// Full implementation in Plan 181-02.

import type {JSX} from 'react'

interface MobileTerminalKeyBarProps {
	/** Called with the escape sequence string to write to PTY stdin */
	onKey: (seq: string) => void
	className?: string
}

export function MobileTerminalKeyBar({onKey: _onKey, className: _className}: MobileTerminalKeyBarProps): JSX.Element {
	return <div data-testid='mobile-key-bar-stub' />
}
