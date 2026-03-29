import Markdown from 'react-markdown'

interface StreamingMessageProps {
	content: string
	isStreaming?: boolean
}

export function StreamingMessage({content, isStreaming = false}: StreamingMessageProps) {
	if (!content && !isStreaming) return null

	return (
		<div style={{color: '#0f172a', fontSize: '14px', lineHeight: '1.6'}}>
			{content ? (
				<Markdown
					components={{
						p: ({children}) => <p style={{color: '#0f172a', marginBottom: '8px'}}>{children}</p>,
						strong: ({children}) => <strong style={{color: '#0f172a', fontWeight: 700}}>{children}</strong>,
						em: ({children}) => <em style={{color: '#1e293b'}}>{children}</em>,
						h1: ({children}) => <h1 style={{color: '#0f172a', fontSize: '18px', fontWeight: 700, marginTop: '16px', marginBottom: '8px'}}>{children}</h1>,
						h2: ({children}) => <h2 style={{color: '#0f172a', fontSize: '16px', fontWeight: 700, marginTop: '12px', marginBottom: '8px'}}>{children}</h2>,
						h3: ({children}) => <h3 style={{color: '#0f172a', fontSize: '14px', fontWeight: 700, marginTop: '8px', marginBottom: '4px'}}>{children}</h3>,
						ul: ({children}) => <ul style={{color: '#0f172a', marginBottom: '8px', marginLeft: '16px', listStyleType: 'disc'}}>{children}</ul>,
						ol: ({children}) => <ol style={{color: '#0f172a', marginBottom: '8px', marginLeft: '16px', listStyleType: 'decimal'}}>{children}</ol>,
						li: ({children}) => <li style={{color: '#0f172a', marginBottom: '2px'}}>{children}</li>,
						a: ({href, children}) => (
							<a href={href} style={{color: '#2563eb', textDecoration: 'underline'}} target='_blank' rel='noreferrer'>
								{children}
							</a>
						),
						code: ({className, children, ...props}) => {
							const isBlock = className?.includes('language-')
							if (isBlock) {
								return (
									<pre style={{margin: '8px 0', overflow: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', padding: '12px'}}>
										<code style={{fontSize: '12px', color: '#334155'}}>{children}</code>
									</pre>
								)
							}
							return <code style={{borderRadius: '4px', background: '#f1f5f9', padding: '1px 4px', fontSize: '12px', color: '#334155'}} {...props}>{children}</code>
						},
						pre: ({children}) => <>{children}</>,
						blockquote: ({children}) => (
							<blockquote style={{margin: '8px 0', borderLeft: '2px solid #cbd5e1', paddingLeft: '12px', color: '#475569'}}>{children}</blockquote>
						),
						hr: () => <hr style={{margin: '12px 0', border: 'none', borderTop: '1px solid #e2e8f0'}} />,
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
