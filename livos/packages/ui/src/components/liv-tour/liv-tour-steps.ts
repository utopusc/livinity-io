/**
 * Phase 76 Plan 76-05 — Locked tour-step manifest.
 *
 * Per CONTEXT D-15 the 9-step sequence is the contract every downstream
 * `data-tour="*"` selector must satisfy. The IDs / titles / bodies below are
 * verbatim from D-15 — DO NOT bikeshed copy without updating the CONTEXT.
 *
 * Selectors locked here are the public API of the tour. Phase 76-07 wires
 * the `data-tour="composer" / "slash-hint" / "agent-picker" / "liv-tool-panel"
 * / "reasoning-card" / "marketplace-link"` attributes onto the existing
 * components. If a downstream phase moves a target, the tour breaks loudly
 * (Spotlight will console.warn + skip the cutout — production-safe degrade).
 *
 * Step 5 (`demo-prompt`) populates the composer draft — wired in
 * `index.tsx` via the `onSetComposerDraft` callback prop (D-14
 * non-destructive: tour does NOT auto-click Send).
 */

export type LivTourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center'

export type LivTourStep = {
	id: string
	/** CSS selector for the anchor element. Omit for centered modal steps. */
	targetSelector?: string
	title: string
	body: string
	placement?: LivTourPlacement
	onEnter?: () => void
	onExit?: () => void
}

export const LIV_TOUR_STEPS: LivTourStep[] = [
	{
		id: 'welcome',
		placement: 'center',
		title: 'Meet Liv.',
		body: "Your AI agent for everyday tasks. Let's take a 60-second tour.",
	},
	{
		id: 'composer',
		targetSelector: '[data-tour="composer"]',
		placement: 'top',
		title: 'Talk to Liv.',
		body: 'Type a message here. Liv understands plain English — no commands required.',
	},
	{
		id: 'slash-cmd',
		targetSelector: '[data-tour="slash-hint"]',
		placement: 'top',
		title: 'Slash for shortcuts.',
		body: 'Press / to access commands like search, browse, or take a screenshot.',
	},
	{
		id: 'agent-picker',
		targetSelector: '[data-tour="agent-picker"]',
		placement: 'bottom',
		title: 'Switch agents anytime.',
		body: 'Different jobs need different specialists. Pick one that fits.',
	},
	{
		id: 'demo-prompt',
		targetSelector: '[data-tour="composer"]',
		placement: 'top',
		title: 'Try this.',
		body: "I've dropped a prompt in the composer. Click Send to watch Liv work.",
		// onEnter is wired by LivTour root via the onSetComposerDraft prop
		// rather than statically here — keeps step manifest pure / serialisable.
	},
	{
		id: 'side-panel',
		targetSelector: '[data-tour="liv-tool-panel"]',
		placement: 'left',
		title: 'Watch Liv work.',
		body: "Liv's actions and screenshots stream here in real time.",
	},
	{
		id: 'reasoning-card',
		targetSelector: '[data-tour="reasoning-card"]',
		placement: 'top',
		title: 'See the why.',
		body: 'Liv shows its reasoning so you can audit the steps.',
	},
	{
		id: 'marketplace',
		targetSelector: '[data-tour="marketplace-link"]',
		placement: 'right',
		title: 'Get more agents.',
		body: 'Browse the marketplace for opinionated presets — Researcher, Writer, Coder, more.',
	},
	{
		id: 'done',
		placement: 'center',
		title: "You're all set.",
		body: 'You can replay this tour anytime from Settings → Liv Agent. Press Esc to close.',
	},
]
