/**
 * Shared helpers for tool-views — Phase 69-02 (CONTEXT D-09).
 *
 * Re-used across BrowserToolView (P69-01), FileOperationToolView,
 * StrReplaceToolView (this plan), McpToolView (P69-04), and the
 * eventual LivToolRow row (P69-04). NOT a barrel — D-30 forbids
 * `tool-views/index.ts`. Importers reach this file directly.
 *
 * The file is `.tsx` (not `.ts`) because `colorizeDiff` returns JSX.
 * The plan (`files_modified`) lists `utils.ts` for naming clarity, but
 * the on-disk path is `utils.tsx`. SUMMARY.md documents the rename.
 *
 * D-NO-NEW-DEPS: this module imports only from `@/icons/liv-icons`
 * (P66-04, in-tree) and `@/stores/liv-tool-panel-store` (P68-01,
 * in-tree). No Shiki/Prism — those are explicitly forbidden until
 * P75-05 ships the dep.
 */

import type {ReactNode} from 'react'

import type {TablerIcon} from '@tabler/icons-react'

import {LivIcons} from '@/icons/liv-icons'
import {isVisualTool as _isVisualTool} from '@/stores/liv-tool-panel-store'

/**
 * Re-export of `isVisualTool` (P68-01). Source of truth lives in
 * `liv-tool-panel-store.ts`; we expose it here so per-tool views can
 * import the helper alongside other tool-view utilities without
 * reaching into the panel-store namespace.
 */
export const isVisualTool = _isVisualTool

/**
 * Convert a raw tool name (kebab/snake_case) into a user-friendly
 * Title Case label. Suna pattern.
 *
 *   'browser-navigate'    → 'Browser Navigate'
 *   'execute_command'     → 'Execute Command'
 *   'mcp_brave_search'    → 'Mcp Brave Search'
 *   ''                    → ''
 */
export function getUserFriendlyToolName(toolName: string): string {
	if (!toolName) return ''
	return toolName
		.replace(/[-_]/g, ' ')
		.split(' ')
		.map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
		.join(' ')
		.trim()
}

/**
 * Map a tool name to a Tabler icon component (CONTEXT D-09 ladder).
 * Uses prefix/regex matching against the `LivIcons` map (P66-04).
 * Falls back to `LivIcons.generic` for unknown tools — purely cosmetic.
 *
 *   'browser-navigate'    → LivIcons.browser
 *   'computer-use-click'  → LivIcons.screenShare
 *   'screenshot'          → LivIcons.screenShare
 *   'execute-command'     → LivIcons.terminal
 *   'str-replace'         → LivIcons.fileEdit
 *   'read-file'           → LivIcons.file
 *   'web-search'          → LivIcons.webSearch
 *   'mcp_brave_search'    → LivIcons.mcp
 *   'totally-unknown'     → LivIcons.generic
 */
export function getToolIcon(toolName: string): TablerIcon {
	if (toolName.startsWith('browser-')) return LivIcons.browser
	if (toolName.startsWith('computer-use-') || toolName.startsWith('screenshot')) return LivIcons.screenShare
	if (toolName.startsWith('execute-') || toolName === 'run-command') return LivIcons.terminal
	if (toolName.startsWith('str-replace')) return LivIcons.fileEdit
	if (
		toolName.startsWith('file-') ||
		/^(read|write|delete|list|create)-?(file|files)?$/.test(toolName)
	)
		return LivIcons.file
	if (toolName.startsWith('web-search') || toolName === 'search-web') return LivIcons.webSearch
	if (toolName.startsWith('web-crawl') || toolName === 'crawl-website') return LivIcons.webCrawl
	if (toolName.startsWith('web-scrape') || toolName === 'scrape-page') return LivIcons.webScrape
	if (toolName.startsWith('mcp_') || toolName.startsWith('mcp-')) return LivIcons.mcp
	return LivIcons.generic
}

/**
 * Colorize a unified-diff-style text. Lines starting with `+` get the
 * emerald accent, lines starting with `-` get the rose accent, all
 * others get the muted secondary color. Empty input → empty array.
 *
 * Returns React.ReactNode[] — caller renders inside a `<pre>` block.
 * Empty lines render as a single space (NBSP equivalent) so the `<div>`
 * still occupies its row height.
 *
 * Body kept short per v31-DRAFT line 479 (≤ 12 LOC).
 */
export function colorizeDiff(diffText: string): ReactNode[] {
	if (!diffText) return []
	return diffText.split('\n').map((line, idx) => {
		const cls = line.startsWith('+')
			? 'text-[color:var(--liv-accent-emerald)]'
			: line.startsWith('-')
				? 'text-[color:var(--liv-accent-rose)]'
				: 'text-[color:var(--liv-text-secondary)]'
		return (
			<div key={idx} className={cls}>
				{line || ' '}
			</div>
		)
	})
}

/**
 * Multi-strategy screenshot parser (Suna pattern, 4 strategies).
 *
 *   1. `{content: [{type: 'image', source: {data, media_type?}}]}` →
 *      `data:<media_type>;base64,<data>` (default media_type image/png).
 *   2. `"ToolResult(output='<captured>')"` string → captured group.
 *      If captured starts with `data:` or `http(s)://` → returned as-is.
 *      Otherwise wrapped as `data:image/png;base64,<captured>` (best-guess).
 *   3. `{image_url: <string>}` → URL string.
 *   4. `messages` arg fallback → reserved for P75 (TODO P75 marker).
 *      The argument is accepted but silently ignored in P69.
 *
 * Returns `null` for null/undefined input or when no strategy matches.
 */
export function extractScreenshot(toolResult: unknown, messages?: unknown[]): string | null {
	if (toolResult === null || toolResult === undefined) return null

	// Strategy 1: object with content array containing image source.
	if (typeof toolResult === 'object' && toolResult !== null && 'content' in toolResult) {
		const content = (toolResult as {content?: unknown[]}).content
		if (Array.isArray(content)) {
			for (const item of content) {
				if (
					typeof item === 'object' &&
					item !== null &&
					(item as {type?: string}).type === 'image' &&
					typeof (item as {source?: unknown}).source === 'object' &&
					(item as {source?: unknown}).source !== null &&
					typeof (item as {source: {data?: unknown}}).source.data === 'string'
				) {
					const src = (item as {source: {data: string; media_type?: string}}).source
					const mime = src.media_type || 'image/png'
					return `data:${mime};base64,${src.data}`
				}
			}
		}
	}

	// Strategy 2: string match ToolResult(output='...').
	if (typeof toolResult === 'string') {
		const m = toolResult.match(/ToolResult\(output='([^']+)'\)/)
		if (m) {
			const captured = m[1]
			if (
				captured.startsWith('data:') ||
				captured.startsWith('http://') ||
				captured.startsWith('https://')
			) {
				return captured
			}
			// Best-guess wrap for raw base64 captures.
			return `data:image/png;base64,${captured}`
		}
	}

	// Strategy 3: object with image_url field.
	if (typeof toolResult === 'object' && toolResult !== null && 'image_url' in toolResult) {
		const url = (toolResult as {image_url?: unknown}).image_url
		if (typeof url === 'string') return url
	}

	// Strategy 4: messages-array scan — TODO(P75): walk prior assistant
	// messages for image content. Reserved here so callers (BrowserToolView)
	// can pass the messages list today and start picking up Strategy-4
	// hits the moment P75 ships, with no API change.
	void messages
	return null
}
