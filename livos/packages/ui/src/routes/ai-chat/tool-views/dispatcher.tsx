/** Tool view dispatcher — Phase 68-04.
 *  Maps toolName → React.FC<ToolViewProps>. P68 ships with all cases
 *  falling through to GenericToolView. P69 replaces individual cases
 *  with specific views (BrowserToolView, CommandToolView, etc.).
 *
 *  Spec: CONTEXT D-20..D-22 + v31-DRAFT line 354.
 */

import {useMemo} from 'react'
import type {FC} from 'react'

import {GenericToolView} from './generic-tool-view'
import type {ToolViewProps} from './types'

/**
 * Resolves a toolName to its renderer component.
 *
 * P68 returns GenericToolView for everything. P69 plans replace
 * individual cases. The switch is structured by toolName prefix
 * matching v31-DRAFT line 354.
 */
export function getToolView(toolName: string): FC<ToolViewProps> {
	// Visual tools — auto-open the side panel (per STATE.md line 79)
	if (toolName.startsWith('browser-')) {
		// TODO(P69-01): replace with BrowserToolView
		return GenericToolView
	}
	if (toolName.startsWith('computer-use-')) {
		// TODO(P69-01): replace with BrowserToolView (computer-use mode)
		return GenericToolView
	}
	if (toolName === 'screenshot' || toolName.startsWith('screenshot-')) {
		// TODO(P69-01): replace with BrowserToolView (screenshot mode)
		return GenericToolView
	}

	// Terminal / shell
	if (toolName.startsWith('execute-') || toolName === 'run-command') {
		// TODO(P69-02): replace with CommandToolView
		return GenericToolView
	}

	// File ops
	if (toolName.startsWith('file-') || toolName === 'read-file' || toolName === 'write-file') {
		// TODO(P69-03): replace with FileOperationToolView
		return GenericToolView
	}

	// String-replace edits
	if (toolName === 'str-replace' || toolName === 'str-replace-editor') {
		// TODO(P69-04): replace with StrReplaceToolView
		return GenericToolView
	}

	// Web tools
	if (toolName === 'web-search' || toolName === 'search-web') {
		// TODO(P69-05): replace with WebSearchToolView
		return GenericToolView
	}
	if (toolName === 'web-crawl' || toolName === 'crawl-website') {
		// TODO(P69-06): replace with WebCrawlToolView
		return GenericToolView
	}
	if (toolName === 'web-scrape' || toolName === 'scrape-page') {
		// TODO(P69-07): replace with WebScrapeToolView
		return GenericToolView
	}

	// MCP tools (Suna pattern: mcp_ prefix)
	if (toolName.startsWith('mcp_') || toolName.startsWith('mcp-')) {
		// TODO(P69-08): replace with McpToolView
		return GenericToolView
	}

	// Fallback
	return GenericToolView
}

/** Memoized hook variant — re-resolves only when toolName changes. */
export function useToolView(toolName: string): FC<ToolViewProps> {
	return useMemo(() => getToolView(toolName), [toolName])
}
