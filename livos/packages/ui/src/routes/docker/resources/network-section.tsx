// Phase 26 Plan 26-02 (DOC-10 + DOC-20 partial) — Docker Networks section.
// Replaces the Phase 24 placeholder. Body extracted from
// routes/server-control/index.tsx NetworksTab() (lines 2439-2672) with:
//   1. Search input (NEW — filters by name + driver).
//   2. Network inspect deep-link via useDockerResource.selectedNetwork —
//      external surfaces can call setSelectedNetwork(id) to open the
//      inspect card. The store-to-hook bridge is a single useEffect that
//      calls inspectNetwork(selected) when selected changes; useNetworks
//      stays unchanged (its internal inspectedNetwork state is now driven
//      by the store via the bridge effect).
//   3. Wrapped in flex h-full overflow-y-auto p-4 sm:p-6.

import {useEffect, useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {
	IconLink,
	IconNetwork,
	IconPlus,
	IconRefresh,
	IconSearch,
	IconTrash,
	IconUnlink,
	IconX,
} from '@tabler/icons-react'
import {toast} from 'sonner'

import {useNetworks} from '@/hooks/use-networks'
import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/shadcn-components/ui/table'
import {cn} from '@/shadcn-lib/utils'

import {copyDeepLinkToClipboard} from '../deep-link'
import {useDockerResource, useSelectedNetwork} from '../resource-store'
import {ActionButton} from './action-button'
import {filterByQuery} from './filter-rows'
import {CreateNetworkDialog, RemoveNetworkDialog} from './network-dialogs'

export function NetworkSection() {
	const {
		networks,
		isLoading,
		isError,
		error,
		isFetching,
		refetch,
		inspectNetwork,
		clearInspect,
		inspectedNetworkData,
		isInspecting,
		totalCount,
		createNetwork,
		isCreatingNetwork,
		removeNetwork,
		isRemovingNetwork,
		disconnectNetwork,
		isDisconnecting,
		actionResult,
	} = useNetworks()

	const selectedNetwork = useSelectedNetwork()
	const setSelectedNetwork = useDockerResource((s) => s.setSelectedNetwork)

	const [searchQuery, setSearchQuery] = useState('')
	const [showCreateDialog, setShowCreateDialog] = useState(false)
	const [removeTarget, setRemoveTarget] = useState<string | null>(null)

	// Bridge effect: store-driven selection drives the underlying
	// inspectNetwork hook. When selectedNetwork changes (either from a
	// user click on the inspect icon, OR from external code calling
	// setSelectedNetwork), fire inspectNetwork(selected) which runs the
	// tRPC inspect query inside useNetworks. When selectedNetwork is
	// null, call clearInspect.
	//
	// Intentionally exclude inspectNetwork/clearInspect from deps —
	// they are recreated on every render of useNetworks (closures over
	// fresh setInspectedNetwork callbacks), and including them would
	// cause an infinite loop. The hook's internal inspectedNetwork
	// useState setter is identity-stable, so calling inspectNetwork(id)
	// when id is unchanged is a no-op (T-26-07 mitigation).
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => {
		if (selectedNetwork) inspectNetwork(selectedNetwork)
		else clearInspect()
	}, [selectedNetwork])

	const filteredNetworks = filterByQuery(networks, searchQuery, (n) => `${n.name} ${n.driver}`)
	const isFiltered = searchQuery.trim().length > 0
	const noFilterResults = isFiltered && filteredNetworks.length === 0 && networks.length > 0

	return (
		<div className='flex h-full flex-col overflow-y-auto p-4 sm:p-6'>
			{/* Search + summary + Create + Refresh row */}
			<div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
				<div className='relative w-full max-w-xs'>
					<IconSearch size={14} className='absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary' />
					<Input
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder='Search networks…'
						className='pl-8'
						maxLength={200}
					/>
				</div>
				<div className='flex flex-wrap items-center gap-2 text-sm text-text-secondary'>
					<span>
						<span className='font-medium text-text-primary'>{totalCount}</span>
						<span className='ml-1'>networks</span>
					</span>
					<Button variant='default' size='sm' onClick={() => setShowCreateDialog(true)} disabled={isCreatingNetwork}>
						<IconPlus size={14} className='mr-1.5' />
						{isCreatingNetwork ? 'Creating...' : 'Create Network'}
					</Button>
					<button
						onClick={() => refetch()}
						disabled={isFetching}
						className='flex items-center gap-2 rounded-lg bg-surface-1 px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50'
					>
						<IconRefresh size={14} className={isFetching ? 'animate-spin' : ''} />
						Refresh
					</button>
				</div>
			</div>

			{/* Action Result Toast */}
			<AnimatePresence>
				{actionResult && (
					<motion.div
						initial={{opacity: 0, y: -10}}
						animate={{opacity: 1, y: 0}}
						exit={{opacity: 0, y: -10}}
						className={cn(
							'mb-4 rounded-lg px-4 py-3 text-sm font-medium',
							actionResult.type === 'success'
								? 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30'
								: 'bg-red-500/20 text-red-600 border border-red-500/30',
						)}
					>
						{actionResult.message}
					</motion.div>
				)}
			</AnimatePresence>

			{/* Networks Table */}
			{isLoading ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconRefresh size={24} className='mx-auto mb-3 animate-spin text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>Loading networks...</p>
				</div>
			) : isError ? (
				<div className='rounded-xl border border-red-500/20 bg-red-500/10 p-8 text-center'>
					<IconNetwork size={24} className='mx-auto mb-3 text-red-400' />
					<p className='text-sm text-red-400'>Failed to load networks</p>
					<p className='mt-1 text-xs text-red-400/60'>{error?.message}</p>
				</div>
			) : !networks.length ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconNetwork size={32} className='mx-auto mb-3 text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>No Docker networks found</p>
				</div>
			) : noFilterResults ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconSearch size={28} className='mx-auto mb-3 text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>
						No networks match "<span className='font-mono'>{searchQuery}</span>"
					</p>
				</div>
			) : (
				<div className='overflow-x-auto'>
					<div className='rounded-xl border border-border-default bg-surface-base overflow-hidden'>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className='pl-4'>Name</TableHead>
									<TableHead>Driver</TableHead>
									<TableHead>Scope</TableHead>
									<TableHead>Containers</TableHead>
									<TableHead className='text-right pr-4'>Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredNetworks.map((network) => (
									<TableRow key={network.id}>
										<TableCell className='pl-4'>
											<span className='text-sm font-medium'>{network.name}</span>
										</TableCell>
										<TableCell>
											<span className='text-sm text-text-secondary'>{network.driver}</span>
										</TableCell>
										<TableCell>
											<span className='inline-flex items-center rounded-full bg-neutral-500/10 px-2 py-0.5 text-[11px] font-medium text-text-secondary'>
												{network.scope}
											</span>
										</TableCell>
										<TableCell>
											<span className='text-sm text-text-secondary'>{network.containerCount}</span>
										</TableCell>
										<TableCell className='text-right pr-4'>
											<div className='flex items-center justify-end gap-0.5'>
												<ActionButton
													icon={IconLink}
													onClick={() =>
														copyDeepLinkToClipboard({section: 'networks', id: network.id}).then(
															() => toast.success('Deep link copied'),
															() => toast.error('Could not copy to clipboard'),
														)
													}
													color='blue'
													title='Copy deep link to this network'
												/>
												<ActionButton
													icon={IconSearch}
													onClick={() => setSelectedNetwork(network.id)}
													disabled={isInspecting}
													color='blue'
													title='Inspect network'
												/>
												<ActionButton
													icon={IconTrash}
													onClick={() => setRemoveTarget(network.id)}
													disabled={isRemovingNetwork}
													color='red'
													title='Remove network'
												/>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</div>
			)}

			{/* Network Inspect Card */}
			<AnimatePresence>
				{inspectedNetworkData && (
					<motion.div
						initial={{opacity: 0, y: 10}}
						animate={{opacity: 1, y: 0}}
						exit={{opacity: 0, y: 10}}
						className='mt-4 rounded-xl border border-border-default bg-surface-base p-4'
					>
						<div className='mb-3 flex items-center justify-between'>
							<div>
								<h3 className='text-sm font-semibold text-text-primary'>{inspectedNetworkData.name}</h3>
								<p className='text-xs text-text-secondary'>
									{inspectedNetworkData.driver} / {inspectedNetworkData.scope}
								</p>
							</div>
							<button
								onClick={() => setSelectedNetwork(null)}
								className='rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary'
								title='Close'
							>
								<IconX size={16} />
							</button>
						</div>
						{inspectedNetworkData.containers.length === 0 ? (
							<p className='text-xs text-text-tertiary'>No containers connected to this network</p>
						) : (
							<div className='rounded-lg border border-border-default overflow-hidden'>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className='pl-3 text-xs'>Container</TableHead>
											<TableHead className='text-xs'>IPv4 Address</TableHead>
											<TableHead className='text-xs'>MAC Address</TableHead>
											<TableHead className='text-xs text-right pr-3'>Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{inspectedNetworkData.containers.map((container) => (
											<TableRow key={container.name}>
												<TableCell className='pl-3'>
													<span className='text-xs font-medium'>{container.name}</span>
												</TableCell>
												<TableCell>
													<span className='font-mono text-xs text-text-secondary'>{container.ipv4 || '-'}</span>
												</TableCell>
												<TableCell>
													<span className='font-mono text-xs text-text-secondary'>{container.macAddress || '-'}</span>
												</TableCell>
												<TableCell className='text-right pr-3'>
													<ActionButton
														icon={IconUnlink}
														onClick={() => disconnectNetwork(inspectedNetworkData.id, container.name)}
														disabled={isDisconnecting}
														color='red'
														title='Disconnect container'
													/>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						)}
					</motion.div>
				)}
			</AnimatePresence>

			{/* Create Network Dialog */}
			<CreateNetworkDialog
				open={showCreateDialog}
				onOpenChange={setShowCreateDialog}
				onConfirm={(input) => createNetwork(input)}
				isCreating={isCreatingNetwork}
			/>

			{/* Remove Network Dialog */}
			{removeTarget && (
				<RemoveNetworkDialog
					open={!!removeTarget}
					onOpenChange={(open) => {
						if (!open) setRemoveTarget(null)
					}}
					onConfirm={() => {
						removeNetwork(removeTarget)
						setRemoveTarget(null)
					}}
					isRemoving={isRemovingNetwork}
				/>
			)}
		</div>
	)
}
