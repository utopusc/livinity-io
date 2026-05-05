// Regex-keyed dispatch table for per-tool views.
// Usage: <ToolViewRegistry tool={snapshot} />
//
// The registry matches tool.name against regex patterns (in order of specificity).
// First match wins. Falls back to GenericToolView.

import React, {useMemo} from 'react'
import {type ToolCallSnapshot} from '../types'
import {BrowserToolView} from './BrowserToolView'
import {CommandToolView} from './CommandToolView'
import {FileOpToolView} from './FileOpToolView'
import {StrReplaceToolView} from './StrReplaceToolView'
import {WebSearchToolView} from './WebSearchToolView'
import {WebCrawlToolView} from './WebCrawlToolView'
import {WebScrapeToolView} from './WebScrapeToolView'
import {McpToolView} from './McpToolView'
import {GenericToolView} from './GenericToolView'

export interface ToolViewComponentProps {
  tool: ToolCallSnapshot
}
export type ToolViewComponent = React.ComponentType<ToolViewComponentProps>

// Each entry: [pattern, component].
// Pattern is matched against tool.name (case-insensitive).
// Ordered from most-specific to least-specific.
const REGISTRY: Array<[RegExp, ToolViewComponent]> = [
  [/^browser[_\-]/i, BrowserToolView],
  [/^(execute[_\-]command|run[_\-]command|bash|shell|execute[_\-]bash)/i, CommandToolView],
  [/^(read|write|create|delete|full[_\-]file)[_\-]?file/i, FileOpToolView],
  [/^(edit|update)[_\-]?file/i, FileOpToolView],
  [/^str[_\-]replace|^string[_\-]replace/i, StrReplaceToolView],
  [/^web[_\-]search|^search[_\-]web/i, WebSearchToolView],
  [/^web[_\-]crawl|^crawl[_\-]?web(page)?/i, WebCrawlToolView],
  [/^web[_\-]scrape|^scrape[_\-]?web(page)?/i, WebScrapeToolView],
  [/^mcp[_\-]/i, McpToolView],
]

function resolveComponent(name: string): ToolViewComponent {
  for (const [pattern, component] of REGISTRY) {
    if (pattern.test(name)) return component
  }
  return GenericToolView
}

interface ToolViewRegistryProps {
  tool: ToolCallSnapshot
}

/**
 * Dispatches to the correct view component based on tool.name.
 * Pure presentation component — no state, no effects beyond memoization.
 *
 * @example
 * <ToolViewRegistry tool={snapshot} />
 */
export function ToolViewRegistry({tool}: ToolViewRegistryProps) {
  const Component = useMemo(() => resolveComponent(tool.name), [tool.name])
  return <Component tool={tool} />
}

// Named export for programmatic lookup (useful in tests and ToolCallPanel).
export {resolveComponent as resolveToolViewComponent}
