// MCP tool view.
// Shows server identity (color-coded) + tool name + MCPContentRenderer on result.

import React, {useMemo} from 'react'
import {IconPlug, IconServer, IconLoader2, IconChevronDown, IconChevronUp} from '@tabler/icons-react'
import {type ToolCallSnapshot} from '../types'
import {ToolViewWrapper} from './ToolViewWrapper'
import {MCPContentRenderer} from './MCPContentRenderer'
import {getMCPServerColor} from './get-mcp-server-color'

interface McpToolViewProps {
  tool: ToolCallSnapshot
}

interface ParsedMCPIdentity {
  serverName: string
  toolName: string
  displayName: string
}

function parseMCPIdentity(toolName: string): ParsedMCPIdentity {
  // LivOS MCP tool naming convention: mcp_<server>_<tool>
  // e.g. mcp_bytebot_screenshot → server=bytebot, tool=screenshot
  const parts = toolName.split('_')
  if (parts[0] === 'mcp' && parts.length >= 3) {
    const serverName = parts[1]
    const tool = parts.slice(2).join('_')
    return {
      serverName,
      toolName: tool,
      displayName: `${capitalize(serverName)}: ${humanize(tool)}`,
    }
  }
  // Fallback — just show the name
  return {
    serverName: 'mcp',
    toolName,
    displayName: humanize(toolName),
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function humanize(s: string): string {
  return s
    .split(/[_\-]/)
    .map(capitalize)
    .join(' ')
}

function parseResultContent(output: string | undefined): unknown {
  if (!output) return null
  try {
    const parsed = JSON.parse(output)
    // Unwrap common MCP result wrappers
    return parsed.content ?? parsed.data ?? parsed.result ?? parsed
  } catch {
    return output
  }
}

export function McpToolView({tool}: McpToolViewProps) {
  const identity = useMemo(() => parseMCPIdentity(tool.name), [tool.name])
  const resultContent = useMemo(() => parseResultContent(tool.output), [tool.output])
  const serverColor = getMCPServerColor(identity.serverName)

  const [resultOpen, setResultOpen] = React.useState(true)

  return (
    <ToolViewWrapper
      tool={tool}
      icon={
        <div
          className={`relative p-1.5 rounded-lg bg-gradient-to-br border ${serverColor.gradient} ${serverColor.border}`}
        >
          <IconServer className={`h-4 w-4 ${serverColor.text}`} />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-liv-card border border-liv-border">
            <IconPlug className="h-2 w-2 text-liv-muted-foreground" />
          </span>
        </div>
      }
      title={identity.displayName}
    >
      {tool.status === 'running' ? (
        <RunningState identity={identity} serverColor={serverColor} />
      ) : (
        <div className="p-4 space-y-3">
          {/* Server detail strip */}
          <div className="rounded-lg border border-liv-border bg-liv-muted/50 p-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-liv-muted-foreground">Server</span>
              <span className={`ml-2 font-medium ${serverColor.text}`}>
                {capitalize(identity.serverName)}
              </span>
            </div>
            <div>
              <span className="text-liv-muted-foreground">Tool</span>
              <span className="ml-2 font-medium text-liv-card-foreground">{identity.toolName}</span>
            </div>
          </div>

          {/* Result section */}
          {resultContent != null && (
            <div className="rounded-lg border border-liv-border overflow-hidden">
              <button
                type="button"
                onClick={() => setResultOpen((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2 bg-liv-muted hover:bg-liv-muted/80 text-xs font-medium text-liv-muted-foreground transition-colors"
                aria-expanded={resultOpen}
              >
                <span>Result</span>
                {resultOpen ? (
                  <IconChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <IconChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              {resultOpen && (
                <div className="border-t border-liv-border">
                  <MCPContentRenderer content={resultContent} />
                </div>
              )}
            </div>
          )}

          {resultContent == null && (
            <div className="text-xs text-liv-muted-foreground text-center py-4">
              No result data
            </div>
          )}

          {/* MCP info footer */}
          <div className={`rounded-md border p-3 bg-gradient-to-br ${serverColor.gradient} ${serverColor.border}`}>
            <div className="flex items-center gap-2">
              <IconPlug className={`h-3.5 w-3.5 shrink-0 ${serverColor.text}`} />
              <p className={`text-xs ${serverColor.text}`}>
                Model Context Protocol — {capitalize(identity.serverName)} server
              </p>
            </div>
          </div>
        </div>
      )}
    </ToolViewWrapper>
  )
}

function RunningState({
  identity,
  serverColor,
}: {
  identity: ParsedMCPIdentity
  serverColor: ReturnType<typeof getMCPServerColor>
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div
        className={`relative w-16 h-16 flex items-center justify-center rounded-full bg-gradient-to-br border ${serverColor.gradient} ${serverColor.border}`}
      >
        <IconServer className={`h-8 w-8 ${serverColor.text}`} />
        <span className="absolute inset-0 rounded-full border-2 border-current opacity-30 animate-pulse" />
        <span className="absolute -bottom-1 -right-1">
          <IconLoader2 className={`h-5 w-5 animate-spin ${serverColor.text}`} />
        </span>
      </div>
      <p className="text-sm font-medium text-liv-card-foreground">{identity.displayName}</p>
      <p className="text-xs text-liv-muted-foreground">via {capitalize(identity.serverName)} server</p>
    </div>
  )
}
