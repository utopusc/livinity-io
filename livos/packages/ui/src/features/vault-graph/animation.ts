// Phase 180-02 — mtime-ordered animation scheduler.
//
// Pure TypeScript — no React, no side effects.
// Exported for use in VaultGraph.tsx and tests.
//
// Threat mitigations:
//  - T-180-02-A: duration is hardcoded 8000ms at call-site; even if configurable,
//    scheduleAnimation caps at Math.max(0, duration).
//  - T-180-02-B: caller MUST call cleanup on unmount (VaultGraph useEffect return).

export type AnimationCleanup = () => void

/**
 * Schedules reveal callbacks in ascending mtime order over `duration` ms.
 * Returns a cleanup function that cancels all pending timeouts.
 *
 * When reducedMotion=true, all timeouts fire at delay=0 (instant reveal).
 * When only 1 node, its timeout also fires at delay=0.
 */
export function scheduleAnimation(
  nodes: Array<{ id: string; mtime: number }>,
  duration: number,
  revealFn: (id: string) => void,
  reducedMotion: boolean,
): AnimationCleanup {
  const sorted = [...nodes].sort((a, b) => a.mtime - b.mtime)
  const safeDuration = Math.max(0, duration)
  const ids: ReturnType<typeof setTimeout>[] = []

  sorted.forEach((node, i) => {
    const delay = reducedMotion
      ? 0
      : sorted.length === 1
        ? 0
        : Math.round((i / (sorted.length - 1)) * safeDuration)
    const tid = setTimeout(() => revealFn(node.id), delay)
    ids.push(tid)
  })

  return () => {
    ids.forEach((id) => clearTimeout(id))
  }
}
