/**
 * Phase 62 Plan 62-04 — ApiKeysSection (FR-BROKER-E2-01).
 *
 * Top-level section in Settings > AI Configuration. Renders as a flat
 * sibling block above <UsageSection /> per RESEARCH.md §Pitfall 4
 * (no Tabs wrapper — preserves the existing <h2> per-section style).
 *
 * Composition:
 *   - Header: <h2>API Keys</h2> + "Create Key" button (top-right)
 *   - Body:
 *       - Loading: spinner + "Loading API keys…"
 *       - Error:   italic "API keys unavailable."
 *       - Empty:   copy "No API keys yet. Create one to start authenticating with Bearer tokens."
 *       - List:    table sorted newest-first by created_at
 *   - Per row: Name | Prefix | Created | Last used | Actions
 *       - revoked rows: faded (opacity-60) + "(revoked)" badge + Revoke disabled
 *       - active rows: Revoke button opens <ApiKeysRevokeModal>
 *
 * State:
 *   - createOpen: boolean — controls <ApiKeysCreateModal> visibility
 *   - revokeTarget: {id, name} | null — controls <ApiKeysRevokeModal>
 *
 * Phase 59 contract: trpcReact.apiKeys.list returns rows with snake_case
 * field names (id, key_prefix, name, created_at, last_used_at,
 * revoked_at) — verified against api-keys/routes.ts list resolver.
 */

import {useState} from 'react'
import {TbKey, TbLoader2, TbPlus} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {trpcReact} from '@/trpc/trpc'

import {ApiKeysCreateModal} from './api-keys-create-modal'
import {ApiKeysRevokeModal} from './api-keys-revoke-modal'

interface KeyRow {
	id: string
	key_prefix: string
	name: string
	created_at: Date | string
	last_used_at: Date | string | null
	revoked_at: Date | string | null
}

function formatDate(d: Date | string | null): string {
	if (!d) return '—'
	const date = typeof d === 'string' ? new Date(d) : d
	if (isNaN(date.getTime())) return '—'
	return date.toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'})
}

export function ApiKeysSection() {
	const [createOpen, setCreateOpen] = useState(false)
	const [revokeTarget, setRevokeTarget] = useState<{id: string; name: string} | null>(null)

	const listQ = trpcReact.apiKeys.list.useQuery(undefined, {
		// Modest poll so last_used_at refreshes without manual reload.
		refetchInterval: 60_000,
	})

	const renderHeader = (children?: React.ReactNode) => (
		<div className='flex items-center justify-between'>
			<h2 className='text-body font-semibold flex items-center gap-2'>
				<TbKey className='size-4' /> API Keys
			</h2>
			{children}
		</div>
	)

	if (listQ.isLoading) {
		return (
			<div className='space-y-4'>
				{renderHeader()}
				<div className='flex items-center gap-2 text-body-sm text-text-secondary'>
					<TbLoader2 className='size-4 animate-spin' /> Loading API keys…
				</div>
			</div>
		)
	}

	if (listQ.isError || !listQ.data) {
		return (
			<div className='space-y-4'>
				{renderHeader()}
				<div className='text-body-sm text-text-secondary italic'>API keys unavailable.</div>
			</div>
		)
	}

	const rows = ([...listQ.data] as KeyRow[]).sort((a, b) => {
		const ta = new Date(a.created_at).getTime()
		const tb = new Date(b.created_at).getTime()
		return tb - ta
	})

	return (
		<div className='space-y-4'>
			{renderHeader(
				<Button size='sm' onClick={() => setCreateOpen(true)}>
					<TbPlus className='mr-1 h-4 w-4' /> Create Key
				</Button>,
			)}

			{rows.length === 0 ? (
				<div className='rounded-radius-md border border-border-default bg-surface-base p-4 text-body-sm text-text-secondary'>
					No API keys yet. Create one to start authenticating with Bearer tokens.
				</div>
			) : (
				<div className='rounded-radius-md border border-border-default bg-surface-base overflow-hidden'>
					<table className='w-full text-body-sm'>
						<thead className='bg-surface-raised text-caption text-text-secondary'>
							<tr>
								<th className='px-3 py-2 text-left font-medium'>Name</th>
								<th className='px-3 py-2 text-left font-medium'>Prefix</th>
								<th className='px-3 py-2 text-left font-medium'>Created</th>
								<th className='px-3 py-2 text-left font-medium'>Last used</th>
								<th className='px-3 py-2 text-right font-medium'>Actions</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => {
								const isRevoked = row.revoked_at !== null
								return (
									<tr
										key={row.id}
										className={`border-t border-border-default ${
											isRevoked ? 'opacity-60' : ''
										}`}
									>
										<td className='px-3 py-2 text-text-primary'>
											{row.name}
											{isRevoked && (
												<span className='ml-2 text-caption text-text-secondary'>
													(revoked)
												</span>
											)}
										</td>
										<td className='px-3 py-2 font-mono text-caption text-text-secondary'>
											{row.key_prefix}
										</td>
										<td className='px-3 py-2 text-text-secondary'>
											{formatDate(row.created_at)}
										</td>
										<td className='px-3 py-2 text-text-secondary'>
											{formatDate(row.last_used_at)}
										</td>
										<td className='px-3 py-2 text-right'>
											<Button
												variant='secondary'
												size='sm'
												disabled={isRevoked}
												onClick={() =>
													setRevokeTarget({id: row.id, name: row.name})
												}
											>
												Revoke
											</Button>
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
			)}

			<ApiKeysCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />

			{revokeTarget && (
				<ApiKeysRevokeModal
					open={true}
					onClose={() => setRevokeTarget(null)}
					keyId={revokeTarget.id}
					keyName={revokeTarget.name}
				/>
			)}
		</div>
	)
}
