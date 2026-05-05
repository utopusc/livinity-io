/**
 * LivStreamingText — Phase 70-04 streaming text renderer.
 *
 * Markdown gate decision (recorded in
 * `.planning/phases/70-composer-streaming-ux-polish/.markdown-deps-check.txt`):
 *   react-markdown=present, remark-gfm=present  →  MARKDOWN PATH
 *
 * Renders the assistant message content with P66's `<TypewriterCaret>`
 * pinned to the trailing edge of the rendered content while streaming.
 *
 * Markdown path (this file): renders via `<ReactMarkdown remarkPlugins={[remarkGfm]}>`.
 * If the deps were absent, the fallback path would have been a plain
 * `<pre className='whitespace-pre-wrap font-sans'>{content}</pre>` — see CONTEXT
 * D-07 / D-33; D-NO-NEW-DEPS overrides Suna parity.
 *
 * Caret-hugging-last-token contract (CONTEXT D-09, D-33):
 *   - `isStreaming === true` && `content.length > 0`  →  caret rendered, anchored
 *     to the content wrapper. P66 TypewriterCaret walks the last-text-node and
 *     pins itself there via MutationObserver.
 *   - `isStreaming === true` && empty content          →  NO caret (avoids orphan
 *     blinking caret on empty assistant placeholder; the typing-dots component in
 *     70-05 handles "waiting for first token" UX).
 *   - `isStreaming === false`                          →  NO caret.
 *
 * Replaces (functionally) the legacy `streaming-message.tsx`, which stays
 * under D-08 D-NO-DELETE. Integration into `chat-messages.tsx` happens in 70-08.
 */

import {useRef} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import {TypewriterCaret} from '@/components/motion'
import {cn} from '@/shadcn-lib/utils'

// Phase 75-07 / CONTEXT D-24 — wire ShikiBlock + MermaidBlock into the
// markdown render path. Inline `code` stays as native <code>; non-inline
// blocks route to ShikiBlock for github-dark syntax highlighting; lang
// === 'mermaid' routes to MermaidBlock for diagram rendering. Both blocks
// were shipped standalone in plan 75-05 and are imported here for the
// first time — that is the entire 75-07 wire-up for COMPOSER-06.
import {MermaidBlock} from './mermaid-block'
import {ShikiBlock} from './shiki-block'

export interface LivStreamingTextProps {
	/** The streaming-or-final assistant content (plain string, may be markdown). */
	content: string
	/** Whether the agent is currently streaming this message. Drives caret render. */
	isStreaming: boolean
	/** Optional className appended to the wrapper div. */
	className?: string
}

/**
 * Pure helper exported for unit testing the caret-toggle decision.
 * The component uses this same function internally.
 */
export function shouldRenderCaret(args: {isStreaming: boolean; content: string}): boolean {
	return args.isStreaming && args.content.length > 0
}

/**
 * Reports whether the markdown render path is active (i.e. react-markdown +
 * remark-gfm are both present in package.json at build time and the component
 * is rendering via ReactMarkdown rather than the plain `<pre>` fallback).
 *
 * In this build the markdown path IS active — see header comment + the
 * `.markdown-deps-check.txt` sentinel. If that sentinel ever flips back to
 * `=absent`, the component swaps to the fallback shape and this returns false.
 */
export function isMarkdownAvailable(): boolean {
	return true
}

export function LivStreamingText({content, isStreaming, className}: LivStreamingTextProps) {
	const anchorRef = useRef<HTMLDivElement>(null)
	const showCaret = shouldRenderCaret({isStreaming, content})

	return (
		<div
			className={cn(
				'liv-streaming-text prose prose-sm max-w-none break-words text-[color:var(--liv-text-primary)]',
				className,
			)}
		>
			{/* Anchor — content goes inside this ref so TypewriterCaret can walk
			    its last text node and pin itself to the trailing edge (CONTEXT D-09,
			    D-33; P66-02 caret API requires `anchorRef`). */}
			<div ref={anchorRef} className='liv-streaming-text__content'>
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					components={{
						// Phase 75-07 / CONTEXT D-24 — code-block dispatcher.
						// react-markdown 9 passes `inline` via the `node` prop or
						// detects via parent context; we detect using the className
						// pattern (`language-xxx` only set on fenced blocks, not
						// inline `\`code\``). Fall back to native <code> for inline
						// usage so prose flow is preserved.
						code(props: any) {
							const {className: codeClassName, children, inline} = props
							const isInline = inline === true || !codeClassName
							const lang = (codeClassName || '').replace('language-', '')
							const source = String(children ?? '').replace(/\n$/, '')
							if (isInline) {
								return <code className={codeClassName}>{children}</code>
							}
							if (lang === 'mermaid') {
								return <MermaidBlock source={source} />
							}
							return <ShikiBlock lang={lang || 'text'} source={source} />
						},
					}}
				>
					{content}
				</ReactMarkdown>
			</div>
			{showCaret && <TypewriterCaret anchorRef={anchorRef} />}
		</div>
	)
}
