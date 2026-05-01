/**
 * Phase 47 Plan 05 — App Health diagnostic card (FR-PROBE-01/02).
 *
 * Dual-mount component:
 *   - Section-grid context (Settings > Diagnostics): no `appId` prop →
 *     iterates `apps.list` (per-user installed apps) and renders one row
 *     per app with inline probe button.
 *   - App-detail context (`app-page/app-content.tsx`): receives `appId`
 *     prop → renders single inline status card next to install/uninstall.
 *
 * Probe is a mutation (fires on click only — never auto-polled). Per row,
 * `apps.healthProbe.useMutation()` independently tracks pending state.
 * userId is sourced from server-side ctx; client supplies appId only.
 */

import React from 'react'

import {trpcReact} from '@/trpc/trpc'

import {DiagnosticCard, type DiagnosticStatus} from './diagnostics-section'

interface ProbeResult {
	reachable: boolean
	statusCode: number | null
	ms: number | null
	lastError: string | null
	probedAt: string
}

function statusOf(r: ProbeResult | undefined): DiagnosticStatus {
	if (!r) return 'idle'
	if (r.reachable && r.statusCode && r.statusCode >= 200 && r.statusCode < 300) return 'ok'
	if (r.reachable === false && r.statusCode != null) return 'warn'
	return 'error'
}

function ProbeRow({appId, appName}: {appId: string; appName?: string}) {
	const probe = trpcReact.apps.healthProbe.useMutation()
	const r = probe.data as ProbeResult | undefined
	const rowStatus = probe.isPending ? 'loading' : statusOf(r)

	return (
		<div className='rounded-radius-sm border-border-default flex items-center justify-between gap-2 border p-2'>
			<div>
				<div className='text-body-sm font-medium'>{appName ?? appId}</div>
				{r ? (
					<div className='text-caption text-text-secondary'>
						{r.reachable
							? `${r.statusCode} OK in ${r.ms}ms`
							: `${r.lastError ?? 'unreachable'} (${r.ms ?? '-'}ms)`}
					</div>
				) : (
					<div className='text-caption text-text-secondary'>
						{rowStatus === 'loading' ? 'Probing...' : 'Not probed yet'}
					</div>
				)}
			</div>
			<button
				type='button'
				onClick={() => probe.mutate({appId})}
				disabled={probe.isPending}
				className='text-body-sm rounded-radius-sm border-border-default hover:bg-surface-default border px-2 py-1 disabled:opacity-50'
			>
				{probe.isPending ? 'Probing...' : 'Probe now'}
			</button>
		</div>
	)
}

interface AppHealthCardProps {
	appId?: string
	appName?: string
}

// Dual-mount: with appId → single inline row; without → list of all installed apps.
export function AppHealthCard({appId, appName}: AppHealthCardProps = {}) {
	// App-detail context: render a single row inline.
	if (appId) {
		return (
			<DiagnosticCard
				title='App health'
				status='idle'
				detail={<ProbeRow appId={appId} appName={appName} />}
			/>
		)
	}

	// Section-grid context: list all installed apps.
	return <SectionGridList />
}

function SectionGridList() {
	const appsQ = trpcReact.apps.list.useQuery(undefined, {
		refetchOnWindowFocus: false,
	})

	return (
		<DiagnosticCard
			title='App health'
			status='idle'
			detail={
				appsQ.isLoading ? (
					<span>Loading apps...</span>
				) : appsQ.error ? (
					<span>Failed to load apps: {appsQ.error.message}</span>
				) : (appsQ.data?.length ?? 0) === 0 ? (
					<span>No installed apps to probe.</span>
				) : (
					<div className='space-y-2'>
						{appsQ.data!.map((a) => (
							<ProbeRow
								key={a.id}
								appId={a.id}
								appName={'name' in a ? a.name : undefined}
							/>
						))}
					</div>
				)
			}
		/>
	)
}
