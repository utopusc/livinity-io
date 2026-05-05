// Terminal / command execution view.
// Shows command + output in monospace with exit code badge.
// Geist Mono Variable (font-mono) per P80 tokens.

import React, {useMemo} from 'react'
import {IconTerminal2, IconLoader2, IconCircleCheck, IconAlertTriangle} from '@tabler/icons-react'
import {type ToolCallSnapshot} from '../types'
import {ToolViewWrapper} from './ToolViewWrapper'

interface CommandToolViewProps {
  tool: ToolCallSnapshot
}

interface ParsedCommandResult {
  command?: string
  output?: string
  exitCode?: number | null
  stderr?: string
}

function parseCommandResult(
  input: Record<string, unknown>,
  output: string | undefined,
): ParsedCommandResult {
  const command =
    (input.command as string | undefined) ??
    (input.cmd as string | undefined) ??
    (input.script as string | undefined)

  if (!output) return {command}

  try {
    const parsed = JSON.parse(output)
    return {
      command: command ?? (parsed.command as string | undefined),
      output: (parsed.output ?? parsed.stdout ?? parsed.result) as string | undefined,
      exitCode:
        parsed.exit_code != null
          ? Number(parsed.exit_code)
          : parsed.returncode != null
          ? Number(parsed.returncode)
          : null,
      stderr: parsed.stderr as string | undefined,
    }
  } catch {
    return {command, output}
  }
}

function unescape(s: string): string {
  return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\"/g, '"')
}

export function CommandToolView({tool}: CommandToolViewProps) {
  const parsed = useMemo(
    () => parseCommandResult(tool.input, tool.output),
    [tool.input, tool.output],
  )

  const lines = useMemo(() => {
    if (!parsed.output) return []
    return unescape(String(parsed.output)).split('\n')
  }, [parsed.output])

  const exitCodeOk = parsed.exitCode == null || parsed.exitCode === 0

  return (
    <ToolViewWrapper
      tool={tool}
      icon={<IconTerminal2 className="h-5 w-5 text-purple-500" />}
      title={tool.name}
    >
      {tool.status === 'running' ? (
        <RunningState command={parsed.command} />
      ) : (
        <div className="p-4 space-y-3">
          {/* Command block */}
          {parsed.command && (
            <div className="rounded-lg border border-liv-border overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-liv-muted border-b border-liv-border">
                <IconTerminal2 className="h-3.5 w-3.5 text-liv-muted-foreground" />
                <span className="text-xs font-medium text-liv-muted-foreground">Command</span>
              </div>
              <div className="flex gap-2 px-3 py-2">
                <span className="text-purple-500 font-mono text-sm select-none">$</span>
                <code className="font-mono text-sm text-liv-card-foreground break-all">
                  {parsed.command}
                </code>
              </div>
            </div>
          )}

          {/* Output block */}
          {lines.length > 0 && (
            <div className="rounded-lg border border-liv-border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-liv-muted border-b border-liv-border">
                <div className="flex items-center gap-2">
                  <IconTerminal2 className="h-3.5 w-3.5 text-liv-muted-foreground" />
                  <span className="text-xs font-medium text-liv-muted-foreground">Output</span>
                </div>
                {parsed.exitCode != null && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      exitCodeOk
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                    }`}
                  >
                    {exitCodeOk ? (
                      <IconCircleCheck className="h-3 w-3" />
                    ) : (
                      <IconAlertTriangle className="h-3 w-3" />
                    )}
                    exit {parsed.exitCode}
                  </span>
                )}
              </div>
              <div className="p-3 max-h-64 overflow-y-auto bg-zinc-950 dark:bg-zinc-950 light:bg-zinc-900">
                <pre className="font-mono text-xs text-zinc-200 whitespace-pre-wrap break-all">
                  {lines.map((line, i) => (
                    <div key={i} className="py-0.5">
                      {line || ' '}
                    </div>
                  ))}
                </pre>
              </div>
            </div>
          )}

          {/* Stderr (if separate and non-empty) */}
          {parsed.stderr && parsed.stderr.trim() && (
            <div className="rounded-lg border border-red-500/20 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-red-500/5 border-b border-red-500/20">
                <IconAlertTriangle className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs font-medium text-red-600 dark:text-red-400">Stderr</span>
              </div>
              <pre className="font-mono text-xs text-red-600/80 dark:text-red-400/80 p-3 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                {unescape(parsed.stderr)}
              </pre>
            </div>
          )}

          {!parsed.command && lines.length === 0 && !parsed.stderr && (
            <EmptyState />
          )}
        </div>
      )}
    </ToolViewWrapper>
  )
}

function RunningState({command}: {command?: string}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="relative w-16 h-16 flex items-center justify-center rounded-full bg-purple-500/10 border border-purple-500/20">
        <IconTerminal2 className="h-8 w-8 text-purple-500" />
        <span className="absolute inset-0 rounded-full border-2 border-purple-500/30 animate-pulse" />
      </div>
      <p className="text-sm font-medium text-liv-card-foreground">Executing command</p>
      {command && (
        <code className="text-xs font-mono text-liv-muted-foreground bg-liv-muted px-2 py-1 rounded max-w-xs truncate">
          $ {command}
        </code>
      )}
      <IconLoader2 className="h-4 w-4 text-liv-muted-foreground animate-spin" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-liv-muted-foreground">
      <IconTerminal2 className="h-8 w-8 opacity-30" />
      <p className="text-sm">No command output</p>
    </div>
  )
}
