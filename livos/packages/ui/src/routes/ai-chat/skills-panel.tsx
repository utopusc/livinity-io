import {useCallback, useEffect, useState} from 'react'
import {
	IconSearch,
	IconDownload,
	IconTrash,
	IconLoader2,
	IconCheck,
	IconAlertCircle,
	IconShieldCheck,
	IconShieldLock,
	IconX,
	IconPuzzle,
	IconPuzzleOff,
	IconTag,
	IconRefresh,
	IconPlus,
	IconDatabase,
} from '@tabler/icons-react'
import {cn} from '@/shadcn-lib/utils'

// ─── Types ──────────────────────────────────────────────────────

type Permission = {
	name: string
	reason: string
	required: boolean
}

type CatalogEntry = {
	name: string
	version: string
	description: string
	author?: string
	tags?: string[]
	permissions: Permission[]
	tools: string[]
	repoUrl: string
	path: string
	downloadUrl: string
}

type InstalledSkill = {
	name: string
	version: string
	description: string
	installedAt: number
	permissions: Permission[]
}

type BuiltinSkill = {
	name: string
	description: string
	triggers: string[]
	type: string
}

// ─── API helpers ────────────────────────────────────────────────

const API_BASE = '/api/skills'

async function skillFetch<T>(path: string, options?: RequestInit): Promise<T> {
	const res = await fetch(`${API_BASE}${path}`, {
		credentials: 'include',
		headers: {'Content-Type': 'application/json', ...options?.headers},
		...options,
	})
	if (!res.ok) {
		const body = await res.json().catch(() => ({error: res.statusText}))
		throw new Error(body.error || `API error: ${res.status}`)
	}
	return res.json()
}

// ─── Permission Review Dialog ───────────────────────────────────

function PermissionDialog({
	skill,
	onClose,
	onConfirm,
}: {
	skill: CatalogEntry
	onClose: () => void
	onConfirm: (accepted: string[]) => void
}) {
	const [accepted, setAccepted] = useState<Set<string>>(() => {
		// Auto-accept all required permissions
		return new Set(skill.permissions.filter((p) => p.required).map((p) => p.name))
	})
	const [installing, setInstalling] = useState(false)
	const [error, setError] = useState('')

	const allRequiredAccepted = skill.permissions
		.filter((p) => p.required)
		.every((p) => accepted.has(p.name))

	const handleInstall = async () => {
		setError('')
		setInstalling(true)
		try {
			await onConfirm(Array.from(accepted))
		} catch (err: any) {
			setError(err.message)
			setInstalling(false)
		}
	}

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm' onClick={onClose}>
			<div
				className='w-[460px] rounded-radius-xl border border-border-default bg-dialog-content p-5 shadow-2xl'
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className='mb-5 flex items-center justify-between'>
					<div className='flex items-center gap-3'>
						<div className='flex h-9 w-9 items-center justify-center rounded-radius-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20'>
							<IconShieldCheck size={18} className='text-emerald-400' />
						</div>
						<div>
							<h3 className='text-body font-semibold text-text-primary'>Review Permissions</h3>
							<p className='text-caption-sm text-text-tertiary'>
								{skill.name} v{skill.version}
							</p>
						</div>
					</div>
					<button onClick={onClose} className='rounded-radius-sm p-1.5 text-text-tertiary transition-colors hover:bg-surface-1 hover:text-text-secondary'>
						<IconX size={16} />
					</button>
				</div>

				<p className='mb-4 text-caption leading-relaxed text-text-tertiary'>
					This skill requires the following permissions to function. Review and accept them before installing.
				</p>

				{/* Permissions list */}
				<div className='mb-5 space-y-2'>
					{skill.permissions.length === 0 ? (
						<div className='rounded-radius-lg bg-green-500/10 px-3 py-2.5 text-caption text-green-400'>
							This skill requires no special permissions.
						</div>
					) : (
						skill.permissions.map((perm) => (
							<label
								key={perm.name}
								className={cn(
									'flex cursor-pointer items-start gap-3 rounded-radius-lg border p-3 transition-all',
									accepted.has(perm.name)
										? 'border-emerald-500/30 bg-emerald-500/5'
										: 'border-border-subtle bg-surface-base hover:border-border-default',
								)}
							>
								<input
									type='checkbox'
									checked={accepted.has(perm.name)}
									disabled={perm.required}
									onChange={() => {
										const next = new Set(accepted)
										if (next.has(perm.name)) {
											if (!perm.required) next.delete(perm.name)
										} else {
											next.add(perm.name)
										}
										setAccepted(next)
									}}
									className='mt-0.5 h-4 w-4 rounded border-border-default accent-emerald-500'
								/>
								<div className='min-w-0 flex-1'>
									<div className='flex items-center gap-2'>
										<span className='text-body-sm font-medium text-text-primary'>{perm.name}</span>
										{perm.required && (
											<span className='rounded-radius-sm bg-amber-500/15 px-1.5 py-0.5 text-caption-sm font-medium text-amber-400'>
												Required
											</span>
										)}
									</div>
									{perm.reason && (
										<p className='mt-0.5 text-caption-sm text-text-tertiary'>{perm.reason}</p>
									)}
								</div>
							</label>
						))
					)}
				</div>

				{/* Error */}
				{error && (
					<div className='mb-4 flex items-start gap-2 rounded-radius-lg bg-red-500/10 px-3 py-2.5 text-caption text-red-400'>
						<IconAlertCircle size={14} className='mt-0.5 flex-shrink-0' />
						<span>{error}</span>
					</div>
				)}

				{/* Actions */}
				<div className='flex justify-end gap-2'>
					<button
						onClick={onClose}
						className='rounded-radius-lg bg-surface-1 px-4 py-2 text-body-sm font-medium text-text-secondary transition-all hover:bg-surface-2 hover:text-text-primary'
					>
						Cancel
					</button>
					<button
						onClick={handleInstall}
						disabled={installing || !allRequiredAccepted}
						className='flex items-center gap-2 rounded-radius-lg bg-brand px-5 py-2 text-body-sm font-semibold text-white transition-all hover:bg-brand-lighter disabled:opacity-40'
					>
						{installing ? <IconLoader2 size={14} className='animate-spin' /> : <IconDownload size={14} />}
						Install
					</button>
				</div>
			</div>
		</div>
	)
}

