// Pure function — stable hash-based color palette per MCP server name.
// Returns Tailwind class strings for gradient, border, and text.

export interface McpServerColor {
  gradient: string
  border: string
  text: string
}

// Fixed palette of 8 color families (Tailwind classes).
// Index is selected by a stable djb2-style hash of the server name.
const PALETTE: McpServerColor[] = [
  { gradient: 'from-blue-500/20 to-blue-600/10',   border: 'border-blue-500/20',   text: 'text-blue-500'   },
  { gradient: 'from-emerald-500/20 to-emerald-600/10', border: 'border-emerald-500/20', text: 'text-emerald-500' },
  { gradient: 'from-purple-500/20 to-purple-600/10', border: 'border-purple-500/20', text: 'text-purple-500' },
  { gradient: 'from-orange-500/20 to-orange-600/10', border: 'border-orange-500/20', text: 'text-orange-500' },
  { gradient: 'from-rose-500/20 to-rose-600/10',   border: 'border-rose-500/20',   text: 'text-rose-500'   },
  { gradient: 'from-cyan-500/20 to-cyan-600/10',   border: 'border-cyan-500/20',   text: 'text-cyan-500'   },
  { gradient: 'from-amber-500/20 to-amber-600/10', border: 'border-amber-500/20', text: 'text-amber-500' },
  { gradient: 'from-indigo-500/20 to-indigo-600/10', border: 'border-indigo-500/20', text: 'text-indigo-500' },
]

// Named overrides for well-known servers — stable across hash changes.
const NAMED_OVERRIDES: Record<string, McpServerColor> = {
  bytebot:    { gradient: 'from-blue-500/20 to-blue-600/10',   border: 'border-blue-500/20',   text: 'text-blue-500'   },
  exa:        { gradient: 'from-blue-500/20 to-blue-600/10',   border: 'border-blue-500/20',   text: 'text-blue-500'   },
  github:     { gradient: 'from-purple-500/20 to-purple-600/10', border: 'border-purple-500/20', text: 'text-purple-500' },
  smithery:   { gradient: 'from-emerald-500/20 to-emerald-600/10', border: 'border-emerald-500/20', text: 'text-emerald-500' },
  notion:     { gradient: 'from-zinc-500/20 to-zinc-600/10',   border: 'border-zinc-500/20',   text: 'text-zinc-500'   },
  slack:      { gradient: 'from-emerald-500/20 to-emerald-600/10', border: 'border-emerald-500/20', text: 'text-emerald-500' },
  filesystem: { gradient: 'from-orange-500/20 to-orange-600/10', border: 'border-orange-500/20', text: 'text-orange-500' },
}

function djb2Hash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i)
    h = h >>> 0 // keep 32-bit unsigned
  }
  return h
}

export function getMCPServerColor(serverName: string): McpServerColor {
  const key = serverName.toLowerCase().trim()
  if (key in NAMED_OVERRIDES) return NAMED_OVERRIDES[key]
  const idx = djb2Hash(key) % PALETTE.length
  return PALETTE[idx]
}
