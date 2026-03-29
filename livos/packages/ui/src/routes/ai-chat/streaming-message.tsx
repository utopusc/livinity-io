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
		<div className='prose prose-sm prose-invert max-w-none !text-white/90 [&_*]:!text-white/90 [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border-default [&_pre]:!bg-surface-1 [&_code]:text-sm [&_code]:!text-blue-300 [&_a]:!text-brand [&_strong]:!text-white [&_h1]:!text-white [&_h2]:!text-white [&_h3]:!text-white [&_h4]:!text-white [&_li]:!text-white/90 [&_p]:!text-white/90 [&_li_strong]:!text-white'>
			{content ? (
				<Streamdown animated={false} plugins={{code}}>
					{content}
				</Streamdown>
			) : (
				<span className='inline-block h-4 w-1 animate-pulse rounded-full bg-brand' />
			)}
		</div>
	)
}