// ─── Marketplace Tab ────────────────────────────────────────────

function MarketplaceTab({
	installedNames,
	onInstallComplete,
}: {
	installedNames: Set<string>
	onInstallComplete: () => void
}) {
	const [query, setQuery] = useState('')
	const [catalog, setCatalog] = useState<CatalogEntry[]>([])
	const [loading, setLoading] = useState(true)
	const [reviewTarget, setReviewTarget] = useState<CatalogEntry | null>(null)
	const [refreshing, setRefreshing] = useState(false)

	const fetchCatalog = useCallback(async (search?: string) => {
		setLoading(true)
		try {
			const params = search ? `?search=${encodeURIComponent(search)}` : ''
			const data = await skillFetch<{skills: CatalogEntry[]}>(`/marketplace${params}`)
			setCatalog(data.skills || [])
		} catch (err: any) {
			console.error('Skill marketplace fetch error:', err)
			setCatalog([])
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchCatalog()
	}, [fetchCatalog])

	// Debounced search
	useEffect(() => {
		if (!query.trim()) {
			fetchCatalog()
			return
		}
		const timer = setTimeout(() => fetchCatalog(query), 400)
		return () => clearTimeout(timer)
	}, [query, fetchCatalog])

	const handleInstall = async (accepted: string[]) => {
		if (!reviewTarget) return
		const result = await skillFetch<{success: boolean; error?: string}>('/install', {
			method: 'POST',
			body: JSON.stringify({skillName: reviewTarget.name, acceptedPermissions: accepted}),
		})
		if (!result.success) {
			throw new Error(result.error || 'Install failed')
		}
		setReviewTarget(null)
		onInstallComplete()
		fetchCatalog()
	}

	const handleRefresh = async () => {
		setRefreshing(true)
		try {
			await skillFetch('/refresh', {method: 'POST'})
			await fetchCatalog()
		} catch (err) {
			console.error('Refresh error:', err)
		} finally {
			setRefreshing(false)
		}
	}

	return (
		<div className='flex flex-col'>
			{/* Search + Refresh */}
			<div className='border-b border-border-subtle px-4 py-3'>
				<div className='flex items-center gap-2'>
					<div className='relative flex-1'>
						<IconSearch size={15} className='absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary' />
						<input
							type='text'
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder='Search skills...'
							className='w-full rounded-radius-lg border border-border-default bg-surface-base py-2.5 pl-9 pr-3 text-body-sm text-text-primary placeholder-text-tertiary outline-none transition-colors focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20'
						/>
						{loading && (
							<IconLoader2 size={14} className='absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-text-tertiary' />
						)}
					</div>
					<button
						onClick={handleRefresh}
						disabled={refreshing}
						className='flex items-center gap-1.5 rounded-radius-lg bg-surface-1 px-3 py-2.5 text-caption font-medium text-text-secondary transition-all hover:bg-surface-2 hover:text-text-primary disabled:opacity-40'
						title='Refresh catalog'
					>
						{refreshing ? <IconLoader2 size={13} className='animate-spin' /> : <IconRefresh size={13} />}
						Refresh
					</button>
				</div>
			</div>

			{/* Results */}
			<div className='p-4'>
				{loading && catalog.length === 0 ? (
					<div className='flex items-center justify-center py-16'>
						<IconLoader2 size={20} className='animate-spin text-text-tertiary' />
					</div>
				) : catalog.length === 0 ? (
					<div className='flex flex-col items-center justify-center py-16 text-text-tertiary'>
						<IconPuzzleOff size={28} className='mb-3' />
						<p className='text-body-sm font-medium'>
							{query ? `No skills found for "${query}"` : 'No skills available'}
						</p>
						<p className='mt-1 text-caption-sm'>
							{query ? 'Try a different search term' : 'The configured registry has no skills yet'}
						</p>
					</div>
				) : (
					<div className='space-y-2.5'>
						{catalog.map((skill) => {
							const isInstalled = installedNames.has(skill.name)
							return (
								<div
									key={skill.name}
									className='group flex flex-col gap-3 rounded-radius-xl border border-border-subtle bg-surface-base p-4 transition-all hover:border-border-emphasis hover:bg-surface-1'
								>
									<div className='flex items-start gap-3'>
										<div className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-radius-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20'>
											<IconPuzzle size={20} className='text-indigo-400' />
										</div>
										<div className='min-w-0 flex-1'>
											<div className='flex items-center gap-2'>
												<span className='truncate text-body-sm font-semibold text-text-primary'>{skill.name}</span>
												<span className='flex-shrink-0 rounded-radius-sm bg-surface-2 px-1.5 py-0.5 font-mono text-caption-sm text-text-tertiary'>
													v{skill.version}
												</span>
											</div>
											<p className='mt-1 line-clamp-2 text-caption leading-relaxed text-text-tertiary'>
												{skill.description}
											</p>
										</div>
									</div>

									<div className='flex items-center justify-between'>
										<div className='flex flex-wrap items-center gap-1.5'>
											{skill.author && (
												<span className='text-caption-sm text-text-tertiary'>{skill.author}</span>
											)}
											{skill.tags?.slice(0, 3).map((tag) => (
												<span
													key={tag}
													className='flex items-center gap-0.5 rounded-radius-sm bg-surface-2 px-1.5 py-0.5 text-caption-sm text-text-tertiary'
												>
													<IconTag size={10} />
													{tag}
												</span>
											))}
											{skill.permissions.length > 0 && (
												<span className='flex items-center gap-0.5 rounded-radius-sm bg-amber-500/10 px-1.5 py-0.5 text-caption-sm text-amber-400'>
													<IconShieldLock size={10} />
													{skill.permissions.length} permission{skill.permissions.length !== 1 && 's'}
												</span>
											)}
										</div>
										{isInstalled ? (
											<span className='flex items-center gap-1 rounded-radius-sm bg-green-500/10 px-2.5 py-1 text-caption-sm font-medium text-green-400'>
												<IconCheck size={12} />
												Installed
											</span>
										) : (
											<button
												onClick={() => setReviewTarget(skill)}
												className='flex items-center gap-1 rounded-radius-sm bg-surface-2 px-2.5 py-1 text-caption-sm font-medium text-text-secondary transition-all hover:bg-surface-3 hover:text-text-primary'
											>
												<IconDownload size={12} />
												Install
											</button>
										)}
									</div>
								</div>
							)
						})}
					</div>
				)}
			</div>

			{/* Permission review dialog */}
			{reviewTarget && (
				<PermissionDialog
					skill={reviewTarget}
					onClose={() => setReviewTarget(null)}
					onConfirm={handleInstall}
				/>
			)}
		</div>
	)
}

// ─── Installed Tab ──────────────────────────────────────────────

function InstalledTab({onUninstalled}: {onUninstalled: () => void}) {
	const [installed, setInstalled] = useState<InstalledSkill[]>([])
	const [builtins, setBuiltins] = useState<BuiltinSkill[]>([])
	const [loading, setLoading] = useState(true)
	const [actionLoading, setActionLoading] = useState<string | null>(null)

	const fetchAll = useCallback(async () => {
		try {
			const [installedData, builtinData] = await Promise.all([
				skillFetch<{skills: InstalledSkill[]}>('/installed'),
				skillFetch<{skills: BuiltinSkill[]}>('/builtin'),
			])
			setInstalled(installedData.skills || [])
			setBuiltins(builtinData.skills || [])
		} catch (err) {
			console.error('Failed to fetch skills:', err)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchAll()
	}, [fetchAll])

	const handleUninstall = async (name: string) => {
		if (!confirm(`Uninstall skill "${name}"?`)) return
		setActionLoading(name)
		try {
			await skillFetch('/uninstall', {
				method: 'POST',
				body: JSON.stringify({skillName: name}),
			})
			await fetchAll()
			onUninstalled()
		} catch (err) {
			console.error('Uninstall error:', err)
		} finally {
			setActionLoading(null)
		}
	}

	if (loading) {
		return (
			<div className='flex items-center justify-center py-16'>
				<IconLoader2 size={20} className='animate-spin text-text-tertiary' />
			</div>
		)
	}

	return (
		<div className='p-4'>
			{/* Marketplace-installed skills */}
			{installed.length > 0 && (
				<div className='mb-6'>
					<div className='mb-3 flex items-center gap-2 text-caption-sm text-text-tertiary'>
						<IconPuzzle size={13} />
						<span className='font-semibold uppercase tracking-wide'>Marketplace Skills</span>
						<span className='ml-1'>({installed.length})</span>
					</div>
					<div className='space-y-2'>
						{installed.map((skill) => (
							<div
								key={skill.name}
								className='rounded-radius-lg border border-border-subtle bg-surface-base p-3.5 transition-all hover:border-border-default'
							>
								<div className='flex items-start gap-3'>
									<div className='flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-radius-lg bg-gradient-to-br from-indigo-500/15 to-purple-500/15'>
										<IconPuzzle size={16} className='text-indigo-400/70' />
									</div>
									<div className='min-w-0 flex-1'>
										<div className='flex items-center gap-2'>
											<span className='text-body-sm font-medium text-text-primary'>{skill.name}</span>
											<span className='font-mono text-caption-sm text-text-tertiary'>v{skill.version}</span>
										</div>
										<p className='mt-0.5 text-caption-sm text-text-tertiary'>{skill.description}</p>
										<div className='mt-2 flex flex-wrap items-center gap-2 text-caption-sm text-text-tertiary'>
											<span>Installed {new Date(skill.installedAt).toLocaleDateString()}</span>
											{skill.permissions.length > 0 && (
												<span className='flex items-center gap-0.5'>
													<IconShieldLock size={10} />
													{skill.permissions.length} permission{skill.permissions.length !== 1 && 's'}
												</span>
											)}
										</div>
									</div>
									<button
										onClick={() => handleUninstall(skill.name)}
										disabled={actionLoading === skill.name}
										className='rounded-radius-sm p-1.5 text-text-tertiary transition-all hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40'
										title='Uninstall'
									>
										{actionLoading === skill.name ? (
											<IconLoader2 size={15} className='animate-spin' />
										) : (
											<IconTrash size={15} />
										)}
									</button>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Builtin skills */}
			{builtins.length > 0 && (
				<div>
					<div className='mb-3 flex items-center gap-2 text-caption-sm text-text-tertiary'>
						<IconShieldCheck size={13} />
						<span className='font-semibold uppercase tracking-wide'>Builtin Skills</span>
						<span className='ml-1'>({builtins.length})</span>
					</div>
					<div className='space-y-1.5'>
						{builtins.map((skill) => (
							<div
								key={skill.name}
								className='flex items-center gap-3 rounded-radius-lg border border-border-subtle bg-surface-base p-3 transition-all hover:border-border-default'
							>
								<div className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-radius-sm bg-gradient-to-br from-violet-500/15 to-blue-500/15'>
									<IconPuzzle size={14} className='text-violet-400/70' />
								</div>
								<div className='min-w-0 flex-1'>
									<span className='text-body-sm font-medium text-text-primary'>{skill.name}</span>
									{skill.description && (
										<p className='mt-0.5 truncate text-caption-sm text-text-tertiary'>{skill.description}</p>
									)}
								</div>
								<span className='flex-shrink-0 rounded-radius-sm bg-surface-1 px-1.5 py-0.5 text-caption-sm text-text-tertiary'>
									{skill.type}
								</span>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Empty state */}
			{installed.length === 0 && builtins.length === 0 && (
				<div className='flex flex-col items-center justify-center py-16 text-text-tertiary'>
					<IconPuzzleOff size={28} className='mb-3' />
					<p className='text-body-sm font-medium'>No skills loaded</p>
					<p className='mt-1 text-caption-sm'>Browse the Marketplace to install skills</p>
				</div>
			)}
		</div>
	)
}

// ─── Registries Tab ─────────────────────────────────────────────

function RegistriesTab() {
	const [registries, setRegistries] = useState<string[]>([])
	const [loading, setLoading] = useState(true)
	const [newUrl, setNewUrl] = useState('')
	const [adding, setAdding] = useState(false)
	const [error, setError] = useState('')

	const fetchRegistries = useCallback(async () => {
		try {
			const data = await skillFetch<{registries: string[]}>('/registries')
			setRegistries(data.registries || [])
		} catch (err) {
			console.error('Failed to fetch registries:', err)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchRegistries()
	}, [fetchRegistries])

	const handleAdd = async () => {
		if (!newUrl.trim()) return
		setError('')
		setAdding(true)
		try {
			const result = await skillFetch<{success: boolean; registries: string[]; error?: string}>('/registries', {
				method: 'POST',
				body: JSON.stringify({url: newUrl.trim()}),
			})
			if (result.registries) setRegistries(result.registries)
			setNewUrl('')
		} catch (err: any) {
			setError(err.message || 'Failed to add registry')
		} finally {
			setAdding(false)
		}
	}

	const handleRemove = async (url: string) => {
		try {
			const result = await skillFetch<{success: boolean; registries: string[]}>('/registries', {
				method: 'DELETE',
				body: JSON.stringify({url}),
			})
			if (result.registries) setRegistries(result.registries)
		} catch (err) {
			console.error('Failed to remove registry:', err)
		}
	}

	if (loading) {
		return (
			<div className='flex items-center justify-center py-16'>
				<IconLoader2 size={20} className='animate-spin text-text-tertiary' />
			</div>
		)
	}

	return (
		<div className='p-4'>
			<p className='mb-4 text-caption leading-relaxed text-text-tertiary'>
				Registries are GitHub repositories that contain skill packages.
				LivHub fetches SKILL.md manifests from each registry&apos;s <code className='rounded bg-surface-2 px-1 py-0.5 text-caption-sm'>skills/</code> directory.
			</p>

			{/* Add registry form */}
			<div className='mb-5 flex gap-2'>
				<input
					type='text'
					value={newUrl}
					onChange={(e) => setNewUrl(e.target.value)}
					placeholder='https://github.com/user/repo'
					className='flex-1 rounded-radius-lg border border-border-default bg-surface-base py-2.5 px-3 text-body-sm text-text-primary placeholder-text-tertiary outline-none transition-colors focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20'
					onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
				/>
				<button
					onClick={handleAdd}
					disabled={adding || !newUrl.trim()}
					className='flex items-center gap-1.5 rounded-radius-lg bg-brand px-4 py-2 text-body-sm font-medium text-white transition-all hover:bg-brand-lighter disabled:opacity-40'
				>
					{adding ? <IconLoader2 size={14} className='animate-spin' /> : <IconPlus size={14} />}
					Add
				</button>
			</div>

			{error && (
				<div className='mb-4 flex items-start gap-2 rounded-radius-lg bg-red-500/10 px-3 py-2.5 text-caption text-red-400'>
					<IconAlertCircle size={14} className='mt-0.5 flex-shrink-0' />
					<span>{error}</span>
				</div>
			)}

			{/* Registry list */}
			<div className='space-y-2'>
				{registries.length === 0 ? (
					<div className='py-8 text-center text-caption text-text-tertiary'>
						No registries configured. Add a GitHub repository URL above.
					</div>
				) : (
					registries.map((url) => {
						// Parse owner/repo from URL
						const match = url.match(/github\.com\/([^/]+\/[^/]+)/)
						const repoName = match ? match[1] : url
						return (
							<div key={url} className='flex items-center gap-3 rounded-radius-lg border border-border-subtle bg-surface-base p-3 transition-all hover:border-border-default'>
								<div className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-radius-sm bg-surface-2'>
									<IconDatabase size={14} className='text-text-tertiary' />
								</div>
								<div className='min-w-0 flex-1'>
									<span className='text-body-sm font-medium text-text-primary'>{repoName}</span>
									<p className='truncate text-caption-sm text-text-tertiary'>{url}</p>
								</div>
								<button
									onClick={() => handleRemove(url)}
									className='rounded-radius-sm p-1.5 text-text-tertiary transition-all hover:bg-red-500/10 hover:text-red-400'
									title='Remove registry'
								>
									<IconTrash size={15} />
								</button>
							</div>
						)
					})
				)}
			</div>
		</div>
	)
}

// ─── Main Skills Panel (LivHub) ─────────────────────────────────

type SkillTab = 'marketplace' | 'installed' | 'registries'

export default function SkillsPanel() {
	const [activeTab, setActiveTab] = useState<SkillTab>('installed')
	const [installedNames, setInstalledNames] = useState<Set<string>>(new Set())

	const refreshInstalledNames = useCallback(() => {
		skillFetch<{skills: InstalledSkill[]}>('/installed')
			.then((data) => {
				setInstalledNames(new Set((data.skills || []).map((s) => s.name)))
			})
			.catch(() => {})
	}, [])

	useEffect(() => {
		refreshInstalledNames()
	}, [activeTab, refreshInstalledNames])

	const tabs: {id: SkillTab; label: string; icon: React.ReactNode}[] = [
		{id: 'marketplace', label: 'Marketplace', icon: <IconSearch size={13} />},
		{id: 'installed', label: 'Installed', icon: <IconPuzzle size={13} />},
		{id: 'registries', label: 'Registries', icon: <IconDatabase size={13} />},
	]

	return (
		<div className='flex h-full flex-col bg-surface-base'>
			{/* Sticky header */}
			<div className='flex-shrink-0 border-b border-border-subtle px-5 py-4'>
				<div className='flex items-center gap-3'>
					<div className='flex h-9 w-9 items-center justify-center rounded-radius-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20'>
						<IconPuzzle size={18} className='text-indigo-400' />
					</div>
					<div>
						<h2 className='text-body font-semibold text-text-primary'>LivHub</h2>
						<p className='text-caption-sm leading-relaxed text-text-tertiary'>
							Discover and manage skills that extend Liv&apos;s capabilities.
						</p>
					</div>
				</div>
			</div>

			{/* Tab bar */}
			<div className='flex flex-shrink-0 border-b border-border-subtle'>
				{tabs.map((tab) => (
					<button
						key={tab.id}
						onClick={() => setActiveTab(tab.id)}
						className={cn(
							'flex items-center gap-1.5 px-4 py-2.5 text-caption font-medium transition-all',
							activeTab === tab.id
								? 'border-b-2 border-brand text-text-primary'
								: 'text-text-tertiary hover:text-text-secondary',
						)}
					>
						{tab.icon}
						{tab.label}
					</button>
				))}
			</div>

			{/* Tab content */}
			<div className='min-h-0 flex-1 overflow-y-auto'>
				{activeTab === 'marketplace' && (
					<MarketplaceTab
						installedNames={installedNames}
						onInstallComplete={refreshInstalledNames}
					/>
				)}
				{activeTab === 'installed' && (
					<InstalledTab onUninstalled={refreshInstalledNames} />
				)}
				{activeTab === 'registries' && <RegistriesTab />}
			</div>
		</div>
	)
}
