// Web search result view.
// Parses tool.output for search result arrays and renders as result cards.

import React, {useMemo} from 'react'
import {IconSearch, IconExternalLink, IconWorld, IconLoader2} from '@tabler/icons-react'
import {type ToolCallSnapshot} from '../types'
import {ToolViewWrapper} from './ToolViewWrapper'

interface WebSearchToolViewProps {
  tool: ToolCallSnapshot
}

interface SearchResult {
  title: string
  url: string
  snippet?: string
}

interface ParsedSearchResult {
  query?: string
  results: SearchResult[]
}

function parseSearchOutput(
  input: Record<string, unknown>,
  output: string | undefined,
): ParsedSearchResult {
  const query =
    (input.query as string | undefined) ??
    (input.q as string | undefined) ??
    (input.search_query as string | undefined)

  if (!output) return {query, results: []}

  try {
    const parsed = JSON.parse(output)

    // Various API shapes
    let items: unknown[] = []
    if (Array.isArray(parsed)) items = parsed
    else if (Array.isArray(parsed.results)) items = parsed.results
    else if (Array.isArray(parsed.organic_results)) items = parsed.organic_results
    else if (Array.isArray(parsed.data)) items = parsed.data
    else if (Array.isArray(parsed.items)) items = parsed.items

    const results: SearchResult[] = items
      .filter((i) => i !== null && typeof i === 'object')
      .map((item) => {
        const o = item as Record<string, unknown>
        return {
          title: String(o.title ?? o.name ?? 'Untitled'),
          url: String(o.url ?? o.link ?? o.href ?? ''),
          snippet: (o.snippet ?? o.description ?? o.summary ?? o.content ?? '') as string,
        }
      })
      .filter((r) => r.url)

    return {query, results}
  } catch {
    return {query, results: []}
  }
}

function getFavicon(url: string): string {
  try {
    const {hostname} = new URL(url)
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`
  } catch {
    return ''
  }
}

export function WebSearchToolView({tool}: WebSearchToolViewProps) {
  const {query, results} = useMemo(
    () => parseSearchOutput(tool.input, tool.output),
    [tool.input, tool.output],
  )

  return (
    <ToolViewWrapper
      tool={tool}
      icon={<IconSearch className="h-5 w-5 text-blue-500" />}
      title="Web Search"
    >
      {tool.status === 'running' ? (
        <RunningState query={query} />
      ) : results.length > 0 ? (
        <div className="p-4 space-y-3">
          {query && (
            <div className="flex items-center gap-2 text-xs text-liv-muted-foreground">
              <IconSearch className="h-3.5 w-3.5 shrink-0" />
              <span className="italic">&ldquo;{query}&rdquo;</span>
              <span className="ml-auto">{results.length} result{results.length !== 1 ? 's' : ''}</span>
            </div>
          )}
          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {results.map((result, idx) => {
              const favicon = getFavicon(result.url)
              return (
                <div
                  key={idx}
                  className="rounded-lg border border-liv-border bg-liv-background p-3 hover:border-blue-500/30 transition-colors group"
                >
                  <div className="flex items-start gap-2">
                    {favicon && (
                      <img
                        src={favicon}
                        alt=""
                        className="h-4 w-4 rounded mt-0.5 shrink-0"
                        onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline line-clamp-1"
                      >
                        {result.title}
                      </a>
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-liv-muted-foreground">
                        <IconWorld className="h-3 w-3 shrink-0" />
                        <span className="truncate">{result.url}</span>
                      </div>
                      {result.snippet && (
                        <p className="text-xs text-liv-muted-foreground mt-1.5 line-clamp-2">
                          {result.snippet}
                        </p>
                      )}
                    </div>
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open result"
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-liv-muted-foreground hover:text-liv-card-foreground transition-opacity"
                    >
                      <IconExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <EmptyState query={query} />
      )}
    </ToolViewWrapper>
  )
}

function RunningState({query}: {query?: string}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="relative w-16 h-16 flex items-center justify-center rounded-full bg-blue-500/10 border border-blue-500/20">
        <IconSearch className="h-8 w-8 text-blue-500" />
        <span className="absolute inset-0 rounded-full border-2 border-blue-500/30 animate-pulse" />
      </div>
      <p className="text-sm font-medium text-liv-card-foreground">Searching the web</p>
      {query && (
        <p className="text-xs italic text-liv-muted-foreground">&ldquo;{query}&rdquo;</p>
      )}
      <IconLoader2 className="h-4 w-4 text-liv-muted-foreground animate-spin" />
    </div>
  )
}

function EmptyState({query}: {query?: string}) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-liv-muted-foreground">
      <IconSearch className="h-10 w-10 opacity-30" />
      <p className="text-sm font-medium text-liv-card-foreground">No results found</p>
      {query && (
        <code className="text-xs font-mono bg-liv-muted px-2 py-1 rounded">{query}</code>
      )}
      <p className="text-xs text-center max-w-xs">
        Try refining your search query for better results
      </p>
    </div>
  )
}
