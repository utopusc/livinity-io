// Phase 176-04 — Liv Welcome Terminal.
//
// Shown in ai-chat route's terminal tab when the vault has no Items.
// Wraps CcTerminal with a deterministic tmux session name so Liv's CC
// session is always "livos-liv-root-<safeUserId>".
//
// Security: userId is sanitized via SAFE_ID_RE before embedding in the
// tmux session name (T-176-04-01 mitigation — no shell metachar injection).
// Mirrors Phase 166 CcPtyManager USER_ID_RE precedent.

import {CcTerminal} from '@/features/cc-terminal'

// Allow alphanumeric + hyphen only. Mirrors Phase 166 CcPtyManager USER_ID_RE.
const SAFE_ID_RE = /[^a-zA-Z0-9-]/g

function sanitizeUserId(userId: string): string {
	const safe = userId.replace(SAFE_ID_RE, '')
	return safe.length > 0 ? safe : 'anonymous'
}

export interface LivWelcomeTerminalProps {
	userId: string
	loading?: boolean
}

export function LivWelcomeTerminal({userId, loading = false}: LivWelcomeTerminalProps) {
	const safeId = sanitizeUserId(userId)
	const sessionId = `livos-liv-root-${safeId}`

	if (loading) {
		return (
			<div data-testid='liv-welcome-terminal' className='flex h-full items-center justify-center'>
				<div className='h-8 w-48 animate-pulse rounded bg-border' />
			</div>
		)
	}

	return (
		<div data-testid='liv-welcome-terminal' className='flex h-full flex-col'>
			<div className='flex items-center gap-2 border-b border-border px-4 py-2 text-sm text-text-secondary'>
				<span className='font-semibold text-primary'>Liv</span>
				<span>Hi, I'm Liv. Tell me what to build...</span>
			</div>
			<div className='flex-1 overflow-hidden'>
				<CcTerminal sessionId={sessionId} />
			</div>
		</div>
	)
}
