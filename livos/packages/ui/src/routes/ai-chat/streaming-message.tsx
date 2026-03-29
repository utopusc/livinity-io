import Markdown from 'react-markdown'

interface StreamingMessageProps {
	content: string
	isStreaming?: boolean
}

export function StreamingMessage({content, isStreaming = false}: StreamingMessageProps) {
	if (!content && !isStreaming) return null

	return (
		<div className='text-sm leading-relaxed text-gray-900 dark:text-gray-100'>
			{content ? (
				<Markdown
					components={{
						p: ({children}) => <p className='mb-2 last:mb-0'>{children}</p>,
						strong: ({children}) => <strong className='font-bold'>{children}</strong>,
						em: ({children}) => <em className='italic'>{children}</em>,
						h1: ({children}) => <h1 className='mb-2 mt-4 text-lg font-bold'>{children}</h1>,
						h2: ({children}) => <h2 className='mb-2 mt-3 text-base font-bold'>{children}</h2>,
						h3: ({children}) => <h3 className='mb-1 mt-2 text-sm font-bold'>{children}</h3>,
						ul: ({children}) => <ul className='mb-2 ml-4 list-disc'>{children}</ul>,
						ol: ({children}) => <ol className='mb-2 ml-4 list-decimal'>{children}</ol>,
						li: ({children}) => <li className='mb-0.5'>{children}</li>,
						a: ({href, children}) => (
							<a href={href} className='text-blue-600 underline hover:text-blue-500' target='_blank' rel='noreferrer'>
								{children}
							</a>
						),
						code: ({className, children, ...props}) => {
							const isBlock = className?.includes('language-')
							if (isBlock) {
								return (
									<pre className='my-2 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800'>
										<code className='text-xs text-gray-800 dark:text-green-300'>{children}</code>
									</pre>
								)
							}
							return <code className='rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-800 dark:bg-gray-700 dark:text-gray-200' {...props}>{children}</code>
						},
						pre: ({children}) => <>{children}</>,
						blockquote: ({children}) => (
							<blockquote className='my-2 border-l-2 border-gray-300 pl-3 text-gray-600 dark:border-gray-600 dark:text-gray-400'>{children}</blockquote>
						),
						hr: () => <hr className='my-3 border-gray-200 dark:border-gray-700' />,
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
