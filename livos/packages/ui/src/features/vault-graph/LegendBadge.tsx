// Phase 180-03 — LegendBadge bottom-left overlay.
//
// Shows current group mode's color → label mapping.
// Row click → toggle that group's visibility (hiddenGroups state in VaultGraph).
// Title click → cycle group mode: by-type → by-folder → by-tag → custom → by-type.
//
// Threat mitigations:
//  - T-180-03-A: row labels rendered as React text children — no dangerouslySetInnerHTML.
//  - T-180-03-C: buildLegendRows deduplicated via Map; O(N) pass ≤2000 nodes, < 1ms.

import {getNodeColor, type GraphNodeType, type GraphTheme} from './graph-palette'
import {hashToOklch, type GroupMode} from './sections/GroupsSection'
import type {GraphStats} from './graph-stats'

export interface LegendRow {
  key: string    // e.g. 'memory', 'agents/', 'project'
  label: string  // display text
  color: string  // OKLCH or CSS color string
}

const ALL_NODE_TYPES: GraphNodeType[] = [
  'memory', 'session', 'inbox', 'agent', 'skill', 'command', 'root',
]

const TYPE_LABELS: Record<GraphNodeType, string> = {
  memory: 'Memory',
  session: 'Session',
  inbox: 'Inbox',
  agent: 'Agent',
  skill: 'Skill',
  command: 'Command',
  root: 'Root',
}

/**
 * Derives legend rows from current group mode.
 * by-type: always 7 rows (fixed palette).
 * by-folder: derived from visible nodes, deduplicated by topDir.
 * by-tag: derived from visible nodes, deduplicated by first tag.
 * custom: deferred → returns empty (stub matches Phase 179 custom stub).
 *
 * Threat T-180-03-D: row keys are vault-relative paths already visible in graph labels.
 */
export function buildLegendRows(
  mode: GroupMode,
  theme: GraphTheme,
  nodes: Array<{ id: string; type: GraphNodeType; topDir: string; tags: string[] }>,
): LegendRow[] {
  switch (mode) {
    case 'by-type':
      return ALL_NODE_TYPES.map((t) => ({
        key: t,
        label: TYPE_LABELS[t],
        color: getNodeColor(t, theme),
      }))
    case 'by-folder': {
      const seen = new Map<string, string>()
      for (const n of nodes) {
        const k = n.topDir || 'root'
        if (!seen.has(k)) seen.set(k, hashToOklch(k, theme))
      }
      return Array.from(seen.entries()).map(([key, color]) => ({ key, label: key, color }))
    }
    case 'by-tag': {
      const seen = new Map<string, string>()
      for (const n of nodes) {
        const k = n.tags[0] ?? n.topDir ?? 'root'
        if (!seen.has(k)) seen.set(k, hashToOklch(k, theme))
      }
      return Array.from(seen.entries()).map(([key, color]) => ({ key, label: key, color }))
    }
    case 'custom':
      // Deferred to Phase 180+ — custom rows matching not yet implemented
      return []
  }
}

const MODE_LABELS: Record<GroupMode, string> = {
  'by-type': 'By Type',
  'by-folder': 'By Folder',
  'by-tag': 'By Tag',
  custom: 'Custom',
}

interface Props {
  mode: GroupMode
  rows: LegendRow[]
  hiddenGroups: Set<string>
  onToggleGroup: (key: string) => void
  onCycleMode: () => void
  stats?: GraphStats  // Phase 187-05: optional topology stats footer
}

export function LegendBadge({ mode, rows, hiddenGroups, onToggleGroup, onCycleMode, stats }: Props) {
  return (
    <div
      data-testid='legend-badge'
      className='absolute bottom-4 left-4 z-20 w-[220px] rounded border border-[color:var(--line-strong)] bg-[color:var(--bg-2)]/90 backdrop-blur-sm p-2 flex flex-col gap-1'
    >
      <button
        type='button'
        data-testid='legend-title'
        onClick={onCycleMode}
        className='text-left text-xs font-semibold text-[color:var(--fg-mute)] uppercase tracking-wide hover:text-[color:var(--fg)] transition-colors'
      >
        {MODE_LABELS[mode]} &#9662;
      </button>
      {rows.map((row) => (
        <button
          key={row.key}
          type='button'
          data-testid={`legend-row-${row.key}`}
          onClick={() => onToggleGroup(row.key)}
          className={[
            'flex items-center gap-2 rounded px-1 py-0.5 text-sm text-[color:var(--fg)] hover:bg-[color:var(--bg-3)] transition-colors text-left w-full',
            hiddenGroups.has(row.key) ? 'opacity-40' : '',
          ].join(' ').trim()}
        >
          <span
            className='h-2.5 w-2.5 shrink-0 rounded-full'
            style={{ background: row.color }}
          />
          <span className='truncate'>{row.label}</span>
        </button>
      ))}
      {stats && (
        <div
          data-testid='legend-stats-footer'
          className='mt-1 border-t border-[color:var(--line-strong)] pt-1 grid grid-cols-2 gap-x-2 text-[11px] text-[color:var(--fg-mute)]'
        >
          <span>Nodes: {stats.nodeCount}</span>
          <span>Edges: {stats.edgeCount}</span>
          <span>Orphans: {stats.orphanCount}</span>
          <span className='truncate'>
            Hub: {stats.topHubs[0]?.label ?? '—'}
          </span>
        </div>
      )}
    </div>
  )
}
