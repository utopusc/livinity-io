// @vitest-environment jsdom
//
// Phase 180-01 — DepthChip unit tests (2 assertions).
// Pattern: createRoot + act (no @testing-library/react).

import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { DepthChip } from './DepthChip'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('DepthChip', () => {
  it('renders data-testid="depth-chip" with "Depth: 2" text when depth=2', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <DepthChip depth={2} onDepthChange={vi.fn()} onBackToGlobal={vi.fn()} />,
      )
    })
    const chip = container.querySelector('[data-testid="depth-chip"]')
    expect(chip).not.toBeNull()
    const label = container.querySelector('[data-testid="depth-label"]')
    expect(label?.textContent).toBe('Depth: 2')
    act(() => root.unmount())
    container.remove()
  })

  it('clicking depth-plus calls onDepthChange(3) and depth-minus calls onDepthChange(1) when depth=2', () => {
    const onDepthChange = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <DepthChip depth={2} onDepthChange={onDepthChange} onBackToGlobal={vi.fn()} />,
      )
    })
    // Click +
    act(() => {
      const plusBtn = container.querySelector('[data-testid="depth-plus"]') as HTMLElement
      plusBtn.click()
    })
    expect(onDepthChange).toHaveBeenCalledWith(3)
    // Click −
    act(() => {
      const minusBtn = container.querySelector('[data-testid="depth-minus"]') as HTMLElement
      minusBtn.click()
    })
    expect(onDepthChange).toHaveBeenCalledWith(1)
    act(() => root.unmount())
    container.remove()
  })
})
