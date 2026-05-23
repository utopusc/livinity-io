/**
 * Phase 198-03 Task 2 — Code Block tool-ui primitive.
 *
 * Plain monospace <pre><code> with language label header + copy button.
 * No syntax highlighter wired in this Wave 2 scaffold — shiki is already
 * a dep, future polish (Plan 198-06 slash command renders) can upgrade.
 *
 * T-198-04 mitigation: ZERO raw HTML injection — the code string is
 * rendered as a React text child of <code>.
 */

import {useState} from 'react'

export type CodeBlockProps = {
	code: string
	language?: string
	filename?: string
}

export function CodeBlock({code, language, filename}: CodeBlockProps) {
	const [copied, setCopied] = useState(false)

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(code)
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		} catch {
			// Clipboard unavailable (e.g. insecure context) — no-op.
		}
	}

	return (
		<div className='overflow-hidden rounded-lg border bg-card'>
			<div className='flex items-center justify-between border-b bg-muted/40 px-3 py-1.5 text-muted-foreground text-xs'>
				<div className='flex items-center gap-2'>
					{filename && <span className='font-medium'>{filename}</span>}
					{language && (
						<span className='rounded-md bg-background px-1.5 py-0.5 font-mono'>
							{language}
						</span>
					)}
				</div>
				<button
					type='button'
					onClick={handleCopy}
					className='rounded-md px-2 py-0.5 text-xs hover:bg-background'
					aria-label='Copy code'
				>
					{copied ? 'Copied!' : 'Copy'}
				</button>
			</div>
			<pre className='max-h-96 overflow-auto p-3 text-xs leading-relaxed'>
				<code>{code}</code>
			</pre>
		</div>
	)
}

export default CodeBlock
