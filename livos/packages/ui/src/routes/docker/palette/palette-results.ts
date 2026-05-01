// Phase 29 Plan 29-01 — buildPaletteResults pure helper (DOC-18).
//
// Builds the categorized result set for the cmd+k command palette. Pure
// (no React, no I/O) so it's trivially unit-testable; the modal component
// just memoizes the call against query + the various resource lists.
//
// Scoring algorithm:
//   - Lowercase the query (capped at 200 chars, T-29-01 ReDoS-class bound).
//   - For each candidate item: lowercase its label; .indexOf(q).
//     -1 → not a match (filtered out).
//     0 → prefix match (best score).
//     >0 → mid-substring match (lower indexOf is closer to the head).
//   - Sort each category ascending by score; tie-break alpha-asc by label.
//   - Cap each category at MAX_PER_CATEGORY (8) to keep the palette
//     readable and bound the per-keystroke render cost.
//
// Empty query: skip filtering; alpha-sort each category and cap at 8.
// Sections category is a constant list of {id, label} pairs that's always
// rendered — even on empty query — because it's the navigation-by-section
// shortcut path.

import {SECTION_IDS, type SectionId} from '../store'

export type ResultCategory =
	| 'containers'
	| 'stacks'
	| 'images'
	| 'volumes'
	| 'networks'
	| 'environments'
	| 'sections'

export interface PaletteResult {
	category: ResultCategory
	id: string // resource id/name to feed setSelectedX or setSection
	label: string // user-visible
	sublabel?: string
}

export interface CategorizedResults {
	containers: PaletteResult[]
	stacks: PaletteResult[]
	images: PaletteResult[]
	volumes: PaletteResult[]
	networks: PaletteResult[]
	environments: PaletteResult[]
	sections: PaletteResult[]
}

export interface PaletteResultsInput {
	query: string
	containers: Array<{name: string}>
	stacks: Array<{name: string}>
	images: Array<{id: string; repoTags?: readonly string[]}>
	volumes: Array<{name: string}>
	networks: Array<{id: string; name: string}>
	environments: Array<{id: string; name: string}>
}

const MAX_PER_CATEGORY = 8
const MAX_QUERY_LEN = 200

/** Friendly labels for SectionId — matches sidebar.tsx SECTION_META. */
const SECTION_LABELS: Record<SectionId, string> = {
	dashboard: 'Dashboard',
	containers: 'Containers',
	logs: 'Logs',
	shell: 'Shell',
	stacks: 'Stacks',
	images: 'Images',
	volumes: 'Volumes',
	networks: 'Networks',
	registry: 'Registry',
	activity: 'Activity',
	// Phase 46-04 — Security (fail2ban admin) — added in Wave 4 alongside the
	// 13th sidebar entry. Friendly label matches sidebar.tsx SECTION_META.
	security: 'Security',
	schedules: 'Schedules',
	settings: 'Settings',
}

const SECTION_RESULTS: PaletteResult[] = SECTION_IDS.map((id) => ({
	category: 'sections' as const,
	id,
	label: SECTION_LABELS[id],
}))

interface ScoredResult {
	result: PaletteResult
	score: number // -1 means no match; otherwise indexOf (0=best)
}

/** Score against a query (already lowercased + length-capped). */
function score(label: string, q: string): number {
	if (!q) return 0 // empty query → all match equally
	return label.toLowerCase().indexOf(q)
}

/**
 * Filter + sort + cap one category's candidate list. `keyOf` extracts the
 * primary id, `labelOf` the user-visible name. `sublabelOf` is optional.
 */
function buildCategory<T>(
	items: readonly T[],
	q: string,
	category: ResultCategory,
	keyOf: (t: T) => string,
	labelOf: (t: T) => string,
	sublabelOf?: (t: T) => string | undefined,
): PaletteResult[] {
	const scored: ScoredResult[] = []
	for (const item of items) {
		const id = keyOf(item)
		const label = labelOf(item)
		const s = score(label, q)
		if (q && s < 0) continue
		scored.push({
			result: {category, id, label, sublabel: sublabelOf?.(item)},
			score: q ? s : 0,
		})
	}
	// Sort: ascending score (prefix matches first); tie-break alpha-asc.
	scored.sort((a, b) => {
		if (a.score !== b.score) return a.score - b.score
		return a.result.label.localeCompare(b.result.label)
	})
	return scored.slice(0, MAX_PER_CATEGORY).map((s) => s.result)
}

export function buildPaletteResults(input: PaletteResultsInput): CategorizedResults {
	// T-29-01: cap query length BEFORE any indexOf — defensive bound on the
	// per-keystroke cost of the palette as the user types.
	const q = input.query.slice(0, MAX_QUERY_LEN).trim().toLowerCase()

	const containers = buildCategory(
		input.containers,
		q,
		'containers',
		(c) => c.name,
		(c) => c.name,
	)

	const stacks = buildCategory(
		input.stacks,
		q,
		'stacks',
		(s) => s.name,
		(s) => s.name,
	)

	const images = buildCategory(
		input.images,
		q,
		'images',
		(i) => i.id,
		(i) => (i.repoTags && i.repoTags[0]) || i.id,
	)

	const volumes = buildCategory(
		input.volumes,
		q,
		'volumes',
		(v) => v.name,
		(v) => v.name,
	)

	const networks = buildCategory(
		input.networks,
		q,
		'networks',
		(n) => n.id,
		(n) => n.name,
	)

	const environments = buildCategory(
		input.environments,
		q,
		'environments',
		(e) => e.id,
		(e) => e.name,
	)

	// Sections — match against label only. Always populated regardless of q
	// (when q is empty, all sections; when q matches some, just those).
	const sectionScored: ScoredResult[] = []
	for (const sec of SECTION_RESULTS) {
		const s = score(sec.label, q)
		if (q && s < 0) continue
		sectionScored.push({result: sec, score: q ? s : 0})
	}
	sectionScored.sort((a, b) => {
		if (a.score !== b.score) return a.score - b.score
		return a.result.label.localeCompare(b.result.label)
	})
	const sections = sectionScored.slice(0, MAX_PER_CATEGORY).map((s) => s.result)

	return {containers, stacks, images, volumes, networks, environments, sections}
}
