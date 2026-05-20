/**
 * Phase 169-01 — Vault frontmatter / wikilink parser primitives.
 *
 * `parseFrontmatter(content)` splits a markdown document on its leading
 * `---` fence and parses the YAML head with `js-yaml`. Any malformed YAML
 * (including any custom-tag exploit attempt such as `!!js/function`) is
 * caught and silently downgraded to `{body: <original>}` — the body is
 * never lost. The schema is `CORE_SCHEMA`, the YAML 1.2 safe subset; this
 * is the strictest schema js-yaml v4 exposes (js-yaml v4 deprecated the
 * `SAFE_SCHEMA` symbol used by the v3-era spec; CORE is the modern
 * equivalent and explicitly rejects `!!js/*` custom tags — see
 * threat_model T-169-01-01 mitigation).
 *
 * `extractWikilinks(body)` returns the list of `[[target]]` link targets,
 * stripping the optional `|alias` portion. Non-greedy bounded match —
 * no catastrophic backtracking.
 */

import yaml from 'js-yaml'

export function parseFrontmatter(
	content: string,
): {frontmatter?: Record<string, unknown>; body: string} {
	if (!content.startsWith('---')) {
		return {body: content}
	}
	// Find the closing --- on its own line
	const lines = content.split('\n')
	let closeIdx = -1
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === '---') {
			closeIdx = i
			break
		}
	}
	if (closeIdx === -1) {
		return {body: content}
	}
	const yamlText = lines.slice(1, closeIdx).join('\n')
	const body = lines.slice(closeIdx + 1).join('\n')
	try {
		// CORE_SCHEMA is the YAML 1.2 safe subset — no `!!js/function`,
		// `!!js/regexp`, or `!!js/undefined` custom tags allowed. This is the
		// js-yaml v4 successor to v3's SAFE_SCHEMA (Phase 169-01 deviation
		// Rule 1: plan referenced SAFE_SCHEMA which v4 removed).
		const loaded = yaml.load(yamlText, {schema: yaml.CORE_SCHEMA}) as
			| Record<string, unknown>
			| undefined
		if (loaded && typeof loaded === 'object') {
			return {frontmatter: loaded, body}
		}
		return {body}
	} catch {
		// Malformed YAML — fall through gracefully, surface body only.
		return {body}
	}
}

// Phase 179-01 extension — exported alongside parseFrontmatter.
// Handles three frontmatter.tags shapes: undefined → [], string → [string], string[] → string[].
// Any non-string array element is silently coerced via String() — no crash path.
export function extractTags(frontmatter?: Record<string, unknown>): string[] {
	const raw = frontmatter?.tags
	if (raw === undefined || raw === null) return []
	if (typeof raw === 'string') return raw.length > 0 ? [raw] : []
	if (Array.isArray(raw)) return raw.map(String).filter((s) => s.length > 0)
	return []
}

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g

export function extractWikilinks(body: string): string[] {
	const out: string[] = []
	let m: RegExpExecArray | null
	WIKILINK_RE.lastIndex = 0
	while ((m = WIKILINK_RE.exec(body)) !== null) {
		out.push(m[1].trim())
	}
	return out
}
