// Phase 178-02 — VaultGraph side drawer with streamdown markdown + backlinks/outgoing.
//
// Replaces Phase 169-03 raw-text body with <Streamdown>. Adds two client-derived
// sections (Backlinks, Outgoing) computed from the GraphEdge[] passed by the
// VaultGraph caller — no new backend route required (sacred guard on
// vault-graph/routes.ts holds).
//
// Threat mitigations:
//  - T-169-03-01 Tampering: encodeURIComponent applied to node.id on file fetch.
//  - T-169-03-02 Info disclosure: Streamdown sanitizes by default (no
//    dangerouslySetInnerHTML, skipHtml defaults to false but allowedTags is
//    enforced by the library's defaultRehypePlugins).
//  - T-169-03-03 Spoofing: credentials:'include' on file fetch.

import {useEffect, useRef, useState} from 'react'
import {Streamdown} from 'streamdown'

interface GraphNode {
	id: string
	label: string
	type: 'memory' | 'session' | 'inbox' | 'agent' | 'skill' | 'command' | 'root'
	size: number
	mtime: number
}

interface GraphEdge {
	source: string
	target: string
	type: 'wikilink' | 'directory'
}

interface Props {
	node: GraphNode
	edges: GraphEdge[]
	onClose: () => void
	onNavigateTo?: (id: string) => void  // Phase 187-03: optional navigation callback
}

export function GraphNodeDetail({node, edges, onClose, onNavigateTo}: Props) {
	const [state, setState] = useState<
		| {status: 'loading'}
		| {status: 'ok'; content: string}
		| {status: 'error'; message: string}
	>({status: 'loading'})

	const bodyRef = useRef<HTMLDivElement | null>(null)

	useEffect(() => {
		let cancelled = false
		setState({status: 'loading'})
		// Scroll-on-focus — reset body scroll to top whenever the active node changes
		if (bodyRef.current) {
			bodyRef.current.scrollTop = 0
		}
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

	// Client-derived sections (edges filtered on demand — O(E) per render)
	const backlinks = edges.filter((e) => e.target === node.id)
	const outgoing = edges.filter((e) => e.source === node.id)

	return (
		<aside
			role='complementary'
			aria-label='Vault file detail'
			className='absolute right-0 top-0 z-20 h-full w-[400px] overflow-hidden border-l border-[color:var(--line-strong)] bg-[color:var(--bg)] shadow-window-soft'
		>
			<header className='flex items-center gap-2 border-b border-[color:var(--line-strong)] px-4 py-2'>
				<span
					data-testid='type-pill'
					className='font-mono text-[11px] uppercase tracking-wide text-[color:var(--fg-mute)]'
				>
					{node.type}
				</span>
				<h3 className='flex-1 text-[17px] font-semibold text-[color:var(--fg)] truncate'>
					{node.label}
				</h3>
				<button
					type='button'
					onClick={onClose}
					aria-label='Close detail'
					className='rounded px-2 py-1 text-[color:var(--fg-mute)] hover:bg-[color:var(--surface-2)]'
				>
					×
				</button>
			</header>

			<div
				ref={bodyRef}
				data-testid='detail-body'
				className='h-[calc(100%-2.5rem)] overflow-auto p-4 text-xs'
			>
				{state.status === 'loading' && <div>Loading…</div>}
				{state.status === 'error' && (
					<div className='text-red-500'>Failed to load: {state.message}</div>
				)}
				{state.status === 'ok' && (
					<Streamdown className='prose prose-sm max-w-none'>{state.content}</Streamdown>
				)}

				<section data-testid='backlinks-section' className='mt-6'>
					<h4 className='font-mono text-[11px] uppercase tracking-wide text-[color:var(--fg-mute)] mb-2'>
						Backlinks ({backlinks.length})
					</h4>
					{backlinks.length === 0 ? (
						<p className='text-[color:var(--fg-mute)]'>No backlinks</p>
					) : (
						<ul data-testid='backlinks-list'>
							{backlinks.map((e) =>
								onNavigateTo ? (
									<button
										key={`bl-${e.source}`}
										type='button'
										data-testid={`nav-link-${e.source}`}
										onClick={() => onNavigateTo(e.source)}
										className='block w-full text-left text-[color:var(--fg-dim)] hover:text-[color:var(--fg)] transition-colors truncate px-1 py-0.5 rounded hover:bg-[color:var(--bg-2)]'
									>
										{e.source}
									</button>
								) : (
									<li key={`bl-${e.source}`} className='text-[color:var(--fg-dim)]'>
										{e.source}
									</li>
								),
							)}
						</ul>
					)}
				</section>

				<section data-testid='outgoing-section' className='mt-6'>
					<h4 className='font-mono text-[11px] uppercase tracking-wide text-[color:var(--fg-mute)] mb-2'>
						Outgoing ({outgoing.length})
					</h4>
					{outgoing.length === 0 ? (
						<p className='text-[color:var(--fg-mute)]'>No outgoing links</p>
					) : (
						<ul data-testid='outgoing-list'>
							{outgoing.map((e) =>
								onNavigateTo ? (
									<button
										key={`out-${e.target}-${e.type}`}
										type='button'
										data-testid={`nav-link-${e.target}`}
										onClick={() => onNavigateTo(e.target)}
										className='block w-full text-left text-[color:var(--fg-dim)] hover:text-[color:var(--fg)] transition-colors truncate px-1 py-0.5 rounded hover:bg-[color:var(--bg-2)]'
									>
										{e.target} ({e.type})
									</button>
								) : (
									<li key={`out-${e.target}-${e.type}`} className='text-[color:var(--fg-dim)]'>
										{e.target} ({e.type})
									</li>
								),
							)}
						</ul>
					)}
				</section>
			</div>
		</aside>
	)
}
