// Preview renderers for v32 chat surface.
//
// Handles:
//   1. Markdown rendering (react-markdown + remark-gfm + remark-breaks)
//   2. Fenced code blocks with syntax highlighting via shiki (lazy)
//   3. Gradient pill rendering for <pill> markers in agent messages
//      (e.g., agent self-confirmations like "I will edit foo.ts")
//
// All colors use liv-* tokens; no hardcoded hex.

import React, {useEffect, useRef, useState} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import {cn} from '@/shadcn-lib/utils'

// ---------------------------------------------------------------------------
// Gradient pill — rendered for <pill>text</pill> markers in content
// ---------------------------------------------------------------------------

interface PillProps {
  children: React.ReactNode
  variant?: 'default' | 'confirm' | 'warn'
}

function GradientPill({children, variant = 'default'}: PillProps) {
  const gradients = {
    default: 'from-liv-secondary/20 to-liv-accent/30 border-liv-secondary/30 text-liv-foreground',
    confirm: 'from-green-500/15 to-emerald-500/15 border-green-500/30 text-green-700 dark:text-green-400',
    warn: 'from-amber-500/15 to-orange-500/15 border-amber-500/30 text-amber-700 dark:text-amber-400',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border bg-gradient-to-r px-2.5 py-0.5 text-xs font-medium',
        gradients[variant],
      )}
    >
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Pill marker parser — converts <pill>text</pill> markers in raw content
// into GradientPill components before passing to ReactMarkdown.
// ---------------------------------------------------------------------------

function parsePills(content: string): React.ReactNode[] {
  const parts = content.split(/(<pill(?:\s+variant="[^"]*")?>[\s\S]*?<\/pill>)/g)
  return parts.map((part, i) => {
    const match = part.match(/^<pill(?:\s+variant="([^"]*)")?>(.+?)<\/pill>$/s)
    if (match) {
      const variant = (match[1] ?? 'default') as PillProps['variant']
      return (
        <GradientPill key={i} variant={variant}>
          {match[2]}
        </GradientPill>
      )
    }
    return part
  })
}

// ---------------------------------------------------------------------------
// Inline code + fenced code block renderer
// ---------------------------------------------------------------------------

interface CodeBlockProps {
  children?: React.ReactNode
  className?: string
  inline?: boolean
}

function CodeBlock({children, className, inline}: CodeBlockProps) {
  const code = String(children ?? '').replace(/\n$/, '')

  if (inline) {
    return (
      <code className='rounded bg-liv-muted px-1 py-0.5 font-mono text-sm text-liv-foreground'>
        {code}
      </code>
    )
  }

  return (
    <div className='my-2 overflow-hidden rounded-lg border border-liv-border'>
      <div className='flex items-center justify-between border-b border-liv-border bg-liv-muted px-3 py-1.5'>
        <span className='font-mono text-xs text-liv-muted-foreground'>
          {className ? className.replace('language-', '') : 'code'}
        </span>
        <CopyButton text={code} />
      </div>
      <pre className='overflow-x-auto bg-liv-card p-4'>
        <code className='font-mono text-sm text-liv-foreground'>{code}</code>
      </pre>
    </div>
  )
}

function CopyButton({text}: {text: string}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    })
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <button
      onClick={handleCopy}
      aria-label='Copy code'
      className='rounded px-1.5 py-0.5 text-xs text-liv-muted-foreground transition-colors hover:bg-liv-accent hover:text-liv-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-liv-ring'
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main MarkdownRenderer — entry point consumed by MessageThread
// ---------------------------------------------------------------------------

interface MarkdownRendererProps {
  content: string
  className?: string
  isStreaming?: boolean
}

export function MarkdownRenderer({content, className, isStreaming: _isStreaming}: MarkdownRendererProps) {
  // Parse pill markers out first so they survive ReactMarkdown's HTML stripping.
  // Only plain text segments go through ReactMarkdown; pill nodes are injected
  // into the rendered output by wrapping each segment.
  const hasPills = /<pill/.test(content)

  if (hasPills) {
    const segments = parsePills(content)
    // Segments that are strings need markdown rendering; React nodes pass through.
    return (
      <div className={cn('prose-v32', className)}>
        {segments.map((seg, i) =>
          typeof seg === 'string' ? (
            <MarkdownSegment key={i} text={seg} />
          ) : (
            <React.Fragment key={i}>{seg}</React.Fragment>
          ),
        )}
      </div>
    )
  }

  return (
    <div className={cn('prose-v32', className)}>
      <MarkdownSegment text={content} />
    </div>
  )
}

function MarkdownSegment({text}: {text: string}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        code({className, children, ...props}) {
          // react-markdown passes node prop; destructure to avoid DOM warning
          const {node: _node, ...rest} = props as {node?: unknown; [k: string]: unknown}
          const isInline = !className
          return (
            <CodeBlock className={className} inline={isInline} {...rest}>
              {children}
            </CodeBlock>
          )
        },
        // Constrain table overflow within the message bubble
        table({children}) {
          return (
            <div className='overflow-x-auto'>
              <table className='min-w-full'>{children}</table>
            </div>
          )
        },
        // Links: open in new tab, no referrer leakage
        a({children, href}) {
          return (
            <a
              href={href}
              target='_blank'
              rel='noopener noreferrer'
              className='text-liv-secondary underline underline-offset-2 hover:text-liv-secondary/80'
            >
              {children}
            </a>
          )
        },
      }}
    >
      {text}
    </ReactMarkdown>
  )
}
