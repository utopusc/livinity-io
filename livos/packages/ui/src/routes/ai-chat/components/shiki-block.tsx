/**
 * ShikiBlock — Phase 75-05. Lazy-loaded Shiki syntax highlighter (theme github-dark).
 * COMPOSER-06 (deferred from P70).
 *
 * Pattern: dynamic import('shiki') on first render, with the highlighter cached as
 * a module-level singleton promise so subsequent mounts skip re-init. Initial render
 * shows a plain <pre><code> fallback so the user sees text immediately rather than
 * an empty box; the highlighted HTML replaces it once the highlighter resolves.
 *
 * Threat model (T-75-05-01): the only `dangerouslySetInnerHTML` usage in this
 * component is the single audited spot below — Shiki's `codeToHtml()` output is
 * HTML-escape-safe by library guarantee.
 *
 * Theme: 'github-dark'. Languages: see SHIKI_LANGS (CONTEXT D-23). Unknown langs
 * fall back to 'text' (no highlighting).
 *
 * NOT YET wired into the markdown render path — plan 75-07 wires both this and
 * MermaidBlock into `liv-streaming-text.tsx`.
 */

import {useEffect, useState} from 'react'
import {IconCheck, IconCopy} from '@tabler/icons-react'

// ── Module-singleton highlighter promise ─────────────────────────────────────

let highlighterPromise: Promise<any> | null = null

export const SHIKI_LANGS = [
	'ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'sh', 'bash',
	'json', 'yaml', 'sql', 'md', 'html', 'css', 'dockerfile', 'diff',
] as const

export type SupportedLang = (typeof SHIKI_LANGS)[number]

/**
 * Pure helper — extractable for unit testing without mounting the component.
 * Returns true if `lang` is one of the SHIKI_LANGS values, false otherwise.
 */
export function isSupportedLang(lang: string): lang is SupportedLang {
	return (SHIKI_LANGS as readonly string[]).includes(lang)
}

/**
 * Pure helper — picks a safe lang for Shiki. Falls back to 'text' for unknown
 * langs so the highlighter still produces a styled <pre> instead of throwing.
 */
export function resolveShikiLang(lang: string): string {
	return isSupportedLang(lang) ? lang : 'text'
}

async function getOrCreateHighlighter(): Promise<any> {
	if (!highlighterPromise) {
		highlighterPromise = import('shiki').then(({getHighlighter}) =>
			getHighlighter({themes: ['github-dark'], langs: SHIKI_LANGS as unknown as string[]})
		)
	}
	return highlighterPromise
}

// ── Component ────────────────────────────────────────────────────────────────

export interface ShikiBlockProps {
	lang: string
	source: string
	className?: string
}

export function ShikiBlock({lang, source, className}: ShikiBlockProps) {
	const [html, setHtml] = useState<string | null>(null)
	const [copied, setCopied] = useState(false)
	const safeLang = resolveShikiLang(lang)

	useEffect(() => {
		let cancelled = false
		getOrCreateHighlighter()
			.then((h: any) => {
				if (cancelled) return
				try {
					const result = h.codeToHtml(source, {lang: safeLang, theme: 'github-dark'})
					if (!cancelled) setHtml(result)
				} catch {
					// Highlight failed (unknown lang at runtime, etc.) — fall back to <pre>.
					if (!cancelled) setHtml(null)
				}
			})
			.catch(() => {
				if (!cancelled) setHtml(null)
			})
		return () => {
			cancelled = true
		}
	}, [source, safeLang])

	const onCopy = async () => {
		try {
			await navigator.clipboard.writeText(source)
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		} catch {
			// Clipboard API denied / unavailable. Silent — don't surface a toast for
			// a deliberate browser denial.
		}
	}

	return (
		<div className={`relative group ${className ?? ''}`}>
			{html ? (
				// AUDITED: dangerouslySetInnerHTML — this is the SINGLE audited use site
				// for Shiki's `codeToHtml()` output (HTML-escape-safe per library
				// guarantee, T-75-05-01 mitigation).
				<div
					className='rounded-md overflow-x-auto text-sm [&>pre]:p-4 [&>pre]:m-0'
					dangerouslySetInnerHTML={{__html: html}}
				/>
			) : (
				<pre className='rounded-md bg-slate-900 p-4 overflow-x-auto text-sm'>
					<code>{source}</code>
				</pre>
			)}
			<button
				type='button'
				aria-label='Copy code'
				onClick={onCopy}
				className='absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-slate-800/80 hover:bg-slate-700'
			>
				{copied ? (
					<IconCheck size={14} className='text-emerald-400' />
				) : (
					<IconCopy size={14} />
				)}
			</button>
		</div>
	)
}
