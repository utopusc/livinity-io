import 'streamdown/styles.css'

import {Streamdown} from 'streamdown'
import {code} from '@streamdown/code'

interface StreamingMessageProps {
	content: string
	isStreaming?: boolean
}

export function StreamingMessage({content, isStreaming = false}: StreamingMessageProps) {
	if (!content && !isStreaming) return null

	return (
		<div className='prose prose-sm prose-invert max-w-none [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-zinc-700/50 [&_pre]:bg-zinc-900 [&_code]:text-sm'>
			{content ? (
				<Streamdown animated isAnimating={isStreaming} plugins={{code}}>
					{content}
				</Streamdown>
			) : (
				<span className='inline-block h-4 w-1 animate-pulse rounded-full bg-violet-400' />
			)}
		</div>
	)
}
