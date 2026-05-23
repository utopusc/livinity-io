/**
 * Phase 198-03 Task 2 — Tool Fallback tool-ui primitive.
 *
 * Default UI shown when no makeAssistantToolUI registration matches the
 * tool name. Renders a collapsible card with the tool name + result JSON.
 *
 * T-198-04 mitigation: ZERO raw HTML injection — JSON.stringify into
 * a <pre> text node.
 */

import {useState} from 'react'

export type ToolFallbackProps = {
	toolName: string
	args?: unknown
	result?: unknown
	isError?: boolean
}

function safeStringify(value: unknown): string {
	if (value === undefined) return ''
	try {
		return JSON.stringify(value, null, 2)
	} catch {
		return String(value)
	}
}

export function ToolFallback({toolName, args, result, isError}: ToolFallbackProps) {
	const [open, setOpen] = useState(false)

	return (
		<div
			className={`overflow-hidden rounded-lg border ${
				isError ? 'border-red-500/40 bg-red-500/5' : 'bg-card'
			}`}
		>
			<button
				type='button'
				onClick={() => setOpen((o) => !o)}
				className='flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40'
				aria-expanded={open}
			>
				<div className='flex items-center gap-2'>
					<span className='rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs'>
						{toolName}
					</span>
					{isError && (
						<span className='font-medium text-red-600 text-xs'>error</span>
					)}
				</div>
				<span className='text-muted-foreground text-xs'>{open ? '−' : '+'}</span>
			</button>
			{open && (
				<div className='space-y-2 border-t p-3 text-xs'>
					{args !== undefined && (
						<div>
							<div className='mb-1 font-medium text-muted-foreground'>args</div>
							<pre className='max-h-48 overflow-auto rounded-md bg-muted/40 p-2'>
								{safeStringify(args)}
							</pre>
						</div>
					)}
					{result !== undefined && (
						<div>
							<div className='mb-1 font-medium text-muted-foreground'>result</div>
							<pre className='max-h-48 overflow-auto rounded-md bg-muted/40 p-2'>
								{safeStringify(result)}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	)
}

export default ToolFallback
