import {useEffect, useRef, useState} from 'react'
import Markdown from 'react-markdown'
import {TextShimmer} from '@/components/motion-primitives/text-shimmer'

interface StreamingMessageProps {
	content: string
	isStreaming?: boolean
}

const textColor = '#0f172a'
const textStyle = {color: textColor, fontSize: '14px', lineHeight: '1.6'}

/**
 * Typewriter — gradually reveals targetText at ~60fps.
 * If data arrives faster than display, it speeds up to catch up.
 */
function TypeWriter({targetText}: {targetText: string}) {
	const [displayedLen, setDisplayedLen] = useState(0)
	const rafRef = useRef<number>(0)
	const prevTargetRef = useRef('')

	// Reset when target text is shorter (new message)
	useEffect(() => {
		if (targetText.length < prevTargetRef.current.length) {
			setDisplayedLen(0)
		}
		prevTargetRef.current = targetText
	}, [targetText])

	useEffect(() => {
		if (displayedLen >= targetText.length) return

		rafRef.current = requestAnimationFrame(() => {
			setDisplayedLen((prev) => {
				const remaining = targetText.length - prev
				// Adaptive speed: catch up if falling behind
				const speed = remaining > 200 ? Math.ceil(remaining / 8) : remaining > 50 ? 4 : remaining > 10 ? 2 : 1
				return Math.min(prev + speed, targetText.length)
			})
		})

		return () => cancelAnimationFrame(rafRef.current)
	}, [displayedLen, targetText])

	return (
		<span>
			{targetText.slice(0, displayedLen)}
			{displayedLen < targetText.length && (
				<span
					style={{
						display: 'inline-block',
						width: '2px',
						height: '14px',
						background: '#6366f1',
						marginLeft: '1px',
						verticalAlign: 'text-bottom',
						animation: 'cursor-blink 1s step-end infinite',
					}}
				/>
			)}
		</span>
	)
}

export function StreamingMessage({content, isStreaming = false}: StreamingMessageProps) {
	if (!content && !isStreaming) return null

	// While streaming: typewriter effect with blinking cursor
	if (isStreaming) {
		return (
			<div style={{...textStyle, whiteSpace: 'pre-wrap', wordBreak: 'break-word'}}>
				{content ? (
					<TypeWriter targetText={content} />
				) : (
					<TextShimmer className='text-sm' duration={1.5}>
						Thinking...
					</TextShimmer>
				)}
				<style>{`@keyframes cursor-blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }`}</style>
			</div>
		)
	}

	// After streaming: render markdown for proper formatting
	return (
		<div style={textStyle}>
			<Markdown
				components={{
					p: ({children}) => <p style={{color: textColor, marginBottom: '8px'}}>{children}</p>,
					strong: ({children}) => <strong style={{color: textColor, fontWeight: 700}}>{children}</strong>,
					em: ({children}) => <em style={{color: '#1e293b'}}>{children}</em>,
					h1: ({children}) => <h1 style={{color: textColor, fontSize: '18px', fontWeight: 700, marginTop: '16px', marginBottom: '8px'}}>{children}</h1>,
					h2: ({children}) => <h2 style={{color: textColor, fontSize: '16px', fontWeight: 700, marginTop: '12px', marginBottom: '8px'}}>{children}</h2>,
					h3: ({children}) => <h3 style={{color: textColor, fontSize: '14px', fontWeight: 700, marginTop: '8px', marginBottom: '4px'}}>{children}</h3>,
					ul: ({children}) => <ul style={{color: textColor, marginBottom: '8px', marginLeft: '16px', listStyleType: 'disc'}}>{children}</ul>,
					ol: ({children}) => <ol style={{color: textColor, marginBottom: '8px', marginLeft: '16px', listStyleType: 'decimal'}}>{children}</ol>,
					li: ({children}) => <li style={{color: textColor, marginBottom: '2px'}}>{children}</li>,
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
		</div>
	)
}
