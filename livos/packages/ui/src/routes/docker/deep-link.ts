// Phase 29 Plan 29-02 — Deep-link helpers (DOC-20 final closure).
//
// Pure helpers for the URI shape `livinity://docker/<section>[/<id>]`.
// Used by:
//   - The Copy Deep Link button on every detail panel (this plan).
//   - (Future v29.0+) A window.location parser that opens the docker app
//     to a specific section/resource when the URI is typed in the address
//     bar — programmatic API stays ready, no consumer in v28.0.
//
// The valid-section check is anchored to SECTION_IDS (the runtime list
// already exported by ./store), so adding a new section automatically
// extends the valid set. Invalid input fails closed (returns null) — no
// code-execution path from a malformed URI (T-29-19).

import {SECTION_IDS, type SectionId} from './store'

const SCHEME = 'livinity'
const HOST = 'docker'
const VALID_SECTIONS = new Set<string>(SECTION_IDS)

export function buildDeepLink(opts: {section: SectionId; id?: string}): string {
	if (!VALID_SECTIONS.has(opts.section)) {
		throw new Error(`[invalid-section] ${opts.section}`)
	}
	const base = `${SCHEME}://${HOST}/${opts.section}`
	return opts.id !== undefined ? `${base}/${encodeURIComponent(opts.id)}` : base
}

export interface ParsedDeepLink {
	section: SectionId
	id?: string
}

export function parseDeepLink(uri: string | null | undefined): ParsedDeepLink | null {
	if (!uri) return null
	let url: URL
	try {
		url = new URL(uri)
	} catch {
		return null
	}
	if (url.protocol !== `${SCHEME}:`) return null
	if (url.hostname !== HOST) return null
	const parts = url.pathname.replace(/^\/+/, '').split('/').filter(Boolean)
	if (parts.length === 0 || parts.length > 2) return null
	const section = parts[0]
	if (!VALID_SECTIONS.has(section)) return null
	if (parts.length === 2) {
		try {
			return {section: section as SectionId, id: decodeURIComponent(parts[1])}
		} catch {
			return null
		}
	}
	return {section: section as SectionId}
}

/**
 * Convenience: builds the deep link AND copies it to the clipboard. Throws if
 * the section is invalid or the clipboard write fails (caller should toast).
 */
export async function copyDeepLinkToClipboard(opts: {
	section: SectionId
	id?: string
}): Promise<string> {
	const link = buildDeepLink(opts)
	await navigator.clipboard.writeText(link)
	return link
}
