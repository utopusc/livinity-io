/** Tool view dispatcher — Phase 68-04 (skeleton) → 69-05 (specific views wired).
 *  Maps toolName → React.FC<ToolViewProps>.
 *
 *  Spec: 68-CONTEXT.md D-20..D-22 + 69-CONTEXT.md D-28 + v31-DRAFT line 354.
 *
 *  P69-05 wires the 8 specific tool views from P69-01..P69-04. Default fallback
 *  remains GenericToolView for unknown tool names.
 */

import {useMemo} from 'react'
import type {FC} from 'react'

import {BrowserToolView} from './browser-tool-view'
import {CommandToolView} from './command-tool-view'
import {FileOperationToolView} from './file-operation-tool-view'
import {GenericToolView} from './generic-tool-view'
import {McpToolView} from './mcp-tool-view'
import {StrReplaceToolView} from './str-replace-tool-view'
import type {ToolViewProps} from './types'
import {WebCrawlToolView} from './web-crawl-tool-view'
import {WebScrapeToolView} from './web-scrape-tool-view'
import {WebSearchToolView} from './web-search-tool-view'

/**
 * Resolves a toolName to its renderer component.
 *
 * P69 routes 8 specific views; unknown tools fall through to GenericToolView.
 */
export function getToolView(toolName: string): FC<ToolViewProps> {
	// Visual tools — auto-open the side panel (per STATE.md line 79)
	if (toolName.startsWith('browser-')) {
		return BrowserToolView
	}
	if (toolName.startsWith('computer-use-')) {
		return BrowserToolView
	}
	if (toolName === 'screenshot' || toolName.startsWith('screenshot-')) {
		return BrowserToolView
	}

	// Terminal / shell
	if (toolName.startsWith('execute-') || toolName === 'run-command') {
		return CommandToolView
	}

	// File ops
	if (toolName.startsWith('file-') || toolName === 'read-file' || toolName === 'write-file') {
		return FileOperationToolView
	}

	// String-replace edits
	if (toolName === 'str-replace' || toolName === 'str-replace-editor') {
		return StrReplaceToolView
	}

	// Web tools
	if (toolName === 'web-search' || toolName === 'search-web') {
		return WebSearchToolView
	}
	if (toolName === 'web-crawl' || toolName === 'crawl-website') {
		return WebCrawlToolView
	}
	if (toolName === 'web-scrape' || toolName === 'scrape-page') {
		return WebScrapeToolView
	}

	// MCP tools (Suna pattern: mcp_ prefix; alternate mcp- prefix)
	if (toolName.startsWith('mcp_') || toolName.startsWith('mcp-')) {
		return McpToolView
	}

	// Fallback for unknown tool names
	return GenericToolView
}

/** Memoized hook variant — re-resolves only when toolName changes. */
export function useToolView(toolName: string): FC<ToolViewProps> {
	return useMemo(() => getToolView(toolName), [toolName])
}
