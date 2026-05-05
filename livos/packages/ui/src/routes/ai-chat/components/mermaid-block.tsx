/**
 * MermaidBlock — Phase 75-05. CDN-loaded mermaid (idempotent script injection).
 * Fallback to plain <pre> on load/render error. COMPOSER-06.
 *
 * Pattern: a one-time `<script>` tag injection of the existing CDN URL — the
 * SAME URL already used by `canvas-iframe.tsx:22`, so the two paths converge
 * on a single `window.mermaid` global instead of dueling versions. Guards via
 * `if (window.mermaid)` and a module-level singleton `mermaidScriptPromise`
 * so concurrent component mounts share one fetch.
 *
 * Mermaid 10's default `securityLevel: 'strict'` sanitizes user input, so LLM-
 * supplied diagram source is treated at the same trust level as the rest of
 * LLM-supplied markdown text (T-75-05-02 disposition: accept-with-mitigation).
 *
 * No npm dep added — CDN-only matches CONTEXT D-25's "shiki is the SOLE Phase
 * 75 D-NO-NEW-DEPS exception" rule. Existing canvas-iframe.tsx mermaid usage
 * is untouched.
 *
 * NOT YET wired into the markdown render path — plan 75-07 handles wire-up.
 */

import {useEffect, useRef, useState} from 'react'

// ── CDN config ───────────────────────────────────────────────────────────────

export const MERMAID_CDN =
	'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js'

let mermaidScriptPromise: Promise<void> | null = null

// ── Helpers (extractable / testable) ─────────────────────────────────────────

/**
 * Pure helper — generates a unique DOM id with the `liv-mermaid-` prefix.
 * Used as the render id for mermaid 10's `render(id, source)` API.
 */
export function generateMermaidId(): string {
	return `liv-mermaid-${Math.random().toString(36).slice(2)}`
}

/**
 * Loads mermaid from the CDN exactly once across the lifetime of the page.
 *
 * - Returns immediately resolved if `window.mermaid` is already defined (e.g.
 *   canvas-iframe.tsx loaded it first inside its iframe — but note: that runs
 *   in an iframe, so it does NOT pollute the parent window. The guard still
 *   matters for repeat MermaidBlock mounts).
 * - Returns the in-flight promise if a load is already pending.
 * - Otherwise injects a `<script>` tag, attaches load/error handlers, and
 *   initializes mermaid with `{startOnLoad: false, theme: 'dark'}`.
 */
export function loadMermaid(): Promise<void> {
	if (typeof window === 'undefined') return Promise.resolve()
	if ((window as any).mermaid) return Promise.resolve()
	if (mermaidScriptPromise) return mermaidScriptPromise

	mermaidScriptPromise = new Promise<void>((resolve, reject) => {
		const existing = document.querySelector(
			`script[src="${MERMAID_CDN}"]`,
		) as HTMLScriptElement | null
		if (existing) {
			existing.addEventListener('load', () => resolve(), {once: true})
			existing.addEventListener(
				'error',
				() => reject(new Error('mermaid load failed')),
				{once: true},
			)
			return
		}
		const s = document.createElement('script')
		s.src = MERMAID_CDN
		s.async = true
		s.addEventListener(
			'load',
			() => {
				try {
					const m = (window as any).mermaid
					if (m && typeof m.initialize === 'function') {
						m.initialize({startOnLoad: false, theme: 'dark'})
					}
					resolve()
				} catch (e) {
					reject(e as Error)
				}
			},
			{once: true},
		)
		s.addEventListener(
			'error',
			() => reject(new Error('mermaid load failed')),
			{once: true},
		)
		document.head.appendChild(s)
	})
	return mermaidScriptPromise
}

// ── Component ────────────────────────────────────────────────────────────────

export interface MermaidBlockProps {
	source: string
	className?: string
}

export function MermaidBlock({source, className}: MermaidBlockProps) {
	const ref = useRef<HTMLDivElement>(null)
	const [error, setError] = useState<string | null>(null)
	const idRef = useRef(generateMermaidId())

	useEffect(() => {
		let cancelled = false
		setError(null)
		loadMermaid()
			.then(async () => {
				if (cancelled || !ref.current) return
				const m = (window as any).mermaid
				if (!m || typeof m.render !== 'function') {
					if (!cancelled) setError('mermaid not available')
					return
				}
				try {
					const result = await m.render(idRef.current, source)
					// mermaid 10 returns `{svg, bindFunctions?}`. Older versions
					// returned a raw string — handle both shapes.
					const svg =
						typeof result === 'string' ? result : (result && result.svg) || ''
					if (!cancelled && ref.current && svg) {
						ref.current.innerHTML = svg
					}
				} catch (e) {
					if (!cancelled) {
						setError((e as Error)?.message ?? 'render failed')
					}
				}
			})
			.catch((e: Error) => {
				if (!cancelled) setError(e.message ?? 'load failed')
			})
		return () => {
			cancelled = true
		}
	}, [source])

	if (error) {
		return (
			<pre
				title={`Mermaid render failed: ${error}`}
				className={`rounded-md bg-slate-900 p-4 border border-rose-500/40 ${className ?? ''}`}
			>
				<code>{source}</code>
			</pre>
		)
	}
	return (
		<div ref={ref} className={`my-2 ${className ?? ''}`}>
			<pre>
				<code>{source}</code>
			</pre>
		</div>
	)
}
