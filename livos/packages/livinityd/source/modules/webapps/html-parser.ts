// Phase 92-04 — HTML parser (pure function).
//
// Pulls metadata fields out of an HTML string. Does NOT resolve favicon
// candidates to absolute URLs — that's the favicon-resolver (92-05) job.
// Separation lets us unit-test parsing without URL resolution noise.
//
// Extracted fields:
//   - title:        <title> text content
//   - description:  <meta name="description"> content, with og:description
//                   fallback when the canonical name= variant is absent
//   - ogImage:      <meta property="og:image"> content
//   - faviconCandidates: every <link rel="icon|shortcut icon|apple-touch-icon">
//                   with its href + optional sizes attr; ordered as the parser
//                   encounters them.

import {parse, type HTMLElement} from 'node-html-parser'

export type FaviconCandidate = {
	rel: 'icon' | 'shortcut icon' | 'apple-touch-icon'
	href: string
	sizes?: string
}

export type ParsedMetadata = {
	title?: string
	description?: string
	ogImage?: string
	faviconCandidates: FaviconCandidate[]
}

const FAVICON_RELS = new Set(['icon', 'shortcut icon', 'apple-touch-icon'])

function trimOrUndef(s: string | null | undefined): string | undefined {
	if (typeof s !== 'string') return undefined
	const t = s.trim()
	return t.length > 0 ? t : undefined
}

export function parseMetadata(html: string, _baseUrl: URL): ParsedMetadata {
	// node-html-parser is forgiving: malformed HTML still parses to a tree
	// where missing tags return null rather than throwing.
	const root = parse(html, {
		blockTextElements: {
			script: false,
			noscript: false,
			style: false,
			pre: true,
		},
	})

	const titleNode = root.querySelector('title')
	const title = trimOrUndef(titleNode?.text)

	// description: canonical <meta name="description"> first, with
	// og:description as a graceful fallback (matches CONTEXT.md In-scope #3
	// "<meta property='og:description'> (description fallback)").
	const metaDescNode = root.querySelector('meta[name="description"]')
	const ogDescNode = root.querySelector('meta[property="og:description"]')
	const description =
		trimOrUndef(metaDescNode?.getAttribute('content')) ?? trimOrUndef(ogDescNode?.getAttribute('content'))

	const ogImageNode = root.querySelector('meta[property="og:image"]')
	const ogImage = trimOrUndef(ogImageNode?.getAttribute('content'))

	const faviconCandidates: FaviconCandidate[] = []
	const linkNodes = root.querySelectorAll('link[rel]') as HTMLElement[]
	for (const link of linkNodes) {
		const relRaw = link.getAttribute('rel')
		if (!relRaw) continue
		const rel = relRaw.trim().toLowerCase()
		if (!FAVICON_RELS.has(rel)) continue
		const href = trimOrUndef(link.getAttribute('href'))
		if (!href) continue
		const sizes = trimOrUndef(link.getAttribute('sizes'))
		faviconCandidates.push({
			rel: rel as FaviconCandidate['rel'],
			href,
			sizes,
		})
	}

	return {title, description, ogImage, faviconCandidates}
}
