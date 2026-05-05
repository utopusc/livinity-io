// Generic fallback view — renders tool result as formatted JSON.
// Used when no specific view matches the tool name.

import React from 'react'
import {IconBraces, IconLoader2} from '@tabler/icons-react'
import {type ToolCallSnapshot} from '../types'
import {ToolViewWrapper} from './ToolViewWrapper'

interface GenericToolViewProps {
  tool: ToolCallSnapshot
}

export function GenericToolView({tool}: GenericToolViewProps) {
  return (
    <ToolViewWrapper
      tool={tool}
      icon={<IconBraces className="h-5 w-5 text-liv-muted-foreground" />}
    >
      {tool.status === 'running' ? (
        <RunningState />
      ) : (
        <div className="p-4">
          {tool.output != null ? (
            <pre className="text-sm font-mono text-liv-muted-foreground bg-liv-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
              {formatOutput(tool.output)}
            </pre>
          ) : (
            <p className="text-sm text-liv-muted-foreground text-center py-8">No output.</p>
          )}
        </div>
      )}
    </ToolViewWrapper>
  )
}

function RunningState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <IconLoader2 className="h-8 w-8 text-liv-primary animate-spin" />
      <p className="text-sm text-liv-muted-foreground">Processing...</p>
    </div>
  )
}

function formatOutput(output: string): string {
  try {
    return JSON.stringify(JSON.parse(output), null, 2)
  } catch {
    return output
  }
}
