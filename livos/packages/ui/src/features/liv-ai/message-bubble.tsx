/**
 * Phase 197-06 — MessageBubble.
 *
 * Renders a single LivAiMessage. T-197-06-02: text content is rendered via
 * React text interpolation only (NEVER dangerouslySetInnerHTML). Tool calls
 * surface as inline chips; tool results expand in a <details>.
 */

import type {LivAiMessage} from './use-liv-ai'

export function MessageBubble({message}: {message: LivAiMessage}) {
	const isUser = message.role === 'user'
	return (
		<div className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-4 py-2`}>
			<div
				className={
					'max-w-[80%] rounded-2xl px-4 py-3 text-sm ' +
					(isUser
						? 'bg-cyan-600 text-white'
						: 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100')
				}
			>
				{message.content ? <p className='whitespace-pre-wrap break-words'>{message.content}</p> : null}
				{message.toolCalls?.map((tc) => (
					<div
						key={tc.id}
						className='mt-2 inline-flex items-center gap-1 rounded-md bg-cyan-50 px-2 py-1 text-xs font-mono text-cyan-900 dark:bg-cyan-950 dark:text-cyan-200'
					>
						<span aria-hidden='true'>🔧</span>
						<span>{tc.name}</span>
					</div>
				))}
				{message.toolResults?.map((tr) => (
					<details
						key={tr.toolCallId}
						className='mt-2 rounded-md bg-neutral-50 p-2 text-xs dark:bg-neutral-900'
					>
						<summary className='cursor-pointer text-neutral-600 dark:text-neutral-400'>
							Tool result
						</summary>
						<pre className='mt-1 overflow-auto whitespace-pre-wrap'>
							{typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result, null, 2)}
						</pre>
					</details>
				))}
			</div>
		</div>
	)
}
