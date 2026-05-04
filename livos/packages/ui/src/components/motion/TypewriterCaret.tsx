'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Liv design-system streaming-text caret.
 *
 * NEW component (no equivalent in `motion-primitives/`); reference shape
 * is Hermes' StreamingCaret per v31-DRAFT.md line 231 — a 2px-wide vertical
 * bar pinned to the trailing edge of the last text node inside the anchor
 * element, blinking at 530ms intervals (industry standard).
 *
 * Used by P70 composer + P67 streaming text rendering. The caret follows
 * streamed content via a `MutationObserver` watching `childList` and
 * `characterData` mutations on the anchor; on each mutation, position is
 * recomputed inside `requestAnimationFrame`.
 *
 * Crash-safety: renders nothing until `anchorRef.current` is non-null.
 * Cleanup: interval is cleared and observer disconnected in the
 * `useEffect` return.
 */
export type TypewriterCaretProps = {
  /** Anchor element whose last text node the caret pins to. */
  anchorRef: React.RefObject<HTMLElement>;
  /** Blink half-period in milliseconds (default 530ms). */
  blinkMs?: number;
  /** Caret color (default `var(--liv-accent-cyan)`). */
  color?: string;
  /** Caret width in px (default 2). */
  width?: number;
  /** Optional className for the caret span. */
  className?: string;
};

type CaretRect = { top: number; left: number; height: number };

function computeCaretRect(anchor: HTMLElement | null): CaretRect | null {
  if (!anchor) return null;
  const range = document.createRange();
  // Find the last text node descendant; fall back to the anchor itself.
  let node: Node = anchor;
  while (node.lastChild) node = node.lastChild;
  try {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.nodeValue?.length ?? 0;
      range.setStart(node, length);
      range.setEnd(node, length);
    } else if (node instanceof Element) {
      range.selectNodeContents(node);
      range.collapse(false);
    } else {
      return null;
    }
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      const anchorRect = anchor.getBoundingClientRect();
      return { top: anchorRect.top, left: anchorRect.right, height: anchorRect.height };
    }
    return { top: rect.top, left: rect.right, height: rect.height || 16 };
  } catch {
    return null;
  } finally {
    range.detach?.();
  }
}

export function TypewriterCaret({
  anchorRef,
  blinkMs = 530,
  color = 'var(--liv-accent-cyan)',
  width = 2,
  className,
}: TypewriterCaretProps) {
  const [visible, setVisible] = useState(true);
  const [rect, setRect] = useState<CaretRect | null>(null);
  const rafRef = useRef<number | null>(null);

  // Reposition on mount + on every relevant mutation.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const reposition = () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setRect(computeCaretRect(anchorRef.current));
      });
    };

    reposition();
    const observer = new MutationObserver(reposition);
    observer.observe(anchor, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [anchorRef]);

  // Blink interval.
  useEffect(() => {
    const id = window.setInterval(() => setVisible((v) => !v), blinkMs);
    return () => window.clearInterval(id);
  }, [blinkMs]);

  if (!rect) return null;

  return (
    <span
      aria-hidden='true'
      className={className}
      style={{
        position: 'fixed',
        top: rect.top,
        left: rect.left,
        width,
        height: rect.height,
        backgroundColor: color,
        opacity: visible ? 1 : 0,
        pointerEvents: 'none',
        zIndex: 50,
        transition: 'opacity 60ms linear',
      }}
    />
  );
}
