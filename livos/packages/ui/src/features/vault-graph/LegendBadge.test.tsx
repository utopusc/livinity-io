// @vitest-environment jsdom
//
// Phase 180-03 — LegendBadge unit tests (6 assertions).
// Pattern: createRoot + act (no @testing-library/react).

import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { LegendBadge, buildLegendRows } from './LegendBadge'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('buildLegendRows', () => {
  it('by-type returns 7 rows with key, label, color', () => {
    const rows = buildLegendRows('by-type', 'dark', [])
    expect(rows).toHaveLength(7)
    expect(rows.every((r) => r.key && r.label && r.color)).toBe(true)
  })

  it('by-folder returns one row per unique topDir', () => {
    const nodes = [
      { id: 'a', label: 'a', type: 'memory' as const, size: 1, mtime: 1, tags: [], topDir: 'alpha' },
      { id: 'b', label: 'b', type: 'agent' as const, size: 1, mtime: 1, tags: [], topDir: 'beta' },
      { id: 'c', label: 'c', type: 'memory' as const, size: 1, mtime: 1, tags: [], topDir: 'alpha' },
    ]
    const rows = buildLegendRows('by-folder', 'dark', nodes)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.key).sort()).toEqual(['alpha', 'beta'])
  })
})

describe('LegendBadge', () => {
  it('renders data-testid="legend-badge" with w-[220px] class', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <LegendBadge
          mode='by-type'
          rows={[{ key: 'memory', label: 'Memory', color: 'red' }]}
          hiddenGroups={new Set()}
          onToggleGroup={vi.fn()}
          onCycleMode={vi.fn()}
        />,
      )
    })
    const badge = container.querySelector('[data-testid="legend-badge"]')
    expect(badge).not.toBeNull()
    expect(badge?.className).toContain('w-[220px]')
    act(() => root.unmount())
    container.remove()
  })

  it('clicking a row calls onToggleGroup with the row key', () => {
    const onToggle = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <LegendBadge
          mode='by-type'
          rows={[{ key: 'memory', label: 'Memory', color: 'red' }]}
          hiddenGroups={new Set()}
          onToggleGroup={onToggle}
          onCycleMode={vi.fn()}
        />,
      )
    })
    act(() => {
      const row = container.querySelector('[data-testid="legend-row-memory"]') as HTMLElement
      row.click()
    })
    expect(onToggle).toHaveBeenCalledWith('memory')
    act(() => root.unmount())
    container.remove()
  })

  it('hidden row has opacity-40 class', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <LegendBadge
          mode='by-type'
          rows={[{ key: 'memory', label: 'Memory', color: 'red' }]}
          hiddenGroups={new Set(['memory'])}
          onToggleGroup={vi.fn()}
          onCycleMode={vi.fn()}
        />,
      )
    })
    const row = container.querySelector('[data-testid="legend-row-memory"]') as HTMLElement
    expect(row?.className).toContain('opacity-40')
    act(() => root.unmount())
    container.remove()
  })

  it('clicking legend-title calls onCycleMode', () => {
    const onCycle = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <LegendBadge
          mode='by-type'
          rows={[]}
          hiddenGroups={new Set()}
          onToggleGroup={vi.fn()}
          onCycleMode={onCycle}
        />,
      )
    })
    act(() => {
      const title = container.querySelector('[data-testid="legend-title"]') as HTMLElement
      title.click()
    })
    expect(onCycle).toHaveBeenCalledTimes(1)
    act(() => root.unmount())
    container.remove()
  })
})
