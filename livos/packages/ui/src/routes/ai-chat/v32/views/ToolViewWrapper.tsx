// Shared chrome wrapper for all per-tool views.
// Renders: header (tool name + status badge + duration),
//          collapsible args section,
//          content slot (children),
//          error card if status === 'error'.

import React, {useState} from 'react'
import {
  IconLoader2,
  IconCircleCheck,
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
  IconClock,
} from '@tabler/icons-react'
import {type ToolCallSnapshot} from '../types'

interface ToolViewWrapperProps {
  tool: ToolCallSnapshot
  /** Icon element to show in the header left slot */
  icon?: React.ReactNode
  /** Human-readable title override. Defaults to tool.name */
  title?: string
  children: React.ReactNode
  /** Replaces the default error card when status === 'error' */
  errorSlot?: React.ReactNode
  className?: string
}

function formatDuration(startedAt: number, endedAt?: number): string | null {
  const end = endedAt ?? (Date.now() > startedAt ? Date.now() : undefined)
  if (!end) return null
  const ms = end - startedAt
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function StatusBadge({status}: {status: ToolCallSnapshot['status']}) {
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
        <IconLoader2 className="h-3 w-3 animate-spin" />
        Running
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
        <IconAlertTriangle className="h-3 w-3" />
        Error
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
      <IconCircleCheck className="h-3 w-3" />
      Done
    </span>
  )
}

export function ToolViewWrapper({
  tool,
  icon,
  title,
  children,
  errorSlot,
  className = '',
}: ToolViewWrapperProps) {
  const [argsOpen, setArgsOpen] = useState(false)
  const hasArgs = Object.keys(tool.input).length > 0
  const duration = formatDuration(tool.startedAt, tool.endedAt)
  const displayTitle = title ?? tool.name

  return (
    <div
      className={`flex flex-col h-full border border-liv-border rounded-xl overflow-hidden bg-liv-card ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-liv-muted border-b border-liv-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="shrink-0">{icon}</span>}
          <span
            className="font-mono text-sm font-medium text-liv-card-foreground truncate"
            title={displayTitle}
          >
            {displayTitle}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {duration && (
            <span className="inline-flex items-center gap-1 text-xs text-liv-muted-foreground">
              <IconClock className="h-3 w-3" />
              {duration}
            </span>
          )}
          <StatusBadge status={tool.status} />
        </div>
      </div>

      {/* Collapsible args */}
      {hasArgs && (
        <div className="border-b border-liv-border shrink-0">
          <button
            type="button"
            onClick={() => setArgsOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2 text-xs text-liv-muted-foreground hover:bg-liv-muted/50 transition-colors"
            aria-expanded={argsOpen}
          >
            <span>Input ({Object.keys(tool.input).length} args)</span>
            {argsOpen ? (
              <IconChevronUp className="h-3.5 w-3.5" />
            ) : (
              <IconChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          {argsOpen && (
            <div className="px-4 pb-3">
              <pre className="text-xs font-mono text-liv-muted-foreground bg-liv-muted rounded-lg p-3 overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto min-h-0">
        {tool.status === 'error' && !errorSlot ? (
          <DefaultErrorCard output={tool.output} />
        ) : tool.status === 'error' && errorSlot ? (
          errorSlot
        ) : (
          children
        )}
      </div>
    </div>
  )
}

function DefaultErrorCard({output}: {output?: string}) {
  return (
    <div className="p-4">
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <IconAlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <span className="text-sm font-medium text-red-600 dark:text-red-400">
            Tool execution failed
          </span>
        </div>
        {output && (
          <pre className="text-xs font-mono text-red-600/80 dark:text-red-400/80 whitespace-pre-wrap break-all">
            {output}
          </pre>
        )}
      </div>
    </div>
  )
}
