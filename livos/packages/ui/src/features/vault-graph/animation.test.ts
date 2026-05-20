// @vitest-environment jsdom
//
// Phase 180-02 — scheduleAnimation unit tests (6 assertions).
// Pure TypeScript — no JSX, no React.
// Uses vi.useFakeTimers() to control setTimeout scheduling.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { scheduleAnimation } from './animation'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('scheduleAnimation', () => {
  it('reveals nodes in ascending mtime order', () => {
    const order: string[] = []
    const cleanup = scheduleAnimation(
      [{ id: 'A', mtime: 200 }, { id: 'B', mtime: 100 }],
      1000,
      (id) => order.push(id),
      false,
    )
    vi.runAllTimers()
    expect(order).toEqual(['B', 'A'])
    cleanup()
  })

  it('last reveal fires at or before total duration', () => {
    const setSpy = vi.spyOn(globalThis, 'setTimeout')
    const cleanup = scheduleAnimation(
      [{ id: 'A', mtime: 1 }, { id: 'B', mtime: 2 }, { id: 'C', mtime: 3 }],
      3000,
      () => {},
      false,
    )
    const capturedDelays = setSpy.mock.calls.map((c) => c[1] as number)
    expect(Math.max(...capturedDelays)).toBeLessThanOrEqual(3000)
    cleanup()
  })

  it('single node reveals at delay 0', () => {
    const setSpy = vi.spyOn(globalThis, 'setTimeout')
    const cleanup = scheduleAnimation([{ id: 'X', mtime: 999 }], 8000, () => {}, false)
    expect(setSpy.mock.calls[0][1]).toBe(0)
    cleanup()
  })

  it('reducedMotion=true fires all reveals at delay 0', () => {
    const setSpy = vi.spyOn(globalThis, 'setTimeout')
    const cleanup = scheduleAnimation(
      [{ id: 'A', mtime: 1 }, { id: 'B', mtime: 1000 }],
      8000,
      () => {},
      true,
    )
    expect(setSpy.mock.calls.every((c) => c[1] === 0)).toBe(true)
    cleanup()
  })

  it('cleanup cancels pending timeouts — revealFn never called', () => {
    const revealFn = vi.fn()
    const cleanup = scheduleAnimation([{ id: 'A', mtime: 1 }], 8000, revealFn, false)
    cleanup()
    vi.runAllTimers()
    expect(revealFn).not.toHaveBeenCalled()
  })

  it('scheduleAnimation returns a cleanup function', () => {
    const cleanup = scheduleAnimation([{ id: 'A', mtime: 1 }], 8000, () => {}, false)
    expect(typeof cleanup).toBe('function')
    cleanup()
  })
})
