/**
 * Phase 47 Plan 05 — Model Identity diagnostic card (FR-MODEL-01).
 *
 * Renders verdict + 6-step diagnostic results from
 * `capabilities.modelIdentityDiagnose`. NO action button beyond Re-diagnose
 * — per CONTEXT.md, remediation (re-running update.sh on Mini PC, or
 * deploying a Branch B sacred-file fix) is the operator's responsibility.
 *
 * Manual-trigger (`enabled: false`): the diagnostic spawns processes,
 * snapshots /proc/<pid>/environ, and reads /opt/livos/... — too expensive
 * for auto-poll. Operator clicks Diagnose explicitly.
 *
 * Verdict bucket → status mapping:
 *   clean              → ok    (no drift, no confabulation)
 *   dist-drift         → warn  (multiple .pnpm dirs; re-run update.sh)
 *   source-confabulation → warn  (deploy Phase 47 Branch B fix)
 *   both               → warn  (do both)
 *   inconclusive       → error (diagnostic itself failed)
 */

import React, {useState} from 'react'

import {trpcReact} from '@/trpc/trpc'

import {DiagnosticCard, type DiagnosticStatus} from './diagnostics-section'

export function ModelIdentityCard() {
	const [expanded, setExpanded] = useState(false)
	const q = trpcReact.capabilities.modelIdentityDiagnose.useQuery(undefined, {
		enabled: false, // manual trigger only — diagnostic is expensive
		refetchOnWindowFocus: false,
	})

	const verdict = q.data?.verdict
	const status: DiagnosticStatus = q.isFetching
		? 'loading'
		: q.error
			? 'error'
			: verdict === 'clean'
				? 'ok'
				: verdict === 'dist-drift' ||
					  verdict === 'source-confabulation' ||
					  verdict === 'both'
					? 'warn'
					: verdict === 'inconclusive'
						? 'error'
						: 'idle'

	return (
		<DiagnosticCard
			title='Model Identity'
			status={status}
			detail={
				!q.data && !q.isFetching && !q.error ? (
					<span>Click Diagnose to run the 6-step on-Mini-PC diagnostic.</span>
				) : q.isFetching ? (
					<span>Running 6-step diagnostic...</span>
				) : q.error ? (
					<span>Failed: {q.error.message}</span>
				) : (
					<div className='space-y-1'>
						<div>
							Verdict: <span className='font-mono uppercase'>{verdict}</span>
						</div>
						<button
							type='button'
							onClick={() => setExpanded((e) => !e)}
							className='text-caption underline'
						>
							{expanded ? 'Hide' : 'Show'} 6 step results
						</button>
						{expanded && q.data && (
							<pre className='text-caption rounded-radius-sm bg-surface-default mt-2 max-h-64 overflow-auto p-2'>
								{JSON.stringify(q.data.steps, null, 2)}
							</pre>
						)}
						{(verdict === 'dist-drift' || verdict === 'both') && (
							<div className='text-caption mt-2 text-amber-300'>
								Recommended: re-run /opt/livos/update.sh on the Mini PC.
							</div>
						)}
						{(verdict === 'source-confabulation' || verdict === 'both') && (
							<div className='text-caption mt-2 text-amber-300'>
								Recommended: deploy nexus/core with Phase 47 Branch B systemPrompt fix.
							</div>
						)}
					</div>
				)
			}
			action={{
				label: q.data ? 'Re-diagnose' : 'Diagnose',
				loading: q.isFetching,
				onClick: () => {
					q.refetch()
				},
			}}
		/>
	)
}
