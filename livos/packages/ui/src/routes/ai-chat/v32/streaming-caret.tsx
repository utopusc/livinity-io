// Streaming caret component — blinking | cursor that appears while the assistant
// is emitting tokens. Pure CSS animation; no JS interval required.
// Mirrors Suna's TypewriterCaret pattern (P66 motion primitives also has a version,
// but this is self-contained so v32/ stays file-disjoint from other routes).

import React from 'react'

interface StreamingCaretProps {
  className?: string
}

export function StreamingCaret({className}: StreamingCaretProps) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: 'inline-block',
        width: '2px',
        height: '1em',
        verticalAlign: 'text-bottom',
        backgroundColor: 'var(--liv-primary)',
        animation: 'v32-caret-blink 1s step-start infinite',
        borderRadius: '1px',
        marginLeft: '1px',
      }}
    />
  )
}

// Inject the keyframe once per document. Using a <style> tag avoids adding
// a global CSS class that could bleed into legacy routes.
export function StreamingCaretStyles() {
  return (
    <style>{`
      @keyframes v32-caret-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }
    `}</style>
  )
}
