// Browser tool view.
// Renders screenshot (base64 or URL) if present in tool.output,
// otherwise shows URL + DOM excerpt.

import React, {useMemo, useState} from 'react'
import {IconBrowserCheck, IconLoader2, IconAlertTriangle, IconExternalLink} from '@tabler/icons-react'
import {type ToolCallSnapshot} from '../types'
import {ToolViewWrapper} from './ToolViewWrapper'

interface BrowserToolViewProps {
  tool: ToolCallSnapshot
}

interface ParsedBrowserResult {
  url?: string
  screenshotBase64?: string
  screenshotUrl?: string
  domExcerpt?: string
}

function parseBrowserResult(output: string | undefined): ParsedBrowserResult {
  if (!output) return {}
  try {
    const parsed = JSON.parse(output)
    return {
      url: parsed.url ?? parsed.current_url ?? parsed.target_url,
      screenshotBase64:
        parsed.screenshot ?? parsed.screenshot_base64 ?? parsed.image ?? parsed.base64_image,
      screenshotUrl: parsed.image_url ?? parsed.screenshot_url,
      domExcerpt:
        typeof parsed.dom === 'string'
          ? parsed.dom.slice(0, 2000)
          : typeof parsed.content === 'string'
          ? parsed.content.slice(0, 2000)
          : undefined,
    }
  } catch {
    // Try extracting URL from raw string
    const urlMatch = output.match(/https?:\/\/[^\s"']+/)
    return {url: urlMatch?.[0]}
  }
}

export function BrowserToolView({tool}: BrowserToolViewProps) {
  const {url, screenshotBase64, screenshotUrl, domExcerpt} = useMemo(
    () => parseBrowserResult(tool.output),
    [tool.output],
  )

  const [imgError, setImgError] = useState(false)

  const imgSrc = screenshotUrl ?? (screenshotBase64 ? `data:image/png;base64,${screenshotBase64}` : undefined)

  return (
    <ToolViewWrapper
      tool={tool}
      icon={<IconBrowserCheck className="h-5 w-5 text-purple-500" />}
      title={tool.name}
    >
      {tool.status === 'running' ? (
        <RunningState url={url} />
      ) : (
        <div className="p-4 space-y-3">
          {url && (
            <div className="flex items-center gap-2 text-xs text-liv-muted-foreground">
              <span className="font-mono truncate">{url}</span>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 hover:text-liv-card-foreground"
                aria-label="Open URL"
              >
                <IconExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}

          {imgSrc && !imgError ? (
            <div className="rounded-lg border border-liv-border overflow-hidden">
              <img
                src={imgSrc}
                alt="Browser screenshot"
                className="w-full object-contain max-h-[480px]"
                onError={() => setImgError(true)}
                loading="lazy"
              />
            </div>
          ) : imgError ? (
            <ScreenshotError />
          ) : domExcerpt ? (
            <pre className="text-xs font-mono text-liv-muted-foreground bg-liv-muted rounded-lg p-3 overflow-x-auto max-h-64 whitespace-pre-wrap break-all">
              {domExcerpt}
            </pre>
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
      <div className="relative w-16 h-16 flex items-center justify-center rounded-full bg-purple-500/10 border border-purple-500/20">
        <IconBrowserCheck className="h-8 w-8 text-purple-500" />
        <span className="absolute inset-0 rounded-full border-2 border-purple-500/30 animate-pulse" />
      </div>
      <p className="text-sm font-medium text-liv-card-foreground">Executing browser action</p>
      {url && <p className="text-xs text-liv-muted-foreground font-mono truncate max-w-xs">{url}</p>}
      <IconLoader2 className="h-4 w-4 text-liv-muted-foreground animate-spin" />
    </div>
  )
}

function ScreenshotError() {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-liv-muted-foreground">
      <IconAlertTriangle className="h-8 w-8 text-amber-500" />
      <p className="text-sm">Failed to load screenshot</p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-liv-muted-foreground">
      <IconBrowserCheck className="h-8 w-8 opacity-30" />
      <p className="text-sm">No screenshot or DOM content available</p>
    </div>
  )
}
