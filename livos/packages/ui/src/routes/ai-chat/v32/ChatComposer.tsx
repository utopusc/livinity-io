// ChatComposer — wraps MessageInput + FileAttachment + send/stop button.
//
// Visual: Card with bg-liv-card border-liv-border rounded-2xl, focus-within ring.
// Drag-drop: entire card is the drop target; DragOverlay renders on hover.
//
// Pattern: adapted from Suna chat-input/chat-input.tsx.
// Icons: @tabler/icons-react (no Lucide).
//
// TODO (Phase 84 V32-MCP / deferred to P88): wire a "+ MCP" button next to
// the file-attachment button that opens BrowseDialog scoped to the
// CURRENTLY SELECTED agent. Skipped for P84 because the v32 chat surface
// does not yet have an agent selector — adding the button without one
// would render a no-op (or worse, hardcode an agent id). The natural
// place to add it is P88 (WS→SSE migration) when agent selection lands
// in this composer. See .planning/phases/84-mcp-single-source-of-truth/
// 84-CONTEXT.md §"ChatComposer + MCP decision".

import {useEffect, useRef, useState} from 'react'
import {IconArrowUp, IconPlayerStop} from '@tabler/icons-react'
import {cn} from '@/shadcn-lib/utils'
import {MessageInput} from './MessageInput'
import {FileAttachmentButton, DragOverlay, fileListToAttachments} from './FileAttachment'
import {AttachmentGroup} from './AttachmentGroup'
import type {Attachment} from './types'

interface ChatComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (attachments: Attachment[]) => void
  onStop?: () => void
  isStreaming?: boolean
  disabled?: boolean
  placeholder?: string
  agentName?: string
  className?: string
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming = false,
  disabled = false,
  placeholder,
  agentName,
  className,
}: ChatComposerProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Phase 90 — P89 deferred wire-up. P89's keyboard hook dispatches the
  // `liv-composer-focus` CustomEvent on Cmd+K (or Ctrl+K). Focus the textarea
  // when the event fires. Listener is window-scoped because the dispatch
  // happens at document.body level.
  useEffect(() => {
    const handleFocus = () => textareaRef.current?.focus()
    window.addEventListener('liv-composer-focus', handleFocus)
    return () => window.removeEventListener('liv-composer-focus', handleFocus)
  }, [])

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !disabled

  const handleSubmit = () => {
    if (isStreaming) {
      onStop?.()
      return
    }
    if (!canSend) return
    onSubmit(attachments)
    setAttachments([])
  }

  const handleFilesSelected = (newAttachments: Attachment[]) => {
    setAttachments((prev) => [...prev, ...newAttachments])
  }

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => {
      const removed = prev.find((a) => a.id === id)
      if (removed?.localUrl) URL.revokeObjectURL(removed.localUrl)
      return prev.filter((a) => a.id !== id)
    })
  }

  // Drag-drop handlers on the outer card
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)
    if (e.dataTransfer.files.length > 0) {
      handleFilesSelected(fileListToAttachments(e.dataTransfer.files))
    }
  }

  return (
    <div
      className={cn('mx-auto w-full max-w-3xl px-4 pb-4', className)}
      role='region'
      aria-label={agentName ? `Message ${agentName}` : 'Message composer'}
    >
      <div
        className={cn(
          'relative rounded-2xl border bg-liv-card p-1.5 shadow-elevation-sm transition-shadow',
          'border-liv-border',
          'focus-within:ring-2 focus-within:ring-liv-ring',
          isDraggingOver && 'ring-2 ring-liv-secondary/60',
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDraggingOver && <DragOverlay />}

        {/* Attachment chip row */}
        <AttachmentGroup attachments={attachments} onRemove={handleRemoveAttachment} />

        {/* Textarea */}
        <MessageInput
          ref={textareaRef}
          value={value}
          onChange={onChange}
          onSubmit={handleSubmit}
          placeholder={placeholder ?? (agentName ? `Message ${agentName}...` : 'Message Liv...')}
          disabled={disabled && !isStreaming}
          isDraggingOver={isDraggingOver}
        />

        {/* Bottom toolbar */}
        <div className='flex items-center justify-between px-1 pb-0.5'>
          <div className='flex items-center gap-1'>
            <FileAttachmentButton
              onFilesSelected={handleFilesSelected}
              disabled={disabled && !isStreaming}
            />
          </div>

          <SendButton
            isStreaming={isStreaming}
            canSend={canSend}
            onClick={handleSubmit}
          />
        </div>
      </div>

      {/* Streaming indicator */}
      {isStreaming && agentName && (
        <p className='mt-1.5 text-center text-xs text-liv-muted-foreground'>
          {agentName} is working...
        </p>
      )}
    </div>
  )
}

interface SendButtonProps {
  isStreaming: boolean
  canSend: boolean
  onClick: () => void
}

function SendButton({isStreaming, canSend, onClick}: SendButtonProps) {
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={!isStreaming && !canSend}
      aria-label={isStreaming ? 'Stop generation' : 'Send message'}
      title={isStreaming ? 'Stop (Cmd+Enter)' : 'Send (Enter)'}
      className={cn(
        'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-liv-ring',
        isStreaming
          ? 'bg-red-500 text-white hover:bg-red-600'
          : canSend
            ? 'bg-liv-primary text-liv-primary-foreground hover:bg-liv-primary/90'
            : 'bg-liv-muted text-liv-muted-foreground cursor-not-allowed opacity-50',
      )}
    >
      {isStreaming ? (
        <IconPlayerStop size={16} aria-hidden='true' />
      ) : (
        <IconArrowUp size={16} aria-hidden='true' />
      )}
    </button>
  )
}
