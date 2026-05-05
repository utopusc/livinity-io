// v32 Chat Route — top-level orchestrator.
//
// This route coexists with /ai-chat (legacy) and is accessible at /ai-chat-v2
// for dev preview during Wave 2. P90 will make this the default /ai-chat.
//
// Current state (P81): Renders with MOCK DATA only. SSE wiring happens at P88.
// P82 mounts ToolCallPanel here once its lane is done.
//
// Mock messages are defined here so component props are real types
// (per D-NO-MOCK-EVERYWHERE: mock only in this file, not in sub-components).

import {useCallback, useState} from 'react'
import {MessageThread} from './MessageThread'
import {ChatComposer} from './ChatComposer'
import type {Attachment, ChatMessage} from './types'

// ---------------------------------------------------------------------------
// Mock data — dev preview only; removed at P88 SSE wiring
// ---------------------------------------------------------------------------

function makeMockMessages(): ChatMessage[] {
  const now = Date.now()
  return [
    {
      id: 'mock-1',
      role: 'user',
      content: 'What can you help me with?',
      status: 'complete',
      timestamp: now - 60_000 * 5,
    },
    {
      id: 'mock-2',
      role: 'assistant',
      content:
        "I'm Liv, your AI assistant powered by Claude. I can help you with:\n\n- **Research** — searching the web and summarizing information\n- **Files** — reading, editing, and creating files on your server\n- **Terminal** — running commands and scripts\n- **Computer control** — using your desktop via bytebot\n\nWhat would you like to do?",
      status: 'complete',
      timestamp: now - 60_000 * 4,
    },
    {
      id: 'mock-3',
      role: 'user',
      content: 'Can you show me an example tool call?',
      status: 'complete',
      timestamp: now - 60_000 * 3,
    },
    {
      id: 'mock-4',
      role: 'assistant',
      content: 'Sure! Here is an example of how I execute a shell command:',
      status: 'complete',
      timestamp: now - 60_000 * 2,
      toolCalls: [
        {
          toolId: 'mock-tc-1',
          name: 'execute_command',
          input: {command: 'ls /opt/livos'},
          output: 'data  logs  packages  update.sh',
          status: 'complete',
          startedAt: now - 60_000 * 2 - 500,
          endedAt: now - 60_000 * 2,
          batchId: 'batch-mock-1',
        },
      ],
    },
    {
      id: 'mock-5',
      role: 'assistant',
      content: 'The command ran successfully and listed the `/opt/livos` directory. You can see the main subdirectories: `data`, `logs`, `packages`, and the `update.sh` deploy script.',
      status: 'complete',
      timestamp: now - 60_000,
    },
  ]
}

// ---------------------------------------------------------------------------
// Route component
// ---------------------------------------------------------------------------

export default function AiChatV32() {
  const [messages, setMessages] = useState<ChatMessage[]>(makeMockMessages)
  const [input, setInput] = useState('')

  // Simulates sending a user message + a mock streaming response.
  // P88 replaces this with useLivAgentStream + real SSE dispatch.
  const handleSubmit = useCallback(
    (attachments: Attachment[]) => {
      const text = input.trim()
      if (!text && attachments.length === 0) return

      const userMsg: ChatMessage = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: text || '(file attachment)',
        attachments: attachments.length > 0 ? attachments : undefined,
        status: 'complete',
        timestamp: Date.now(),
      }

      const assistantMsg: ChatMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: '',
        status: 'streaming',
        timestamp: Date.now() + 1,
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setInput('')

      // Simulate streaming by incrementally appending text
      const reply = `You said: "${text || '(attachment)'}"\n\nThis is a mock streaming response. P88 will wire real SSE chunks here.`
      let charIdx = 0

      const interval = setInterval(() => {
        charIdx = Math.min(charIdx + 6, reply.length)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? {...m, content: reply.slice(0, charIdx), status: charIdx < reply.length ? 'streaming' : 'complete'}
              : m,
          ),
        )
        if (charIdx >= reply.length) clearInterval(interval)
      }, 30)
    },
    [input],
  )

  const isStreaming = messages.some((m) => m.status === 'streaming')

  return (
    <div
      className='flex h-full flex-col bg-liv-background'
      role='main'
      aria-label='AI Chat v2'
    >
      {/* Dev preview banner — removed at P90 cutover */}
      <div className='flex-shrink-0 border-b border-liv-border bg-liv-card px-4 py-2'>
        <div className='mx-auto flex max-w-3xl items-center justify-between'>
          <span className='text-sm font-semibold text-liv-foreground'>Liv Agent v2</span>
          <span className='rounded-full bg-liv-accent px-2 py-0.5 text-xs text-liv-muted-foreground'>
            dev preview · P81 mock data · SSE wires at P88
          </span>
        </div>
      </div>

      {/* Message thread — flex-1 scrolls */}
      <MessageThread
        messages={messages}
        agentName='Liv Default'
        agentEmoji=''
        onSuggest={(prompt) => setInput(prompt)}
        className='flex-1'
      />

      {/* Composer — fixed at bottom */}
      <div className='flex-shrink-0 border-t border-liv-border bg-liv-background'>
        <ChatComposer
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          isStreaming={isStreaming}
          agentName='Liv Default'
        />
      </div>
    </div>
  )
}
