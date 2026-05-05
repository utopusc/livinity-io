// Auto-detects MCP content format and dispatches to the appropriate renderer.
// Accepts rawContent directly; runs detectMCPFormat internally.

import React from 'react'
import ReactMarkdown from 'react-markdown'
import {
  IconSearch,
  IconTable,
  IconCode,
  IconFileText,
  IconAlertTriangle,
  IconLink,
  IconExternalLink,
} from '@tabler/icons-react'

import {detectMCPFormat, type MCPFormat, type FormatDetectionResult} from './mcp-format-detector'

interface MCPContentRendererProps {
  content: unknown
}

// -- Search results renderer --------------------------------------------------

interface SearchResult {
  title?: string
  url?: string
  link?: string
  snippet?: string
  description?: string
  summary?: string
}

function normalizeResults(data: unknown): SearchResult[] {
  if (data === null || data === undefined) return []
  const o = data as Record<string, unknown>
  let items: unknown[] = []
  if (Array.isArray(o.results)) items = o.results
  else if (Array.isArray(o.data)) items = o.data
  else if (Array.isArray(data)) items = data as unknown[]
  return items.filter((i) => i !== null && typeof i === 'object') as SearchResult[]
}

function SearchRenderer({data}: {data: unknown}) {
  const results = normalizeResults(data)
  if (results.length === 0) {
    return <PlainRenderer content="No search results found." />
  }
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <IconSearch className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-medium text-liv-card-foreground">
          {results.length} result{results.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {results.map((r, idx) => {
          const url = r.url ?? r.link ?? ''
          const snippet = r.snippet ?? r.description ?? r.summary ?? ''
          return (
            <div
              key={idx}
              className="rounded-lg border border-liv-border bg-liv-background p-3 hover:border-liv-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-liv-card-foreground leading-snug line-clamp-1">
                    {r.title ?? `Result ${idx + 1}`}
                  </p>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline truncate block mt-0.5"
                    >
                      {url}
                    </a>
                  )}
                </div>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open link"
                    className="shrink-0 text-liv-muted-foreground hover:text-liv-card-foreground"
                  >
                    <IconExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              {snippet && (
                <p className="text-xs text-liv-muted-foreground mt-1.5 line-clamp-2">{snippet}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// -- Table renderer -----------------------------------------------------------

function TableRenderer({data}: {data: unknown}) {
  if (!Array.isArray(data) || data.length === 0) {
    return <JsonRenderer data={data} />
  }
  const headers = Object.keys(data[0] as object)
  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-3">
        <IconTable className="h-4 w-4 text-purple-500" />
        <span className="text-sm font-medium text-liv-card-foreground">
          Table ({data.length} rows)
        </span>
      </div>
      <div className="overflow-auto max-h-80 rounded-lg border border-liv-border">
        <table className="w-full text-xs">
          <thead className="bg-liv-muted border-b border-liv-border sticky top-0">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium text-liv-muted-foreground whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data as Record<string, unknown>[]).map((row, ri) => (
              <tr key={ri} className="border-b border-liv-border/50 hover:bg-liv-muted/30">
                {headers.map((h) => (
                  <td key={h} className="px-3 py-2 text-liv-muted-foreground">
                    {String(row[h] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// -- JSON renderer ------------------------------------------------------------

function JsonRenderer({data}: {data: unknown}) {
  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-3">
        <IconCode className="h-4 w-4 text-purple-500" />
        <span className="text-sm font-medium text-liv-card-foreground">Structured Data</span>
      </div>
      <pre className="text-xs font-mono text-liv-muted-foreground bg-liv-muted rounded-lg p-3 overflow-x-auto max-h-80 whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

// -- Markdown renderer --------------------------------------------------------

function MarkdownContentRenderer({content}: {content: string}) {
  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-3">
        <IconFileText className="h-4 w-4 text-zinc-500" />
        <span className="text-sm font-medium text-liv-card-foreground">Markdown</span>
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none overflow-auto max-h-80 text-liv-card-foreground">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  )
}

// -- Error renderer -----------------------------------------------------------

function ErrorRenderer({content}: {content: string}) {
  return (
    <div className="p-3">
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
        <div className="flex items-center gap-2 mb-2">
          <IconAlertTriangle className="h-4 w-4 text-red-500" />
          <span className="text-sm font-medium text-red-600 dark:text-red-400">Error</span>
        </div>
        <pre className="text-xs font-mono text-red-600/80 dark:text-red-400/80 whitespace-pre-wrap break-all">
          {content}
        </pre>
      </div>
    </div>
  )
}

// -- Plain renderer -----------------------------------------------------------

function PlainRenderer({content}: {content: string}) {
  return (
    <div className="p-3">
      <pre className="text-sm text-liv-muted-foreground whitespace-pre-wrap break-all overflow-x-auto max-h-80">
        {content}
      </pre>
    </div>
  )
}

// -- URL list renderer (bonus) ------------------------------------------------

function UrlListRenderer({content}: {content: string}) {
  const urls = content.match(/https?:\/\/\S+/g) ?? []
  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-3">
        <IconLink className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-medium text-liv-card-foreground">URLs ({urls.length})</span>
      </div>
      <div className="space-y-1.5 max-h-80 overflow-y-auto">
        {urls.map((url, i) => (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-blue-500 hover:underline truncate"
          >
            <IconExternalLink className="h-3 w-3 shrink-0" />
            {url}
          </a>
        ))}
      </div>
    </div>
  )
}

// -- Main dispatcher ----------------------------------------------------------

export function MCPContentRenderer({content}: MCPContentRendererProps) {
  const detection: FormatDetectionResult = detectMCPFormat(content)
  const contentStr =
    typeof content === 'string' ? content : JSON.stringify(content ?? '', null, 2)

  switch (detection.format as MCPFormat) {
    case 'search':
      return <SearchRenderer data={detection.parsedData ?? content} />
    case 'table':
      return <TableRenderer data={detection.parsedData ?? content} />
    case 'json':
      return <JsonRenderer data={detection.parsedData ?? content} />
    case 'markdown':
      return <MarkdownContentRenderer content={contentStr} />
    case 'error':
      return <ErrorRenderer content={contentStr} />
    default:
      // 'plain' + fallthrough
      if (/https?:\/\/\S+/.test(contentStr)) {
        return <UrlListRenderer content={contentStr} />
      }
      return <PlainRenderer content={contentStr} />
  }
}
