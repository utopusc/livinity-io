// Web scrape view: URL + extracted content via MCPContentRenderer.

import React, {useMemo} from 'react'
import {IconRadar, IconLoader2, IconExternalLink} from '@tabler/icons-react'
import {type ToolCallSnapshot} from '../types'
import {ToolViewWrapper} from './ToolViewWrapper'
import {MCPContentRenderer} from './MCPContentRenderer'

interface WebScrapeToolViewProps {
  tool: ToolCallSnapshot
}

interface ParsedScrapeResult {
  url?: string
  content?: unknown
}

function parseScrapeResult(
  input: Record<string, unknown>,
  output: string | undefined,
): ParsedScrapeResult {
  const url =
    (input.url as string | undefined) ??
    (input.target_url as string | undefined) ??
    (input.site as string | undefined)

  if (!output) return {url}

  try {
    const parsed = JSON.parse(output)
    // Prefer structured content; fall back to the entire parsed object
    const content =
      parsed.content ?? parsed.text ?? parsed.markdown ?? parsed.data ?? parsed
    return {
      url: url ?? (parsed.url as string | undefined),
      content,
    }
  } catch {
    return {url, content: output}
  }
}

function getFavicon(url: string): string {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`
  } catch {
    return ''
  }
}

export function WebScrapeToolView({tool}: WebScrapeToolViewProps) {
  const parsed = useMemo(
    () => parseScrapeResult(tool.input, tool.output),
    [tool.input, tool.output],
  )

  const favicon = parsed.url ? getFavicon(parsed.url) : ''

  return (
    <ToolViewWrapper
      tool={tool}
      icon={<IconRadar className="h-5 w-5 text-violet-500" />}
      title="Scrape Webpage"
    >
      {tool.status === 'running' ? (
        <RunningState url={parsed.url} />
      ) : (
        <div className="p-4 space-y-3">
          {/* URL header */}
          {parsed.url && (
            <div className="flex items-center gap-2 rounded-lg border border-liv-border bg-liv-muted/50 px-3 py-2 group">
              {favicon && (
                <img
                  src={favicon}
                  alt=""
                  className="h-4 w-4 rounded shrink-0"
                  onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                />
              )}
              <p className="flex-1 text-xs font-mono text-liv-muted-foreground truncate">
                {parsed.url}
              </p>
              <a
                href={parsed.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open URL"
                className="shrink-0 text-liv-muted-foreground hover:text-liv-card-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <IconExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}

          {/* Content via MCPContentRenderer */}
          {parsed.content != null ? (
            <div className="rounded-lg border border-liv-border overflow-hidden">
              <MCPContentRenderer content={parsed.content} />
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
      )}
    </ToolViewWrapper>
  )
}

function RunningState({url}: {url?: string}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="relative w-16 h-16 flex items-center justify-center rounded-full bg-violet-500/10 border border-violet-500/20">
        <IconRadar className="h-8 w-8 text-violet-500" />
        <span className="absolute inset-0 rounded-full border-2 border-violet-500/30 animate-pulse" />
      </div>
      <p className="text-sm font-medium text-liv-card-foreground">Scraping webpage</p>
      {url && (
        <p className="text-xs font-mono text-liv-muted-foreground truncate max-w-xs">{url}</p>
      )}
      <IconLoader2 className="h-4 w-4 text-liv-muted-foreground animate-spin" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-liv-muted-foreground">
      <IconRadar className="h-8 w-8 opacity-30" />
      <p className="text-sm">No content extracted</p>
    </div>
  )
}
