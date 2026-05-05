/**
 * LivConversationSearch — Phase 75-06 / CONTEXT D-26..D-28.
 *
 * Sidebar search input for cross-conversation full-text search. Wires up the
 * P75-01 FTS data layer through the P75-06 backend route to the user-facing
 * sidebar. Plan 75-07 mounts this into the sessions sidebar — this file
 * delivers the standalone primitive (independently demoable today via a
 * one-off mount in Storybook or a route).
 *
 * Behaviour:
 *   - 300ms debounce on every keystroke (MEM-06).
 *   - AbortController cancels the in-flight request on each new keystroke
 *     and on unmount (T-75-06-04 DoS mitigation: the backend never sees the
 *     stale fetch).
 *   - JWT pulled from `localStorage[JWT_LOCAL_STORAGE_KEY]` per the
 *     P67-04 STATE convention (mirrors `useLivAgentStream`).
 *   - q.trim().length < 2 short-circuits: no fetch, idle UI.
 *   - Renders snippets via <HighlightedText> — NEVER uses
 *     `dangerously-set-inner-html` (CONTEXT D-27 / T-75-06-03).
 *
 * No external dep on a useDebounce hook (none exists in
 * livos/packages/ui/src/hooks/ as of P75-06; inline setTimeout pattern
 * keeps the surface explicit and matches the skeleton in the plan's
 * <interfaces> block).
 */
import {useEffect, useRef, useState} from 'react'

import {IconSearch, IconX} from '@tabler/icons-react'

import {HighlightedText} from '@/components/highlighted-text'
import {JWT_LOCAL_STORAGE_KEY} from '@/modules/auth/shared'

export interface LivConversationSearchProps {
	/** Invoked when the user clicks a search-result row. */
	onSelectMessage?: (messageId: string, conversationId: string) => void
	className?: string
}

export interface SearchResult {
	messageId: string
	conversationId: string
	conversationTitle: string | null
	role: 'user' | 'assistant' | 'system' | 'tool'
	snippet: string // contains literal <mark>...</mark> from ts_headline
	createdAt: string // ISO
	rank: number
}

/** 300ms debounce per CONTEXT D-26 / MEM-06. */
const DEBOUNCE_MS = 300

export function LivConversationSearch({
	onSelectMessage,
	className,
}: LivConversationSearchProps) {
	const [q, setQ] = useState('')
	// `null` = idle (not searched yet); `[]` = no results; `[...]` = hits.
	const [results, setResults] = useState<SearchResult[] | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const abortRef = useRef<AbortController | null>(null)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		// Clear any pending debounce + cancel any in-flight fetch on each
		// keystroke (and on unmount via the cleanup below).
		if (timerRef.current) clearTimeout(timerRef.current)
		if (abortRef.current) abortRef.current.abort()

		const trimmed = q.trim()
		if (trimmed.length < 2) {
			setResults(null)
			setLoading(false)
			setError(null)
			return
		}

		timerRef.current = setTimeout(async () => {
			setLoading(true)
			setError(null)
			const ac = new AbortController()
			abortRef.current = ac
			try {
				const jwt =
					typeof window !== 'undefined'
						? (window.localStorage.getItem(JWT_LOCAL_STORAGE_KEY) ?? '')
						: ''
				const res = await fetch(
					`/api/conversations/search?q=${encodeURIComponent(trimmed)}`,
					{
						headers: {Authorization: `Bearer ${jwt}`},
						signal: ac.signal,
					},
				)
				if (!res.ok) throw new Error(`search failed: ${res.status}`)
				const json = (await res.json()) as {results: SearchResult[]}
				if (!ac.signal.aborted) setResults(json.results ?? [])
			} catch (e) {
				const err = e as {name?: string; message?: string}
				if (err.name !== 'AbortError') {
					setError(err.message ?? 'search failed')
				}
			} finally {
				if (!ac.signal.aborted) setLoading(false)
			}
		}, DEBOUNCE_MS)

		return () => {
			if (timerRef.current) clearTimeout(timerRef.current)
			if (abortRef.current) abortRef.current.abort()
		}
	}, [q])

	return (
		<div className={`relative ${className ?? ''}`}>
			<div className="relative">
				<IconSearch
					size={14}
					className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
				/>
				<input
					type="search"
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder="Search conversations…"
					aria-label="Search conversations"
					className="w-full pl-7 pr-7 py-1.5 text-sm rounded bg-slate-900/50 border border-[var(--liv-border-subtle)] text-slate-100 placeholder:text-slate-500"
				/>
				{q && (
					<button
						type="button"
						aria-label="Clear search"
						onClick={() => setQ('')}
						className="absolute right-2 top-1/2 -translate-y-1/2"
					>
						<IconX
							size={12}
							className="text-slate-400 hover:text-slate-200"
						/>
					</button>
				)}
			</div>
			{loading && (
				<div className="mt-2 text-xs text-slate-500">Searching…</div>
			)}
			{error && (
				<div className="mt-2 text-xs text-rose-400">{error}</div>
			)}
			{results !== null && results.length === 0 && !loading && !error && (
				<div className="mt-2 text-xs text-slate-500">
					No matches for "{q}"
				</div>
			)}
			{results !== null && results.length > 0 && (
				<ul className="mt-2 space-y-1 max-h-96 overflow-y-auto">
					{results.map((r) => (
						<li key={r.messageId}>
							<button
								type="button"
								onClick={() =>
									onSelectMessage?.(r.messageId, r.conversationId)
								}
								className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-800/50 text-xs"
							>
								<div className="text-slate-200 line-clamp-2">
									<HighlightedText html={r.snippet} />
								</div>
								<div className="text-[10px] text-slate-500 mt-0.5">
									{r.conversationTitle ?? 'Untitled'} · {r.role} ·{' '}
									{new Date(r.createdAt).toLocaleDateString()}
								</div>
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}
