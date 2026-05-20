// Phase 181-04 — MobileBubbleChat stub
// Full implementation in Plan 181-04.

import type {JSX} from 'react'

interface MobileBubbleChatProps {
	sessionId: string
	className?: string
}

export function MobileBubbleChat({sessionId: _sessionId, className: _className}: MobileBubbleChatProps): JSX.Element {
	return <div data-testid='mobile-bubble-chat-stub' />
}
