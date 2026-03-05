import {type ReactNode} from 'react'

export function InstructionContainer({children}: {children: ReactNode}) {
	return <div className='divide-y divide-border-subtle overflow-hidden rounded-12 bg-surface-base'>{children}</div>
}
export function InstructionItem({children}: {children: ReactNode}) {
	return (
		<div className='flex items-center justify-between gap-3 p-3 text-12 font-medium -tracking-3'>
			<span>{children}</span>
		</div>
	)
}
