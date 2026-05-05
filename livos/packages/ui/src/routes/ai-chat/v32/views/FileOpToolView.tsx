// File operation view: read_file, write_file, edit_file, create_file, delete_file.
// Shows file path header, content preview (first 50 lines),
// and for edits shows a simple +/- diff format.

import React, {useMemo} from 'react'
import {
  IconFile,
  IconFilePlus,
  IconFileX,
  IconEdit,
  IconLoader2,
} from '@tabler/icons-react'
import {type ToolCallSnapshot} from '../types'
import {ToolViewWrapper} from './ToolViewWrapper'

interface FileOpToolViewProps {
  tool: ToolCallSnapshot
}

type OpKind = 'read' | 'write' | 'create' | 'edit' | 'delete' | 'unknown'

function detectOpKind(name: string): OpKind {
  const n = name.toLowerCase()
  if (n.includes('read')) return 'read'
  if (n.includes('write')) return 'write'
  if (n.includes('create')) return 'create'
  if (n.includes('edit') || n.includes('update')) return 'edit'
  if (n.includes('delete') || n.includes('remove')) return 'delete'
  return 'unknown'
}

const OP_ICONS: Record<OpKind, React.ElementType> = {
  read: IconFile,
  write: IconFilePlus,
  create: IconFilePlus,
  edit: IconEdit,
  delete: IconFileX,
  unknown: IconFile,
}

const OP_LABELS: Record<OpKind, string> = {
  read: 'Read File',
  write: 'Write File',
  create: 'Create File',
  edit: 'Edit File',
  delete: 'Delete File',
  unknown: 'File Operation',
}

interface ParsedFileResult {
  filePath?: string
  content?: string
  oldContent?: string
  newContent?: string
}

function parseFileResult(
  input: Record<string, unknown>,
  output: string | undefined,
): ParsedFileResult {
  const filePath =
    (input.path as string | undefined) ??
    (input.file_path as string | undefined) ??
    (input.filename as string | undefined)

  if (!output) {
    return {filePath}
  }

  try {
    const parsed = JSON.parse(output)
    return {
      filePath: filePath ?? (parsed.path as string | undefined),
      content: (parsed.content ?? parsed.file_content ?? parsed.text) as string | undefined,
      oldContent: parsed.old_content as string | undefined,
      newContent: parsed.new_content as string | undefined,
    }
  } catch {
    // raw string output = file content
    return {filePath, content: output}
  }
}

function DiffView({oldContent, newContent}: {oldContent: string; newContent: string}) {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')

  return (
    <div className="font-mono text-xs rounded-lg border border-liv-border overflow-hidden">
      <div className="flex">
        {/* Old */}
        <div className="flex-1 border-r border-liv-border">
          <div className="px-3 py-1.5 bg-red-500/5 border-b border-red-500/20 text-xs font-medium text-red-600 dark:text-red-400">
            Before
          </div>
          <div className="p-3 max-h-48 overflow-y-auto">
            {oldLines.slice(0, 50).map((line, i) => (
              <div key={i} className="text-red-600/80 dark:text-red-400/80 leading-5">
                <span className="select-none mr-1 text-liv-muted-foreground/40">{i + 1}</span>
                {line || ' '}
              </div>
            ))}
          </div>
        </div>
        {/* New */}
        <div className="flex-1">
          <div className="px-3 py-1.5 bg-emerald-500/5 border-b border-emerald-500/20 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            After
          </div>
          <div className="p-3 max-h-48 overflow-y-auto">
            {newLines.slice(0, 50).map((line, i) => (
              <div key={i} className="text-emerald-600/80 dark:text-emerald-400/80 leading-5">
                <span className="select-none mr-1 text-liv-muted-foreground/40">{i + 1}</span>
                {line || ' '}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function FileOpToolView({tool}: FileOpToolViewProps) {
  const op = useMemo(() => detectOpKind(tool.name), [tool.name])
  const parsed = useMemo(
    () => parseFileResult(tool.input, tool.output),
    [tool.input, tool.output],
  )

  const OpIcon = OP_ICONS[op]
  const opLabel = OP_LABELS[op]

  const previewLines = useMemo(() => {
    const src =
      parsed.content ??
      parsed.newContent ??
      (tool.input.content as string | undefined) ??
      ''
    return src.split('\n').slice(0, 50)
  }, [parsed, tool.input])

  return (
    <ToolViewWrapper
      tool={tool}
      icon={<OpIcon className="h-5 w-5 text-emerald-500" />}
      title={opLabel}
    >
      {tool.status === 'running' ? (
        <RunningState op={opLabel} filePath={parsed.filePath} />
      ) : (
        <div className="p-4 space-y-3">
          {/* File path */}
          {parsed.filePath && (
            <div className="flex items-center gap-2 text-xs text-liv-muted-foreground font-mono">
              <OpIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{parsed.filePath}</span>
            </div>
          )}

          {/* Delete notice */}
          {op === 'delete' && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-center">
              <IconFileX className="h-8 w-8 text-red-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-red-600 dark:text-red-400">File deleted</p>
              {parsed.filePath && (
                <code className="text-xs font-mono text-red-600/80 dark:text-red-400/80 mt-1 block">
                  {parsed.filePath}
                </code>
              )}
            </div>
          )}

          {/* Diff for edit ops */}
          {op === 'edit' && parsed.oldContent && parsed.newContent && (
            <DiffView oldContent={parsed.oldContent} newContent={parsed.newContent} />
          )}

          {/* Content preview for read/write/create */}
          {op !== 'delete' && previewLines.length > 0 && !(op === 'edit' && parsed.oldContent) && (
            <div className="rounded-lg border border-liv-border overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-liv-muted border-b border-liv-border">
                <IconFile className="h-3.5 w-3.5 text-liv-muted-foreground" />
                <span className="text-xs font-medium text-liv-muted-foreground">
                  Content preview
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <div className="font-mono text-xs">
                  {previewLines.map((line, i) => (
                    <div
                      key={i}
                      className="flex hover:bg-liv-muted/30 transition-colors"
                    >
                      <span className="select-none w-10 shrink-0 text-right pr-3 py-0.5 text-liv-muted-foreground/40 border-r border-liv-border">
                        {i + 1}
                      </span>
                      <span className="pl-3 py-0.5 text-liv-muted-foreground whitespace-pre">
                        {line || ' '}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {op !== 'delete' && previewLines.length === 0 && !parsed.oldContent && (
            <EmptyState op={opLabel} />
          )}
        </div>
      )}
    </ToolViewWrapper>
  )
}

function RunningState({op, filePath}: {op: string; filePath?: string}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="relative w-16 h-16 flex items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
        <IconFile className="h-8 w-8 text-emerald-500" />
        <span className="absolute inset-0 rounded-full border-2 border-emerald-500/30 animate-pulse" />
      </div>
      <p className="text-sm font-medium text-liv-card-foreground">{op}</p>
      {filePath && (
        <code className="text-xs font-mono text-liv-muted-foreground truncate max-w-xs">{filePath}</code>
      )}
      <IconLoader2 className="h-4 w-4 text-liv-muted-foreground animate-spin" />
    </div>
  )
}

function EmptyState({op}: {op: string}) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-liv-muted-foreground">
      <IconFile className="h-8 w-8 opacity-30" />
      <p className="text-sm">{op} — no content to preview</p>
    </div>
  )
}
