// MessageThread — scrollable message list with auto-scroll-to-bottom.
//
// Layout rules (Suna parity):
//   - No bubble background for assistant messages — plain prose.
//   - Light bg-liv-muted bubble for user messages — rounded-2xl, max-w-[80%], ml-auto.
//   - Avatars: h-8 w-8 rounded-full circle, emoji + bg color.
//   - gap-6 between messages, py-12 thread top/bottom padding.
//   - Framer Motion fade+slide-up on new message entry.
//   - StreamingCaret appended to streaming assistant message.
//
// Virtualization: plain .map() — v32 starts simple; if >100 msgs becomes a
// perf issue, P88 can swap to react-window (already in deps).

import {useEffect, useRef} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {cn} from '@/shadcn-lib/utils'
import {MarkdownRenderer} from './preview-renderers'
import {StreamingCaret, StreamingCaretStyles} from './streaming-caret'
import type {ChatMessage} from './types'

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  agentName?: string
  agentEmoji?: string
  onSuggest?: (prompt: string) => void
}

const SUGGESTED_PROMPTS = [
  'What can you help me with?',
  'Show me what tools you have available.',
  'Help me analyze a file.',
  'Search the web for recent news.',
]

function EmptyState({agentName = 'Liv', agentEmoji = '', onSuggest}: EmptyStateProps) {
  return (
    <div className='flex h-full flex-col items-center justify-center gap-6 py-16'>
      <div className='flex flex-col items-center gap-3'>
        {agentEmoji && (
          <div className='flex h-16 w-16 items-center justify-center rounded-full bg-liv-accent text-3xl'>
            {agentEmoji}
          </div>
        )}
        <h2 className='text-xl font-semibold text-liv-foreground'>
          Start a conversation with {agentName}
        </h2>
        <p className='text-sm text-liv-muted-foreground'>
          Ask anything — Liv uses tools to help you get things done.
        </p>
      </div>

      <div className='flex flex-wrap justify-center gap-2'>
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onSuggest?.(prompt)}
            className='rounded-full border border-liv-border bg-liv-card px-4 py-2 text-sm text-liv-foreground transition-colors hover:bg-liv-accent hover:text-liv-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-liv-ring'
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single message bubble
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  message: ChatMessage
  isLast: boolean
}

function UserAvatar() {
  return (
    <div
      aria-label='You'
      className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-liv-secondary/20 text-sm font-semibold text-liv-secondary'
    >
      U
    </div>
  )
}

function AgentAvatar({emoji, name}: {emoji?: string; name?: string}) {
  return (
    <div
      aria-label={name ?? 'Agent'}
      className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-liv-accent text-base'
    >
      {emoji ?? '🤖'}
    </div>
  )
}

function MessageBubble({message, isLast}: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isStreaming = message.status === 'streaming'

  if (isUser) {
    return (
      <div className='flex items-end justify-end gap-3' role='listitem'>
        <div
          className={cn(
            'max-w-[80%] rounded-2xl bg-liv-muted px-4 py-3 text-sm text-liv-foreground',
            'rounded-br-sm',
          )}
        >
          <p className='whitespace-pre-wrap break-words'>{message.content}</p>
        </div>
        <UserAvatar />
      </div>
    )
  }

  // Assistant (or system — system is hidden from thread for now)
  if (message.role === 'system') return null

  return (
    <div className='flex items-start gap-3' role='listitem'>
      <AgentAvatar />
      <div className='min-w-0 flex-1'>
        <div className='text-sm text-liv-foreground'>
          <MarkdownRenderer
            content={message.content}
            isStreaming={isStreaming}
          />
          {isStreaming && isLast && <StreamingCaret />}
        </div>

        {/* Tool call pills — P82 will replace this stub with clickable pills */}
        {(message.toolCalls?.length ?? 0) > 0 && (
          <div className='mt-2 flex flex-wrap gap-1.5'>
            {message.toolCalls!.map((tc) => (
              <span
                key={tc.toolId}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs',
                  tc.status === 'running'
                    ? 'animate-pulse border-liv-secondary/40 bg-liv-secondary/10 text-liv-secondary'
                    : tc.status === 'error'
                      ? 'border-red-500/40 bg-red-500/10 text-red-600'
                      : 'border-liv-border bg-liv-muted text-liv-muted-foreground',
                )}
              >
                {tc.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MessageThread — main export
// ---------------------------------------------------------------------------

interface MessageThreadProps {
  messages: ChatMessage[]
  agentName?: string
  agentEmoji?: string
  onSuggest?: (prompt: string) => void
  className?: string
}

export function MessageThread({messages, agentName, agentEmoji, onSuggest, className}: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const userScrolledUpRef = useRef(false)

  // Track whether the user has scrolled up (suppress auto-scroll when true)
  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    userScrolledUpRef.current = el.scrollHeight - el.scrollTop - el.clientHeight > 80
  }

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      bottomRef.current?.scrollIntoView({behavior: 'smooth'})
    }
  }, [messages])

  const isEmpty = messages.filter((m) => m.role !== 'system').length === 0

  return (
    <>
      <StreamingCaretStyles />
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={cn(
          'flex-1 overflow-y-auto overflow-x-hidden overscroll-contain',
          'scroll-smooth',
          className,
        )}
        role='list'
        aria-label='Conversation messages'
      >
        {isEmpty ? (
          <EmptyState agentName={agentName} agentEmoji={agentEmoji} onSuggest={onSuggest} />
        ) : (
          <div className='mx-auto max-w-3xl space-y-6 px-4 py-12'>
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => (
                <motion.div
                  key={msg.id}
                  layout
                  initial={{opacity: 0, y: 12}}
                  animate={{opacity: 1, y: 0}}
                  exit={{opacity: 0, y: -4}}
                  transition={{duration: 0.2, ease: 'easeOut'}}
                >
                  <MessageBubble message={msg} isLast={idx === messages.length - 1} />
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </>
  )
}
