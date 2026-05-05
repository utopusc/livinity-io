// String replace / diff view.
// Shows old_str and new_str as stacked diff blocks with red (removed) / green (added) lines.

import React, {useMemo} from 'react'
import {IconReplace, IconLoader2} from '@tabler/icons-react'
import {type ToolCallSnapshot} from '../types'
import {ToolViewWrapper} from './ToolViewWrapper'

interface StrReplaceToolViewProps {
  tool: ToolCallSnapshot
}

interface ParsedStrReplaceArgs {
  filePath?: string
  oldStr?: string
  newStr?: string
}

function parseStrReplaceArgs(input: Record<string, unknown>): ParsedStrReplaceArgs {
  return {
    filePath:
      (input.path as string | undefined) ??
      (input.file_path as string | undefined) ??
      (input.filename as string | undefined),
    oldStr:
      (input.old_str as string | undefined) ??
      (input.old_string as string | undefined) ??
      (input.old as string | undefined),
    newStr:
      (input.new_str as string | undefined) ??
      (input.new_string as string | undefined) ??
      (input.new as string | undefined),
  }
}

function DiffBlock({
  label,
  content,
  variant,
}: {
  label: string
  content: string
  variant: 'removed' | 'added'
}) {
  const lines = content.split('\n')
  const prefix = variant === 'removed' ? '-' : '+'
  const colorClass =
    variant === 'removed'
      ? 'text-red-600/90 dark:text-red-400/90 bg-red-500/5'
      : 'text-emerald-600/90 dark:text-emerald-400/90 bg-emerald-500/5'
  const headerClass =
    variant === 'removed'
      ? 'bg-red-500/5 border-red-500/20 text-red-600 dark:text-red-400'
      : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'

  return (
    <div className={`rounded-lg border overflow-hidden ${variant === 'removed' ? 'border-red-500/20' : 'border-emerald-500/20'}`}>
      <div className={`px-3 py-1.5 border-b text-xs font-medium ${headerClass}`}>{label}</div>
      <div className={`p-3 max-h-48 overflow-y-auto font-mono text-xs ${colorClass}`}>
        {lines.map((line, i) => (
          <div key={i} className="leading-5">
            <span className="select-none mr-1 opacity-50">{prefix}</span>
            {line || ' '}
          </div>
        ))}
      </div>
    </div>
  )
}

export function StrReplaceToolView({tool}: StrReplaceToolViewProps) {
  const {filePath, oldStr, newStr} = useMemo(
    () => parseStrReplaceArgs(tool.input),
    [tool.input],
  )

  return (
    <ToolViewWrapper
      tool={tool}
      icon={<IconReplace className="h-5 w-5 text-amber-500" />}
      title="String Replace"
    >
      {tool.status === 'running' ? (
        <RunningState filePath={filePath} />
      ) : (
        <div className="p-4 space-y-3">
          {filePath && (
            <div className="text-xs font-mono text-liv-muted-foreground truncate">
              {filePath}
            </div>
          )}

          {oldStr != null && (
            <DiffBlock label="Removed" content={oldStr} variant="removed" />
          )}

          {newStr != null && (
            <DiffBlock label="Added" content={newStr} variant="added" />
          )}

          {!oldStr && !newStr && (
            <EmptyState />
          )}
        </div>
      )}
    </ToolViewWrapper>
  )
}

function RunningState({filePath}: {filePath?: string}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="relative w-16 h-16 flex items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20">
        <IconReplace className="h-8 w-8 text-amber-500" />
        <span className="absolute inset-0 rounded-full border-2 border-amber-500/30 animate-pulse" />
      </div>
      <p className="text-sm font-medium text-liv-card-foreground">Applying replacement</p>
      {filePath && (
        <code className="text-xs font-mono text-liv-muted-foreground truncate max-w-xs">{filePath}</code>
      )}
      <IconLoader2 className="h-4 w-4 text-liv-muted-foreground animate-spin" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-liv-muted-foreground">
      <IconReplace className="h-8 w-8 opacity-30" />
      <p className="text-sm">No replacement data available</p>
    </div>
  )
}
