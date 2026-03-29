import Markdown from 'react-markdown'

interface StreamingMessageProps {
	content: string
	isStreaming?: boolean
}

export function StreamingMessage({content, isStreaming = false}: StreamingMessageProps) {
	if (!content && !isStreaming) return null

	return (
		<div className='text-sm leading-relaxed text-white'>
			{content ? (
				<Markdown
					components={{
						p: ({children}) => <p className='mb-2 last:mb-0 text-white'>{children}</p>,
						strong: ({children}) => <strong className='font-bold text-white'>{children}</strong>,
						em: ({children}) => <em className='italic text-white/80'>{children}</em>,
						h1: ({children}) => <h1 className='mb-2 mt-4 text-lg font-bold text-white'>{children}</h1>,
						h2: ({children}) => <h2 className='mb-2 mt-3 text-base font-bold text-white'>{children}</h2>,
						h3: ({children}) => <h3 className='mb-1 mt-2 text-sm font-bold text-white'>{children}</h3>,
						ul: ({children}) => <ul className='mb-2 ml-4 list-disc text-white'>{children}</ul>,
						ol: ({children}) => <ol className='mb-2 ml-4 list-decimal text-white'>{children}</ol>,
						li: ({children}) => <li className='mb-0.5 text-white'>{children}</li>,
						a: ({href, children}) => (
							<a href={href} className='text-blue-400 underline hover:text-blue-300' target='_blank' rel='noreferrer'>
								{children}
							</a>
						),
						code: ({className, children, ...props}) => {
							const isBlock = className?.includes('language-')
							if (isBlock) {
								return (
									<pre className='my-2 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3'>
										<code className='text-xs text-green-300'>{children}</code>
									</pre>
								)
							}
							return <code className='rounded bg-white/10 px-1 py-0.5 text-xs text-blue-300' {...props}>{children}</code>
						},
						pre: ({children}) => <>{children}</>,
						blockquote: ({children}) => (
							<blockquote className='my-2 border-l-2 border-white/20 pl-3 text-white/70'>{children}</blockquote>
						),
						hr: () => <hr className='my-3 border-white/10' />,
					}}
				>
					{content}
				</Markdown>
			) : (
				<span className='inline-block h-4 w-1 animate-pulse rounded-full bg-brand' />
			)}
		</div>
	)
}
