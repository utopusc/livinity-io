// Phase 169-03 — VaultGraph side drawer (file content preview).
//
// Right-anchored 400px-wide overlay; fetches `/api/vault/file?path=<node.id>`
// on mount with credentials:'include' (same-origin cookie auth). Renders the
// raw markdown body inside a <pre> block — no markdown parser, no
// dangerouslySetInnerHTML (T-169-03-02 mitigation). Rich rendering is a
// deferred polish task (169-CONTEXT L292).

import {useEffect, useState} from 'react'

interface GraphNode {
	id: string
	label: string
	type: 'memory' | 'session' | 'inbox' | 'agent' | 'skill' | 'command' | 'root'
	size: number
	mtime: number
}

interface Props {
	node: GraphNode
	onClose: () => void
}

export function GraphNodeDetail({node, onClose}: Props) {
	const [state, setState] = useState<
		| {status: 'loading'}
		| {status: 'ok'; content: string}
		| {status: 'error'; message: string}
	>({status: 'loading'})

	useEffect(() => {
		let cancelled = false
		setState({status: 'loading'})
		fetch(`/api/vault/file?path=${encodeURIComponent(node.id)}`, {
			credentials: 'include',
		})
			.then(async (res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`)
				return (await res.json()) as {path: string; content: string}
			})
			.then((data) => {
				if (!cancelled) setState({status: 'ok', content: data.content})
			})
			.catch((err: Error) => {
				if (!cancelled) setState({status: 'error', message: err.message})
			})
		return () => {
			cancelled = true
		}
	}, [node.id])

	return (
		<aside
			role='complementary'
			aria-label='Vault file detail'
			className='absolute right-0 top-0 z-20 h-full w-[400px] overflow-hidden border-l border-border bg-bg-primary shadow-lg'
		>
			<header className='flex items-center justify-between border-b border-border px-4 py-2'>
				<h3 className='text-sm font-semibold'>{node.label}</h3>
				<button
					type='button'
					onClick={onClose}
					aria-label='Close detail'
					className='rounded px-2 py-1 text-text-secondary hover:bg-bg-secondary'
				>
					×
				</button>
			</header>
			<div className='h-[calc(100%-2.5rem)] overflow-auto p-4 text-xs'>
				{state.status === 'loading' && <div>Loading…</div>}
				{state.status === 'error' && (
					<div className='text-red-500'>Failed to load: {state.message}</div>
				)}
				{state.status === 'ok' && (
					<pre className='whitespace-pre-wrap break-words font-mono'>
						{state.content}
					</pre>
				)}
			</div>
		</aside>
	)
}
