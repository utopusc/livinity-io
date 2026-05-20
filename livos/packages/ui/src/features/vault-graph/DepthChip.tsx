// Phase 180-01 — DepthChip floating pill for local graph mode.
//
// Renders top-center above ForceGraph2D canvas (z-20).
// Clamps depth to [1, 4] in click handlers.
//
// Threat T-180-01-C: onDepthChange callback applies Math.max/min guards —
// out-of-range values never reach state.

interface Props {
  depth: number // 1–4 (already clamped by caller)
  onDepthChange: (d: number) => void
  onBackToGlobal: () => void
}

export function DepthChip({ depth, onDepthChange, onBackToGlobal }: Props) {
  return (
    <div
      data-testid='depth-chip'
      className='absolute left-1/2 top-2 z-20 -translate-x-1/2 flex items-center gap-2 rounded-full border border-[color:var(--line-strong)] bg-[color:var(--bg-2)] px-3 py-1 text-sm text-[color:var(--fg)]'
    >
      <button
        type='button'
        data-testid='depth-minus'
        onClick={() => onDepthChange(Math.max(1, depth - 1))}
        className='font-mono hover:text-[color:var(--fg-mute)] transition-colors'
      >
        −
      </button>
      <span data-testid='depth-label'>Depth: {depth}</span>
      <button
        type='button'
        data-testid='depth-plus'
        onClick={() => onDepthChange(Math.min(4, depth + 1))}
        className='font-mono hover:text-[color:var(--fg-mute)] transition-colors'
      >
        +
      </button>
      <span className='mx-1 text-[color:var(--line-strong)]'>|</span>
      <button
        type='button'
        data-testid='depth-back'
        onClick={onBackToGlobal}
        className='text-xs underline text-[color:var(--fg-mute)] hover:text-[color:var(--fg)] transition-colors'
      >
        Back to global
      </button>
    </div>
  )
}
