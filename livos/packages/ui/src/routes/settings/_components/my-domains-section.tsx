import {useEffect, useState} from 'react'
import {IconWorld, IconExternalLink, IconSettings} from '@tabler/icons-react'
import {motion} from 'motion/react'
import {Loader2} from 'lucide-react'

import {trpcReact} from '@/trpc/trpc'
import {Select, SelectTrigger, SelectValue, SelectContent, SelectItem} from '@/shadcn-components/ui/select'
import {Button} from '@/shadcn-components/ui/button'
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter} from '@/shadcn-components/ui/dialog'
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

function EmptyState() {
	return (
		<div className='flex flex-col items-center justify-center gap-3 py-12'>
			<IconWorld size={40} className='text-text-secondary opacity-40' />
			<p className='text-sm font-medium text-text-primary'>No domains yet</p>
			<p className='text-xs text-text-secondary'>Add domains on livinity.io to see them here.</p>
			<a
				href='https://livinity.io/dashboard'
				target='_blank'
				rel='noopener noreferrer'
				className='flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300'
			>
				Open livinity.io dashboard
				<IconExternalLink size={12} />
			</a>
		</div>
	)
}

function ConfigureDialog({
	domain,
	containers,
	open,
	onOpenChange,
	onApply,
	isPending,
}: {
	domain: Domain
	containers: Array<{name: string}>
	open: boolean
	onOpenChange: (open: boolean) => void
	onApply: (domainName: string, appSlug: string | null) => void
	isPending: boolean
}) {
	const [selectedApp, setSelectedApp] = useState<string>(domain.appMapping?.root ?? '__none__')

	// Reset selected app when domain prop changes
	useEffect(() => {
		setSelectedApp(domain.appMapping?.root ?? '__none__')
	}, [domain.domain, domain.appMapping?.root])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Configure {domain.domain}</DialogTitle>
				</DialogHeader>

				<div className='py-4'>
					<label className='mb-2 block text-sm font-medium text-text-primary'>Map to application</label>
					<Select value={selectedApp} onValueChange={setSelectedApp}>
						<SelectTrigger className='w-full'>
							<SelectValue placeholder='Select an application' />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='__none__'>Not mapped</SelectItem>
							{containers.map((c) => (
								<SelectItem key={c.name} value={c.name}>
									{c.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<DialogFooter>
					<Button variant='outline' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={() => {
							onApply(domain.domain, selectedApp === '__none__' ? null : selectedApp)
							onOpenChange(false)
						}}
						disabled={isPending}
					>
						{isPending && <Loader2 className='mr-1.5 size-3.5 animate-spin' />}
						Apply
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

export default function MyDomainsSection() {
	const [configuringDomain, setConfiguringDomain] = useState<Domain | null>(null)
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

	const runningContainers = (containersQuery.data ?? []).filter((c) => c.state === 'running')
	const domains = (domainsQuery.data ?? []) as Domain[]

	// Loading state
	if (domainsQuery.isLoading) {
		return (
			<div className='flex items-center justify-center gap-2 py-12'>
				<Loader2 className='size-4 animate-spin text-text-tertiary' />
				<span className='text-sm text-text-secondary'>Loading domains...</span>
			</div>
		)
	}

	// Error state
	if (domainsQuery.isError) {
		return (
			<div className='flex items-center justify-center py-12'>
				<span className='text-sm text-red-400'>Failed to load domains: {domainsQuery.error?.message}</span>
			</div>
		)
	}

	// Empty state
	if (domains.length === 0) {
		return <EmptyState />
	}

	return (
		<div className='space-y-3'>
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
			{domains.map((domain) => (
				<motion.div
					key={domain.domain}
					initial={{opacity: 0, y: 8}}
					animate={{opacity: 1, y: 0}}
					className='rounded-lg border border-border-default bg-surface-base p-4'
				>
					{/* Top row: domain name + status badge */}
					<div className='flex items-center gap-2'>
						<h3 className='truncate text-sm font-medium text-text-primary'>{domain.domain}</h3>
						<StatusBadge status={domain.status} />
					</div>

					{/* Middle row: current mapping */}
					<div className='mt-1.5'>
						{domain.appMapping?.root ? (
							<span className='text-xs text-text-secondary'>Mapped to: {domain.appMapping.root}</span>
						) : (
							<span className='text-xs text-text-tertiary'>Not mapped</span>
						)}
					</div>

					{/* Bottom row: synced-at + Configure button */}
					<div className='mt-3 flex items-center justify-between'>
						{domain.syncedAt ? (
							<span className='text-xs text-text-tertiary'>
								Synced: {new Date(domain.syncedAt).toLocaleString()}
							</span>
						) : (
							<span />
						)}
						<Button variant='outline' size='sm' onClick={() => setConfiguringDomain(domain)}>
							<IconSettings size={14} className='mr-1.5' />
							Configure
						</Button>
					</div>
				</motion.div>
			))}

			{/* Configure dialog */}
			{configuringDomain && (
				<ConfigureDialog
					domain={configuringDomain}
					containers={runningContainers}
					open={!!configuringDomain}
					onOpenChange={(open) => {
						if (!open) setConfiguringDomain(null)
					}}
					onApply={(domainName, appSlug) => {
						updateMappingMutation.mutate({domain: domainName, prefix: 'root', appSlug})
					}}
					isPending={updateMappingMutation.isPending}
				/>
			)}
		</div>
	)
}
