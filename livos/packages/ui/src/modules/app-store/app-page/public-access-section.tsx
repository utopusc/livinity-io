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

/**
 * Phase 219 T5 — DNS label rule: lowercase alphanum, dashes allowed but not
 * at edges. RFC 1035 / 1123 with the 63-char per-label limit. Operator quote:
 * "{filebrowser}-bruce.livinity.io diye gostermesi lazim {} icindeki kismi
 *  degistirebilmeliyim sadece."
 */
const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

function validateSlug(raw: string): string | null {
	const v = raw.trim().toLowerCase()
	if (v.length === 0) return 'Slug is required.'
	if (!SLUG_PATTERN.test(v)) {
		return 'Use only lowercase letters, digits, and dashes (cannot start or end with a dash).'
	}
	return null
}

export function PublicAccessSection({appId, appName, appPort}: PublicAccessSectionProps) {
	const [subdomain, setSubdomain] = useState('')
	const [isEditing, setIsEditing] = useState(false)
	const [slugError, setSlugError] = useState<string | null>(null)

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
			<div className='flex items-center gap-2 py-4 text-text-secondary'>
				<TbLoader2 className='h-4 w-4 animate-spin' />
				<span className='text-body-sm'>Loading...</span>
			</div>
		)
	}

	const {mainDomain, mainDomainActive, subdomain: existingSubdomain, userSlug} = subdomainQuery.data || {}

	// Main domain not configured yet
	if (!mainDomainActive) {
		return (
			<div className='rounded-radius-sm border border-border-default bg-surface-base p-4'>
				<div className='flex items-start gap-3'>
					<TbInfoCircle className='mt-0.5 h-5 w-5 text-yellow-400' />
					<div>
						<p className='text-body-sm font-medium text-text-primary'>Domain Required</p>
						<p className='mt-1 text-caption text-text-secondary'>
							To enable public access for apps, first configure your main domain in Settings → Domain & HTTPS.
						</p>
					</div>
				</div>
			</div>
		)
	}

	// Phase 141-03/04: prefer the canonical FQDN minted by Server5 (Phase 140
	// hyphen-pattern, e.g. `n8n-socinity.livinity.io`) when present. Legacy
	// path computes `${subdomain}.${mainDomain}` which produces the wrong
	// shape (one level too deep) for Phase 140 multi-tenant tunnels.
	const canonicalHost = (existingSubdomain as {host?: string} | null | undefined)?.host
	const fullDomain = canonicalHost ?? (subdomain ? `${subdomain}.${mainDomain}` : null)
	const isConfigured = !!existingSubdomain
	const isEnabled = existingSubdomain?.enabled || false

	// Phase 219 T5 — hyphen-pattern preview + DNS label validation.
	const slugSuffix = userSlug && mainDomain ? `-${userSlug}.${mainDomain}` : mainDomain ? `.${mainDomain}` : ''
	const previewHost = subdomain.trim() ? `${subdomain.trim().toLowerCase()}${slugSuffix}` : null

	const handleSave = () => {
		const err = validateSlug(subdomain)
		setSlugError(err)
		if (err) return
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
				<TbWorld className='h-5 w-5 text-text-primary' />
				<span className='text-body-sm font-medium text-text-primary'>Public Access</span>
			</div>

			{!isConfigured || isEditing ? (
				// Phase 219 T5 — hyphen-pattern template: [<editable>]-<userSlug>.<root>.
				// Only the slug is an <input>; the suffix is a non-editable label so the
				// operator can't accidentally type the user prefix or apex.
				<div className='space-y-3'>
					<div className='flex items-center gap-1 font-mono text-sm'>
						<Input
							value={subdomain}
							onChange={(e) => {
								const cleaned = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
								setSubdomain(cleaned)
								if (slugError) setSlugError(null)
							}}
							onBlur={() => setSlugError(validateSlug(subdomain))}
							placeholder={appName.toLowerCase().replace(/[^a-z0-9]/g, '-')}
							className='max-w-[160px] font-mono text-sm'
							aria-invalid={slugError ? 'true' : undefined}
						/>
						<span className='text-text-secondary'>{slugSuffix}</span>
					</div>

					{previewHost ? (
						<p className='text-caption text-text-tertiary'>
							Preview: <span className='font-mono'>https://{previewHost}</span>
						</p>
					) : null}

					{slugError ? (
						<p role='alert' className='text-caption text-red-400'>
							{slugError}
						</p>
					) : null}

					<div className='flex gap-2'>
						<Button
							size='sm'
							variant='default'
							onClick={handleSave}
							disabled={!subdomain.trim() || setSubdomainMut.isPending || Boolean(slugError)}
						>
							{setSubdomainMut.isPending ? (
								<TbLoader2 className='mr-1 h-4 w-4 animate-spin' />
							) : (
								<TbCheck className='mr-1 h-4 w-4' />
							)}
							{isEditing ? 'Update' : 'Enable'}
						</Button>
						{isEditing && (
							<Button
								size='sm'
								variant='ghost'
								onClick={() => {
									setIsEditing(false)
									setSlugError(null)
								}}
							>
								Cancel
							</Button>
						)}
					</div>

					<p className='text-caption text-text-tertiary'>
						{userSlug ? (
							<>
								The host is minted on Server5 as{' '}
								<span className='font-mono'>&lt;slug&gt;-{userSlug}.{mainDomain}</span> — wildcard{' '}
								<span className='font-mono'>*.{mainDomain}</span> A record covers every slug.
							</>
						) : (
							<>
								Make sure to add an A record for{' '}
								<span className='font-mono'>{subdomain || '*'}.{mainDomain}</span> pointing to your server IP, or
								use a wildcard A record (*.{mainDomain}).
							</>
						)}
					</p>

					{setSubdomainMut.isError ? (
						<p role='alert' className='text-caption text-red-400'>
							{setSubdomainMut.error?.message ?? 'Save failed — try again.'}
						</p>
					) : null}
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
									className='flex items-center gap-1 font-mono text-body-sm text-text-primary hover:text-brand'
								>
									{fullDomain}
									<TbExternalLink className='h-3.5 w-3.5' />
								</a>
								<p className='text-caption text-text-tertiary'>Port {appPort}</p>
							</div>
						</div>

						{/* DNS Status — Phase 219 T4 surfaces the verify reason in the tooltip
								so the operator can tell "still propagating" from "never minted". */}
						{isEnabled && (
							<div className='flex items-center gap-1.5'>
								{dnsQuery.isLoading ? (
									<TbLoader2 className='h-4 w-4 animate-spin text-text-secondary' />
								) : dnsQuery.data?.match ? (
									<span
										className='flex items-center gap-1 text-xs text-green-400'
										title={dnsQuery.data?.reason ?? 'DNS resolved.'}
									>
										<TbCheck className='h-4 w-4' />
										DNS OK
									</span>
								) : (
									<span
										className='flex items-center gap-1 text-xs text-yellow-400'
										title={dnsQuery.data?.reason ?? 'DNS not yet propagated for this host.'}
									>
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
