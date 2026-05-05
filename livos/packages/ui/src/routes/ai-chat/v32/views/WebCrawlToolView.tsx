// Web crawl view: shows URL crawled + content/hierarchy of pages found.

import React, {useMemo, useState} from 'react'
import {
  IconWorldWww,
  IconLoader2,
  IconCopy,
  IconCheck,
  IconExternalLink,
} from '@tabler/icons-react'
import {type ToolCallSnapshot} from '../types'
import {ToolViewWrapper} from './ToolViewWrapper'

interface WebCrawlToolViewProps {
  tool: ToolCallSnapshot
}

interface ParsedCrawlResult {
  url?: string
  text?: string
  pages?: string[]
  wordCount?: number
}

function parseCrawlResult(
  input: Record<string, unknown>,
  output: string | undefined,
): ParsedCrawlResult {
  const url =
    (input.url as string | undefined) ??
    (input.start_url as string | undefined) ??
    (input.target_url as string | undefined)

  if (!output) return {url}

  try {
    const parsed = JSON.parse(output)
    const text =
      (parsed.text ?? parsed.content ?? parsed.markdown ?? parsed.extracted_text) as
        | string
        | undefined
    const pages = Array.isArray(parsed.pages)
      ? (parsed.pages as string[])
      : Array.isArray(parsed.urls)
      ? (parsed.urls as string[])
      : undefined
    return {
      url: url ?? (parsed.url as string | undefined),
      text,
      pages,
      wordCount: text ? text.trim().split(/\s+/).length : undefined,
    }
  } catch {
    // Raw text output
    return {url, text: output, wordCount: output.trim().split(/\s+/).length}
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

function formatDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return url
  }
}

export function WebCrawlToolView({tool}: WebCrawlToolViewProps) {
  const parsed = useMemo(
    () => parseCrawlResult(tool.input, tool.output),
    [tool.input, tool.output],
  )

  const [copied, setCopied] = useState(false)

  const copyContent = async () => {
    if (!parsed.text) return
    await navigator.clipboard.writeText(parsed.text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const favicon = parsed.url ? getFavicon(parsed.url) : ''
  const domain = parsed.url ? formatDomain(parsed.url) : ''

  return (
    <ToolViewWrapper
      tool={tool}
      icon={<IconWorldWww className="h-5 w-5 text-cyan-500" />}
      title="Crawl Webpage"
    >
      {tool.status === 'running' ? (
        <RunningState url={parsed.url} domain={domain} />
      ) : parsed.url ? (
        <div className="p-4 space-y-4">
          {/* URL card */}
          <div className="flex items-center gap-3 rounded-xl border border-liv-border bg-liv-muted/50 px-4 py-3 group">
            {favicon && (
              <img
                src={favicon}
                alt=""
                className="h-5 w-5 rounded shrink-0"
                onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono text-liv-card-foreground truncate">{parsed.url}</p>
              <p className="text-xs text-liv-muted-foreground mt-0.5">{domain}</p>
            </div>
            <a
              href={parsed.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open URL"
              className="shrink-0 text-liv-muted-foreground hover:text-liv-card-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <IconExternalLink className="h-4 w-4" />
            </a>
          </div>

          {/* Pages hierarchy */}
          {parsed.pages && parsed.pages.length > 0 && (
            <div>
              <p className="text-xs font-medium text-liv-muted-foreground mb-2">
                Pages found ({parsed.pages.length})
              </p>
              <div className="rounded-lg border border-liv-border overflow-hidden max-h-32 overflow-y-auto">
                {parsed.pages.map((page, i) => (
                  <a
                    key={i}
                    href={page}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 text-xs text-blue-500 hover:bg-liv-muted border-b border-liv-border/50 last:border-0 truncate"
                  >
                    <IconExternalLink className="h-3 w-3 shrink-0" />
                    {page}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Extracted content */}
          {parsed.text && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-liv-muted-foreground">Extracted content</p>
                  {parsed.wordCount && (
                    <span className="text-xs text-liv-muted-foreground/60">
                      ({parsed.wordCount} words)
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={copyContent}
                  className="flex items-center gap-1 text-xs text-liv-muted-foreground hover:text-liv-card-foreground transition-colors"
                  aria-label="Copy content"
                >
                  {copied ? (
                    <IconCheck className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <IconCopy className="h-3.5 w-3.5" />
                  )}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="rounded-lg border border-liv-border overflow-hidden">
                <pre className="text-xs font-mono text-liv-muted-foreground p-4 whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                  {parsed.text}
                </pre>
              </div>
            </div>
          )}
        </div>
      ) : (
        <EmptyState />
      )}
    </ToolViewWrapper>
  )
}

function RunningState({url, domain}: {url?: string; domain: string}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="relative w-16 h-16 flex items-center justify-center rounded-full bg-cyan-500/10 border border-cyan-500/20">
        <IconWorldWww className="h-8 w-8 text-cyan-500" />
        <span className="absolute inset-0 rounded-full border-2 border-cyan-500/30 animate-pulse" />
      </div>
      <p className="text-sm font-medium text-liv-card-foreground">Crawling webpage</p>
      {domain && (
        <p className="text-xs font-mono text-liv-muted-foreground">{domain}</p>
      )}
      <IconLoader2 className="h-4 w-4 text-liv-muted-foreground animate-spin" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-liv-muted-foreground">
      <IconWorldWww className="h-8 w-8 opacity-30" />
      <p className="text-sm">No URL detected</p>
    </div>
  )
}
