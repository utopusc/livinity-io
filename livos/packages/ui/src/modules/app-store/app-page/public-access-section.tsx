import {useState, useEffect} from 'react'
import {TbWorld, TbCheck, TbX, TbLoader2, TbExternalLink, TbInfoCircle} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Switch} from '@/shadcn-components/ui/switch'
import {trpcReact} from '@/trpc/trpc'

interface PublicAccessSectionProps {
	appId: string
	appName: string
	appPort: number
}

export function PublicAccessSection({appId, appName, appPort}: PublicAccessSectionProps) {
	const [subdomain, setSubdomain] = useState('')
	const [isEditing, setIsEditing] = useState(false)

	const utils = trpcReact.useUtils()

	// Get current subdomain config for this app
	const subdomainQuery = trpcReact.domain.getAppSubdomain.useQuery({appId})

	// Mutations
	const setSubdomainMut = trpcReact.domain.setAppSubdomain.useMutation({
		onSuccess: () => {
			utils.domain.getAppSubdomain.invalidate({appId})
			setIsEditing(false)
		},
	})

	const toggleMut = trpcReact.domain.toggleAppSubdomain.useMutation({
		onSuccess: () => {
			utils.domain.getAppSubdomain.invalidate({appId})
		},
	})

	const removeMut = trpcReact.domain.removeAppSubdomain.useMutation({
		onSuccess: () => {
			utils.domain.getAppSubdomain.invalidate({appId})
		},
	})

	// DNS verification (only when subdomain is configured)
	const dnsQuery = trpcReact.domain.verifySubdomainDns.useQuery(
		{subdomain: subdomainQuery.data?.subdomain?.subdomain || ''},
		{
			enabled: !!subdomainQuery.data?.subdomain?.subdomain && subdomainQuery.data?.subdomain?.enabled,
			refetchInterval: 10000,
		},
	)

	// Initialize subdomain input when data loads
	useEffect(() => {
		if (subdomainQuery.data?.subdomain) {
			setSubdomain(subdomainQuery.data.subdomain.subdomain)
		}
	}, [subdomainQuery.data?.subdomain])

	if (subdomainQuery.isLoading) {
		return (
			<div className='flex items-center gap-2 py-4 text-white/50'>
				<TbLoader2 className='h-4 w-4 animate-spin' />
				<span className='text-sm'>Loading...</span>
			</div>
		)
	}

	const {mainDomain, mainDomainActive, subdomain: existingSubdomain} = subdomainQuery.data || {}

	// Main domain not configured yet
	if (!mainDomainActive) {
		return (
			<div className='rounded-lg border border-white/10 bg-white/5 p-4'>
				<div className='flex items-start gap-3'>
					<TbInfoCircle className='mt-0.5 h-5 w-5 text-yellow-400' />
					<div>
						<p className='text-sm font-medium text-white/90'>Domain Required</p>
						<p className='mt-1 text-xs text-white/50'>
							To enable public access for apps, first configure your main domain in Settings → Domain & HTTPS.
						</p>
					</div>
				</div>
			</div>
		)
	}

	const fullDomain = subdomain ? `${subdomain}.${mainDomain}` : null
	const isConfigured = !!existingSubdomain
	const isEnabled = existingSubdomain?.enabled || false

	const handleSave = () => {
		if (!subdomain.trim()) return
		setSubdomainMut.mutate({
			appId,
			subdomain: subdomain.trim().toLowerCase(),
			port: appPort,
			enabled: true,
		})
	}

	const handleToggle = (enabled: boolean) => {
		toggleMut.mutate({appId, enabled})
	}

	const handleRemove = () => {
		removeMut.mutate({appId})
		setSubdomain('')
	}

	return (
		<div className='space-y-4'>
			<div className='flex items-center gap-2'>
				<TbWorld className='h-5 w-5 text-white/70' />
				<span className='text-sm font-medium text-white/90'>Public Access</span>
			</div>

			{!isConfigured || isEditing ? (
				// Configuration form
				<div className='space-y-3'>
					<div className='flex items-center gap-2'>
						<Input
							value={subdomain}
							onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
							placeholder={appName.toLowerCase().replace(/[^a-z0-9]/g, '-')}
							className='max-w-[200px] font-mono text-sm'
						/>
						<span className='text-sm text-white/50'>.{mainDomain}</span>
					</div>

					<div className='flex gap-2'>
						<Button
							size='sm'
							variant='default'
							onClick={handleSave}
							disabled={!subdomain.trim() || setSubdomainMut.isPending}
						>
							{setSubdomainMut.isPending ? (
								<TbLoader2 className='mr-1 h-4 w-4 animate-spin' />
							) : (
								<TbCheck className='mr-1 h-4 w-4' />
							)}
							{isEditing ? 'Update' : 'Enable'}
						</Button>
						{isEditing && (
							<Button size='sm' variant='ghost' onClick={() => setIsEditing(false)}>
								Cancel
							</Button>
						)}
					</div>

					<p className='text-xs text-white/40'>
						Make sure to add an A record for <span className='font-mono'>{subdomain || '*'}.{mainDomain}</span> pointing
						to your server IP, or use a wildcard A record (*.{mainDomain}).
					</p>
				</div>
			) : (
				// Configured state
				<div className='space-y-3'>
					<div className='flex items-center justify-between'>
						<div className='flex items-center gap-3'>
							<Switch checked={isEnabled} onCheckedChange={handleToggle} disabled={toggleMut.isPending} />
							<div>
								<a
									href={`https://${fullDomain}`}
									target='_blank'
									rel='noopener noreferrer'
									className='flex items-center gap-1 font-mono text-sm text-white/90 hover:text-white'
								>
									{fullDomain}
									<TbExternalLink className='h-3.5 w-3.5' />
								</a>
								<p className='text-xs text-white/40'>Port {appPort}</p>
							</div>
						</div>

						{/* DNS Status */}
						{isEnabled && (
							<div className='flex items-center gap-1.5'>
								{dnsQuery.isLoading ? (
									<TbLoader2 className='h-4 w-4 animate-spin text-white/50' />
								) : dnsQuery.data?.match ? (
									<span className='flex items-center gap-1 text-xs text-green-400'>
										<TbCheck className='h-4 w-4' />
										DNS OK
									</span>
								) : (
									<span className='flex items-center gap-1 text-xs text-yellow-400'>
										<TbInfoCircle className='h-4 w-4' />
										DNS pending
									</span>
								)}
							</div>
						)}
					</div>

					<div className='flex gap-2'>
						<Button size='sm' variant='ghost' onClick={() => setIsEditing(true)}>
							Change subdomain
						</Button>
						<Button
							size='sm'
							variant='ghost'
							className='text-red-400 hover:text-red-300'
							onClick={handleRemove}
							disabled={removeMut.isPending}
						>
							{removeMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : <TbX className='mr-1 h-4 w-4' />}
							Remove
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}
