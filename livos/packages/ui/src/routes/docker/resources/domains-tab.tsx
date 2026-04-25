import {useState} from 'react'
import {IconWorld, IconTrash, IconLink} from '@tabler/icons-react'
import {motion} from 'framer-motion'

import {trpcReact} from '@/trpc/trpc'
import {Select, SelectTrigger, SelectValue, SelectContent, SelectItem} from '@/shadcn-components/ui/select'
import {Button} from '@/shadcn-components/ui/button'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/shadcn-components/ui/alert-dialog'
import {cn} from '@/shadcn-lib/utils'

type Domain = {
	id: string | null
	domain: string
	appMapping: Record<string, string>
	status: string
	syncedAt: string | null
	createdAt: string | null
}

const STATUS_STYLES: Record<string, {bg: string; text: string; label: string}> = {
	active: {bg: 'bg-emerald-500/15', text: 'text-emerald-500', label: 'Active'},
	dns_verified: {bg: 'bg-emerald-500/15', text: 'text-emerald-500', label: 'DNS Verified'},
	pending_dns: {bg: 'bg-yellow-500/15', text: 'text-yellow-500', label: 'Pending DNS'},
	dns_failed: {bg: 'bg-red-500/15', text: 'text-red-500', label: 'DNS Failed'},
	error: {bg: 'bg-red-500/15', text: 'text-red-500', label: 'Error'},
	dns_changed: {bg: 'bg-orange-500/15', text: 'text-orange-500', label: 'DNS Changed'},
}

function StatusBadge({status}: {status: string}) {
	const style = STATUS_STYLES[status] ?? {bg: 'bg-neutral-500/15', text: 'text-neutral-400', label: status}
	return (
		<span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', style.bg, style.text)}>
			{style.label}
		</span>
	)
}

export function DomainsTab() {
	const [removeDomain, setRemoveDomain] = useState<string | null>(null)
	const [actionResult, setActionResult] = useState<{type: 'success' | 'error'; message: string} | null>(null)

	const domainsQuery = trpcReact.domain.platform.listCustomDomains.useQuery(undefined, {
		refetchInterval: 10_000,
	})

	const containersQuery = trpcReact.docker.listContainers.useQuery(undefined, {
		refetchInterval: 10_000,
	})

	const updateMappingMutation = trpcReact.domain.platform.updateAppMapping.useMutation({
		onSuccess: () => {
			domainsQuery.refetch()
			setActionResult({type: 'success', message: 'App mapping updated'})
			setTimeout(() => setActionResult(null), 3000)
		},
		onError: (err) => {
			setActionResult({type: 'error', message: err.message})
			setTimeout(() => setActionResult(null), 5000)
		},
	})

	const removeMutation = trpcReact.domain.platform.removeCustomDomain.useMutation({
		onSuccess: () => {
			domainsQuery.refetch()
			setRemoveDomain(null)
			setActionResult({type: 'success', message: 'Domain removed'})
			setTimeout(() => setActionResult(null), 3000)
		},
		onError: (err) => {
			setActionResult({type: 'error', message: err.message})
			setRemoveDomain(null)
			setTimeout(() => setActionResult(null), 5000)
		},
	})

	const runningContainers = (containersQuery.data ?? []).filter((c) => c.state === 'running')
	const domains = (domainsQuery.data ?? []) as Domain[]

	// Loading state
	if (domainsQuery.isLoading) {
		return (
			<div className='flex h-64 items-center justify-center'>
				<div className='text-sm text-text-secondary'>Loading domains...</div>
			</div>
		)
	}

	// Error state
	if (domainsQuery.isError) {
		return (
			<div className='flex h-64 items-center justify-center'>
				<div className='text-sm text-red-400'>Failed to load domains: {domainsQuery.error?.message}</div>
			</div>
		)
	}

	// Empty state
	if (domains.length === 0) {
		return (
			<div className='flex h-64 flex-col items-center justify-center gap-2'>
				<IconWorld size={40} className='text-text-secondary opacity-40' />
				<p className='text-sm font-medium text-text-primary'>No custom domains synced.</p>
				<p className='max-w-sm text-center text-xs text-text-secondary'>
					Add domains on your livinity.io dashboard, and they'll appear here once verified.
				</p>
			</div>
		)
	}

	return (
		<div className='space-y-3 py-4'>
			{/* Inline feedback toast */}
			{actionResult && (
				<motion.div
					initial={{opacity: 0, y: -8}}
					animate={{opacity: 1, y: 0}}
					exit={{opacity: 0}}
					className={cn(
						'rounded-md px-3 py-2 text-xs font-medium',
						actionResult.type === 'success'
							? 'bg-emerald-500/15 text-emerald-400'
							: 'bg-red-500/15 text-red-400',
					)}
				>
					{actionResult.message}
				</motion.div>
			)}

			{/* Domain cards */}
			{domains.map((domain) => {
				const currentMapping = domain.appMapping?.root ?? ''

				return (
					<motion.div
						key={domain.domain}
						initial={{opacity: 0, y: 8}}
						animate={{opacity: 1, y: 0}}
						className='rounded-lg border border-border-default bg-surface-base p-4'
					>
						<div className='flex items-start justify-between gap-4'>
							{/* Domain info */}
							<div className='min-w-0 flex-1'>
								<div className='flex items-center gap-2'>
									<IconWorld size={16} className='shrink-0 text-text-secondary' />
									<h3 className='truncate text-sm font-semibold text-text-primary'>
										{domain.domain}
									</h3>
									<StatusBadge status={domain.status} />
								</div>

								{/* App mapping */}
								<div className='mt-3 flex items-center gap-2'>
									<IconLink size={14} className='shrink-0 text-text-secondary' />
									<span className='text-xs text-text-secondary'>Maps to:</span>
									<Select
										value={currentMapping || '__none__'}
										onValueChange={(value) => {
											updateMappingMutation.mutate({
												domain: domain.domain,
												prefix: 'root',
												appSlug: value === '__none__' ? null : value,
											})
										}}
									>
										<SelectTrigger className='h-7 w-48 text-xs'>
											<SelectValue placeholder='Not mapped' />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='__none__'>Not mapped</SelectItem>
											{runningContainers.map((c) => (
												<SelectItem key={c.name} value={c.name}>
													{c.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{/* Synced at */}
								{domain.syncedAt && (
									<p className='mt-2 text-[11px] text-text-secondary'>
										Last synced: {new Date(domain.syncedAt).toLocaleString()}
									</p>
								)}
							</div>

							{/* Remove button */}
							<Button
								variant='secondary'
								size='sm'
								className='shrink-0 border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300'
								onClick={() => setRemoveDomain(domain.domain)}
							>
								<IconTrash size={14} className='mr-1' />
								Remove
							</Button>
						</div>
					</motion.div>
				)
			})}

			{/* Remove confirmation dialog */}
			<AlertDialog open={!!removeDomain} onOpenChange={(open) => !open && setRemoveDomain(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove domain</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to remove <strong>{removeDomain}</strong>? This will sync the
							removal back to the platform and the domain will no longer route to your server.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className='bg-red-600 hover:bg-red-700'
							onClick={() => {
								if (removeDomain) {
									removeMutation.mutate({domain: removeDomain})
								}
							}}
						>
							{removeMutation.isPending ? 'Removing...' : 'Remove'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
