// Phase 178-01 — D-V38-O OKLCH palette for vault-graph nodes + edges.
//
// Replaces the inline NODE_COLORS hex dictionary in VaultGraph.tsx with a
// theme-aware palette function. Edge styling delegates to CSS vars from
// @livinity/design-tokens (--line-strong) so the legacy tokens automatically
// follow body.dark / body.iridescent swaps.
//
// Iridescent neutrals are NOT yet present in tokens.css (the body.iridescent
// block is empty per D-116-FOLLOW-UP-IRIDESCENT); we therefore define the
// iridescent palette inline here. Once tokens.css ships iridescent neutrals
// these values can be migrated to var() references.

export type GraphNodeType =
	| 'memory'
	| 'session'
	| 'inbox'
	| 'agent'
	| 'skill'
	| 'command'
	| 'root'

export type GraphTheme = 'light' | 'dark' | 'iridescent'

// D-V38-O 7-type curated palette in OKLCH.
// Per-theme L/C/H per the behavior block above.
export const PALETTE: Record<GraphTheme, Record<GraphNodeType, string>> = {
	light: {
		memory: 'oklch(0.56 0.10 245)',
		session: 'oklch(0.55 0.15 295)',
		inbox: 'oklch(0.70 0.14 75)',
		agent: 'oklch(0.62 0.10 180)',
		skill: 'oklch(0.62 0.09 145)',
		command: 'oklch(0.50 0.12 340)',
		root: 'oklch(0.65 0.01 270)',
	},
	dark: {
		memory: 'oklch(0.66 0.10 245)',
		session: 'oklch(0.65 0.15 295)',
		inbox: 'oklch(0.80 0.14 75)',
		agent: 'oklch(0.72 0.10 180)',
		skill: 'oklch(0.72 0.09 145)',
		command: 'oklch(0.60 0.12 340)',
		root: 'oklch(0.75 0.01 270)',
	},
	iridescent: {
		memory: 'oklch(0.61 0.12 245)',
		session: 'oklch(0.60 0.17 295)',
		inbox: 'oklch(0.75 0.16 75)',
		agent: 'oklch(0.67 0.12 180)',
		skill: 'oklch(0.67 0.11 145)',
		command: 'oklch(0.55 0.14 340)',
		root: 'oklch(0.70 0.03 270)',
	},
}

export function getNodeColor(type: GraphNodeType, theme: GraphTheme): string {
	return PALETTE[theme][type]
}

export function getEdgeColor(_theme: GraphTheme): string {
	// CSS var auto-resolves per body class (light/dark) via tokens.css.
	return 'var(--line-strong)'
}

export function getEdgeHoverColor(
	sourceType: GraphNodeType,
	theme: GraphTheme,
): string {
	const base = PALETTE[theme][sourceType]
	// base is 'oklch(L C H)' — append ' / 0.6' inside parens.
	return base.replace(/\)$/, ' / 0.6)')
}

// Detect active theme from document.body. Defaults to 'light' when body
// has neither .dark nor .iridescent class (SSR / first-paint safety).
export function detectTheme(): GraphTheme {
	if (typeof document === 'undefined') return 'light'
	if (document.body.classList.contains('iridescent')) return 'iridescent'
	if (document.body.classList.contains('dark')) return 'dark'
	return 'light'
}
