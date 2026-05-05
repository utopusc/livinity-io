// MessageInput — auto-growing textarea with keyboard submit.
//
// Keyboard behavior:
//   - Cmd+Enter (macOS) / Ctrl+Enter (Windows/Linux): send message
//   - Shift+Enter: insert newline (natural browser behavior)
//   - Enter alone: send message (same as Cmd+Enter)
//
// Auto-grow: adjusts height between 44px and 200px on content change.
//
// Pattern: adapted from Suna chat-input/message-input.tsx.

import {forwardRef, useEffect} from 'react'
import {cn} from '@/shadcn-lib/utils'

interface MessageInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder?: string
  disabled?: boolean
  isDraggingOver?: boolean
  className?: string
}

export const MessageInput = forwardRef<HTMLTextAreaElement, MessageInputProps>(
  function MessageInput(
    {value, onChange, onSubmit, placeholder = 'Message Liv...', disabled, isDraggingOver, className},
    ref,
  ) {
    // Auto-grow on value change
    useEffect(() => {
      const el = (ref as React.RefObject<HTMLTextAreaElement>)?.current
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${Math.min(Math.max(el.scrollHeight, 44), 200)}px`
    }, [value, ref])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing) return

      const isSendKey =
        (e.key === 'Enter' && !e.shiftKey) ||
        (e.key === 'Enter' && (e.metaKey || e.ctrlKey))

      if (isSendKey) {
        e.preventDefault()
        if (value.trim()) onSubmit()
      }
    }

    return (
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        aria-label='Message input'
        aria-multiline='true'
        className={cn(
          'w-full resize-none bg-transparent px-2 py-2.5 text-base text-liv-foreground outline-none',
          'placeholder:text-liv-muted-foreground',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'min-h-[44px] max-h-[200px] overflow-y-auto',
          isDraggingOver && 'opacity-30',
          className,
        )}
        style={{height: '44px'}}
      />
    )
  },
)
