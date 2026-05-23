/**
 * Phase 198-03 Task 2 — Code Diff tool-ui primitive.
 *
 * Renders a unified diff line-by-line. Lines starting with `+` are
 * highlighted green, `-` red, `@@` cyan (hunk header). Everything else
 * is rendered as context.
 *
 * T-198-04 mitigation: ZERO raw HTML injection — each line is a
 * React text child of a <div>.
 */

import {useMemo} from 'react'

export type CodeDiffProps = {
	diff: string
	filename?: string
}

type DiffLineKind = 'add' | 'del' | 'hunk' | 'context'

function classifyLine(line: string): DiffLineKind {
	if (line.startsWith('@@')) return 'hunk'
	if (line.startsWith('+') && !line.startsWith('+++')) return 'add'
	if (line.startsWith('-') && !line.startsWith('---')) return 'del'
	return 'context'
}

const LINE_CLASSES: Record<DiffLineKind, string> = {
	add: 'bg-green-500/15 text-green-800 dark:text-green-300',
	del: 'bg-red-500/15 text-red-800 dark:text-red-300',
	hunk: 'bg-cyan-500/15 text-cyan-800 dark:text-cyan-300',
	context: 'text-muted-foreground',
}

export function CodeDiff({diff, filename}: CodeDiffProps) {
	const lines = useMemo(() => {
		return diff.split('\n').map((line, idx) => ({
			idx,
			line,
			kind: classifyLine(line),
		}))
	}, [diff])

	return (
		<div className='overflow-hidden rounded-lg border bg-card'>
			{filename && (
				<div className='border-b bg-muted/40 px-3 py-1.5 text-muted-foreground text-xs'>
					<span className='font-medium'>{filename}</span>
				</div>
			)}
			<pre className='max-h-96 overflow-auto font-mono text-xs leading-relaxed'>
				{lines.map(({idx, line, kind}) => (
					<div key={idx} className={`px-3 py-px ${LINE_CLASSES[kind]}`}>
						{line || ' '}
					</div>
				))}
			</pre>
		</div>
	)
}

export default CodeDiff
