import {useCallback, useEffect, useMemo, useState} from 'react'
import {
	IconSearch,
	IconPlug,
	IconPlugOff,
	IconRefresh,
	IconTrash,
	IconDownload,
	IconSettings,
	IconCode,
	IconCircleFilled,
	IconLoader2,
	IconChevronDown,
	IconChevronRight,
	IconX,
	IconCheck,
	IconAlertCircle,
	IconStar,
	IconWorld,
	IconTerminal2,
	IconBrandGithub,
	IconDatabase,
	IconBrowser,
	IconCloudSearch,
	IconFileSearch,
	IconBrain,
	IconApi,
	IconExternalLink,
	IconCloud,
	IconGitBranch,
	IconNote,
	IconBrandMongodb,
} from '@tabler/icons-react'
import {cn} from '@/shadcn-lib/utils'

// ─── Types ──────────────────────────────────────────────────────

type McpServerConfig = {
	name: string
	transport: 'stdio' | 'streamableHttp'
	command?: string
	args?: string[]
	env?: Record<string, string>
	url?: string
	headers?: Record<string, string>
	enabled: boolean
	description?: string
	installedFrom?: string
	installedAt: number
}

type McpServerStatus = {
	running: boolean
	tools: string[]
	connectedAt?: number
	lastError?: string
}

type RegistryServer = {
	name: string
	description?: string
	version?: string
	repository?: {url?: string; source?: string}
	packages?: Array<{
		registryType: string
		identifier: string
		version?: string
		transport?: {type: string}
		environmentVariables?: Array<{
			name: string
			description?: string
			isSecret?: boolean
		}>
	}>
	remotes?: Array<{
		type: string
		url: string
	}>
}

// ─── Featured / Popular MCPs ────────────────────────────────────

type FeaturedMcp = {
	name: string
	displayName: string
	description: string
	category: string
	icon: 'search' | 'github' | 'database' | 'browser' | 'filesystem' | 'brain' | 'api' | 'cloud' | 'world' | 'git' | 'note' | 'mongodb'
	gradient: string
	npmPackage?: string
	remoteUrl?: string
	transport: 'stdio' | 'streamableHttp'
	customCommand?: string
	customArgs?: string[]
}

const FEATURED_MCPS: FeaturedMcp[] = [
	{
		name: 'brave-search',
		displayName: 'Brave Search',
		description: 'Web and local search using the Brave Search API',
		category: 'Search',
		icon: 'search',
		gradient: 'from-orange-500/30 to-red-500/30',
		npmPackage: '@modelcontextprotocol/server-brave-search',
		transport: 'stdio',
	},
	{
		name: 'github',
		displayName: 'GitHub',
		description: 'Repository management, file operations, issues, and pull requests',
		category: 'Dev Tools',
		icon: 'github',
		gradient: 'from-gray-500/30 to-slate-500/30',
		npmPackage: '@modelcontextprotocol/server-github',
		transport: 'stdio',
	},
	{
		name: 'filesystem',
		displayName: 'Filesystem',
		description: 'Secure file operations with configurable access controls',
		category: 'File System',
		icon: 'filesystem',
		gradient: 'from-blue-500/30 to-cyan-500/30',
		npmPackage: '@modelcontextprotocol/server-filesystem',
		transport: 'stdio',
	},
	{
		name: 'puppeteer',
		displayName: 'Puppeteer',
		description: 'Browser automation and web scraping with screenshots',
		category: 'Browser',
		icon: 'browser',
		gradient: 'from-green-500/30 to-emerald-500/30',
		npmPackage: '@modelcontextprotocol/server-puppeteer',
		transport: 'stdio',
	},
	{
		name: 'postgres',
		displayName: 'PostgreSQL',
		description: 'Read-only access to PostgreSQL databases with schema inspection',
		category: 'Database',
		icon: 'database',
		gradient: 'from-indigo-500/30 to-blue-500/30',
		npmPackage: '@modelcontextprotocol/server-postgres',
		transport: 'stdio',
	},
	{
		name: 'memory',
		displayName: 'Memory',
		description: 'Knowledge graph-based persistent memory system',
		category: 'AI',
		icon: 'brain',
		gradient: 'from-purple-500/30 to-pink-500/30',
		npmPackage: '@modelcontextprotocol/server-memory',
		transport: 'stdio',
	},
	{
		name: 'sequential-thinking',
		displayName: 'Sequential Thinking',
		description: 'Dynamic problem-solving through thought sequences',
		category: 'AI',
		icon: 'brain',
		gradient: 'from-violet-500/30 to-fuchsia-500/30',
		npmPackage: '@modelcontextprotocol/server-sequential-thinking',
		transport: 'stdio',
	},
	{
		name: 'fetch',
		displayName: 'Fetch',
		description: 'Web content fetching and conversion for efficient LLM usage',
		category: 'Web',
		icon: 'world',
		gradient: 'from-teal-500/30 to-cyan-500/30',
		npmPackage: '@modelcontextprotocol/server-fetch',
		transport: 'stdio',
	},
	{
		name: 'slack',
		displayName: 'Slack',
		description: 'Channel management, messaging, and thread replies',
		category: 'Productivity',
		icon: 'api',
		gradient: 'from-yellow-500/30 to-amber-500/30',
		npmPackage: '@modelcontextprotocol/server-slack',
		transport: 'stdio',
	},
	{
		name: 'google-maps',
		displayName: 'Google Maps',
		description: 'Location services, directions, and place details',
		category: 'Web',
		icon: 'world',
		gradient: 'from-emerald-500/30 to-green-500/30',
		npmPackage: '@modelcontextprotocol/server-google-maps',
		transport: 'stdio',
	},
	{
		name: 'sentry',
		displayName: 'Sentry',
		description: 'Error tracking, issue management, and performance insights',
		category: 'Dev Tools',
		icon: 'api',
		gradient: 'from-rose-500/30 to-pink-500/30',
		npmPackage: '@modelcontextprotocol/server-sentry',
		transport: 'stdio',
	},
	{
		name: 'sqlite',
		displayName: 'SQLite',
		description: 'Database interaction and business intelligence capabilities',
		category: 'Database',
		icon: 'database',
		gradient: 'from-sky-500/30 to-blue-500/30',
		npmPackage: '@modelcontextprotocol/server-sqlite',
		transport: 'stdio',
	},
	{
		name: 'chrome',
		displayName: 'Chrome',
		description: 'Control Chrome browser on your server. Navigate pages, click elements, fill forms, take screenshots, and extract content.',
		category: 'Browser',
		icon: 'browser',
		gradient: 'from-blue-500/30 to-green-500/30',
		transport: 'stdio',
		customCommand: 'docker',
		customArgs: ['exec', '-i', 'chromium_server_1', 'npx', '-y', '@playwright/mcp@latest', '--cdp-endpoint', 'http://localhost:9222'],
	},
	{
		name: 'git',
		displayName: 'Git',
		description: 'Read, search, and manipulate Git repositories with commit management',
		category: 'Dev Tools',
		icon: 'git',
		gradient: 'from-orange-500/30 to-amber-500/30',
		npmPackage: '@modelcontextprotocol/server-git',
		transport: 'stdio',
	},
	{
		name: 'notion',
		displayName: 'Notion',
		description: 'Read/write access to Notion pages, databases, and documents',
		category: 'Productivity',
		icon: 'note',
		gradient: 'from-neutral-400/30 to-stone-500/30',
		npmPackage: '@notionhq/notion-mcp-server',
		transport: 'stdio',
	},
	{
		name: 'mongodb',
		displayName: 'MongoDB',
		description: 'Document database operations and Atlas integration',
		category: 'Database',
		icon: 'mongodb',
		gradient: 'from-green-600/30 to-emerald-500/30',
		npmPackage: '@1rb/mongo-mcp',
		transport: 'stdio',
	},
	{
		name: 'cloudflare',
		displayName: 'Cloudflare',
		description: 'Manage Workers, KV, R2, D1, and DNS across Cloudflare platform',
		category: 'Cloud',
		icon: 'cloud',
		gradient: 'from-amber-500/30 to-orange-400/30',
		npmPackage: '@cloudflare/mcp-server-cloudflare',
		transport: 'stdio',
	},
	{
		name: 'tavily-search',
		displayName: 'Tavily Search',
		description: 'Real-time web search and content extraction with citations',
		category: 'Search',
		icon: 'search',
		gradient: 'from-cyan-500/30 to-blue-500/30',
		npmPackage: 'tavily-mcp',
		transport: 'stdio',
	},
]

const ICON_MAP: Record<FeaturedMcp['icon'], React.ElementType> = {
	search: IconCloudSearch,
	github: IconBrandGithub,
	database: IconDatabase,
	browser: IconBrowser,
	filesystem: IconFileSearch,
	brain: IconBrain,
	api: IconApi,
	cloud: IconCloud,
	world: IconWorld,
	git: IconGitBranch,
	note: IconNote,
	mongodb: IconBrandMongodb,
}

const CATEGORY_COLORS: Record<string, string> = {
	Search: 'bg-orange-500/15 text-orange-300',
	'Dev Tools': 'bg-gray-500/15 text-gray-300',
	'File System': 'bg-blue-500/15 text-blue-300',
	Browser: 'bg-green-500/15 text-green-300',
	Database: 'bg-indigo-500/15 text-indigo-300',
	AI: 'bg-purple-500/15 text-purple-300',
	Web: 'bg-teal-500/15 text-teal-300',
	Productivity: 'bg-yellow-500/15 text-yellow-300',
	Cloud: 'bg-amber-500/15 text-amber-300',
}

// ─── API helpers ────────────────────────────────────────────────

const API_BASE = '/api/mcp'

async function mcpFetch<T>(path: string, options?: RequestInit): Promise<T> {
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

function sanitizeName(registryName: string): string {
	const parts = registryName.split('/')
	let base = parts[parts.length - 1] || registryName
	base = base.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
	base = base.replace(/^[-_]+/, '')
	if (!base || !/^[a-z0-9]/.test(base)) {
		base = 'mcp-' + base
	}
	return base || 'mcp-server'
}

function deriveInstallDefaults(server: RegistryServer) {
	const npmPkg = server.packages?.find((p) => p.registryType === 'npm')
	if (npmPkg) {
		return {transport: 'stdio' as const, command: 'npx', args: `-y ${npmPkg.identifier}`, url: ''}
	}
	const stdioPkg = server.packages?.find((p) => p.transport?.type === 'stdio')
	if (stdioPkg) {
		return {transport: 'stdio' as const, command: 'npx', args: `-y ${stdioPkg.identifier}`, url: ''}
	}
	const httpRemote = server.remotes?.find((r) => r.type === 'streamable-http' || r.type === 'http')
	if (httpRemote) {
		return {transport: 'streamableHttp' as const, command: '', args: '', url: httpRemote.url}
	}
	return {
		transport: 'stdio' as const,
		command: 'npx',
		args: server.packages?.[0]?.identifier ? `-y ${server.packages[0].identifier}` : '',
		url: '',
	}
}

/** Strip the mcp_serverName_ prefix from tool names for display */
function cleanToolName(fullName: string, serverName: string): string {
	const prefix = `mcp_${serverName}_`
	if (fullName.startsWith(prefix)) {
		return fullName.slice(prefix.length)
	}
	return fullName
}

// ─── Featured Card ──────────────────────────────────────────────

function FeaturedCard({
	mcp,
	installed,
	onInstall,
}: {
	mcp: FeaturedMcp
	installed: boolean
	onInstall: () => void
}) {
	const IconComponent = ICON_MAP[mcp.icon] || IconPlug
	const catColor = CATEGORY_COLORS[mcp.category] || 'bg-surface-2 text-text-secondary'

	return (
		<div className='group relative flex flex-col gap-3 rounded-radius-xl border border-border-subtle bg-surface-base p-4 transition-all hover:border-border-emphasis hover:bg-surface-1'>
			<div className='flex items-start gap-3'>
				<div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-radius-lg bg-gradient-to-br ${mcp.gradient}`}>
					<IconComponent size={20} className='text-text-primary' />
				</div>
				<div className='min-w-0 flex-1'>
					<div className='flex items-center gap-2'>
						<span className='truncate text-body-sm font-semibold text-text-primary'>{mcp.displayName}</span>
						<span className={`flex-shrink-0 rounded-radius-sm px-1.5 py-0.5 text-caption-sm font-medium ${catColor}`}>
							{mcp.category}
						</span>
					</div>
					<p className='mt-1 line-clamp-2 text-caption leading-relaxed text-text-tertiary'>
						{mcp.description}
					</p>
				</div>
			</div>
			<div className='flex items-center justify-between'>
				<span className='font-mono text-caption-sm text-text-tertiary'>
					{mcp.npmPackage || mcp.remoteUrl || mcp.name}
				</span>
				{installed ? (
					<span className='flex items-center gap-1 rounded-radius-sm bg-green-500/10 px-2.5 py-1 text-caption-sm font-medium text-green-400'>
						<IconCheck size={12} />
						Installed
					</span>
				) : (
					<button
						onClick={onInstall}
						className='flex items-center gap-1 rounded-radius-sm bg-surface-2 px-2.5 py-1 text-caption-sm font-medium text-text-secondary transition-all hover:bg-surface-3 hover:text-text-primary'
					>
						<IconDownload size={12} />
						Install
					</button>
				)}
			</div>
		</div>
	)
}

// ─── Marketplace Tab ────────────────────────────────────────────

function MarketplaceTab({
	onInstall,
	onInstallFeatured,
	installedNames,
}: {
	onInstall: (server: RegistryServer) => void
	onInstallFeatured: (mcp: FeaturedMcp) => void
	installedNames: Set<string>
}) {
	const [query, setQuery] = useState('')
	const [results, setResults] = useState<RegistryServer[]>([])
	const [loading, setLoading] = useState(false)
	const [hasSearched, setHasSearched] = useState(false)

	const search = useCallback(async (q: string) => {
		setLoading(true)
		setHasSearched(true)
		try {
			const params = new URLSearchParams()
			if (q) params.set('q', q)
			params.set('limit', '30')
			const data = await mcpFetch<{servers: RegistryServer[]}>(`/registry/search?${params}`)
			// Deduplicate by name (registry can return duplicates)
			const unique = (data.servers || []).filter((s, i, arr) => arr.findIndex(x => x.name === s.name) === i)
			setResults(unique)
		} catch (err: any) {
			console.error('Registry search error:', err)
			setResults([])
		} finally {
			setLoading(false)
		}
	}, [])

	// Debounced search
	useEffect(() => {
		if (!query.trim()) {
			setHasSearched(false)
			setResults([])
			return
		}
		const timer = setTimeout(() => search(query), 400)
		return () => clearTimeout(timer)
	}, [query, search])

	return (
		<div className='flex flex-col'>
			{/* Search */}
			<div className='border-b border-border-subtle px-4 py-3'>
				<div className='relative'>
					<IconSearch size={15} className='absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary' />
					<input
						type='text'
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder='Search MCP registry...'
						className='w-full rounded-radius-lg border border-border-default bg-surface-base py-2.5 pl-9 pr-3 text-body-sm text-text-primary placeholder-text-tertiary outline-none transition-colors focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20'
					/>
					{loading && (
						<IconLoader2 size={14} className='absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-text-tertiary' />
					)}
				</div>
			</div>

			<div>
				{/* Show search results when searching */}
				{hasSearched ? (
					<div className='p-4'>
						{loading && results.length === 0 ? (
							<div className='flex items-center justify-center py-16'>
								<IconLoader2 size={20} className='animate-spin text-text-tertiary' />
							</div>
						) : results.length === 0 ? (
							<div className='py-16 text-center'>
								<IconSearch size={24} className='mx-auto mb-2 text-text-tertiary' />
								<p className='text-body-sm text-text-tertiary'>No servers found for "{query}"</p>
							</div>
						) : (
							<div className='space-y-1.5'>
								{results.map((server) => (
									<div
										key={server.name}
										className='flex items-center gap-3 rounded-radius-lg border border-border-subtle bg-surface-base p-3 transition-all hover:border-border-default hover:bg-surface-1'
									>
										<div className='flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-radius-sm bg-gradient-to-br from-blue-500/15 to-violet-500/15'>
											<IconPlug size={16} className='text-blue-400/70' />
										</div>
										<div className='min-w-0 flex-1'>
											<div className='flex items-center gap-2'>
												<span className='truncate text-body-sm font-medium text-text-primary'>{server.name}</span>
											</div>
											{server.description && (
												<p className='mt-0.5 truncate text-caption-sm text-text-tertiary'>{server.description}</p>
											)}
											{server.packages?.[0] && (
												<p className='mt-0.5 truncate font-mono text-caption-sm text-text-tertiary'>
													{server.packages[0].identifier}
												</p>
											)}
										</div>
										<button
											onClick={() => onInstall(server)}
											className='flex flex-shrink-0 items-center gap-1.5 rounded-radius-sm bg-surface-1 px-3 py-1.5 text-caption-sm font-medium text-text-secondary transition-all hover:bg-surface-3 hover:text-text-primary'
										>
											<IconDownload size={13} />
											Install
										</button>
									</div>
								))}
							</div>
						)}
					</div>
				) : (
					/* Featured / Popular section */
					<div className='p-4'>
						<div className='mb-4 flex items-center gap-2'>
							<IconStar size={14} className='text-amber-400/70' />
							<span className='text-caption font-semibold uppercase tracking-wide text-text-tertiary'>Popular Servers</span>
						</div>
						<div className='grid grid-cols-1 gap-2.5 xl:grid-cols-2'>
							{FEATURED_MCPS.map((mcp) => (
								<FeaturedCard
									key={mcp.name}
									mcp={mcp}
									installed={installedNames.has(mcp.name)}
									onInstall={() => onInstallFeatured(mcp)}
								/>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

// ─── Install Dialog ─────────────────────────────────────────────

function InstallDialog({
	server,
	featured,
	onClose,
	onInstalled,
}: {
	server?: RegistryServer | null
	featured?: FeaturedMcp | null
	onClose: () => void
	onInstalled: () => void
}) {
	const [transport, setTransport] = useState<'stdio' | 'streamableHttp'>('stdio')
	const [name, setName] = useState('')
	const [command, setCommand] = useState('npx')
	const [args, setArgs] = useState('')
	const [url, setUrl] = useState('')
	const [description, setDescription] = useState('')
	const [envVars, setEnvVars] = useState<Array<{key: string; value: string}>>([])
	const [installing, setInstalling] = useState(false)
	const [error, setError] = useState('')

	useEffect(() => {
		if (featured) {
			setName(featured.name)
			setDescription(featured.description)
			setTransport(featured.transport)
			if (featured.customCommand) {
				setCommand(featured.customCommand)
				setArgs(featured.customArgs?.join(' ') || '')
			} else if (featured.transport === 'stdio') {
				setCommand('npx')
				setArgs(`-y ${featured.npmPackage || featured.name}`)
			} else if (featured.remoteUrl) {
				setUrl(featured.remoteUrl)
			}
		} else if (server) {
			setName(sanitizeName(server.name))
			setDescription(server.description || '')
			const defaults = deriveInstallDefaults(server)
			setTransport(defaults.transport)
			setCommand(defaults.command)
			setArgs(defaults.args)
			setUrl(defaults.url)

			// Extract env vars from registry
			const pkg = server.packages?.[0]
			if (pkg?.environmentVariables) {
				setEnvVars(
					pkg.environmentVariables.map((ev) => ({
						key: ev.name,
						value: '',
					})),
				)
			}
		}
	}, [server, featured])

	if (!server && !featured) return null

	const sourceName = featured?.displayName || server?.name || ''

	const handleInstall = async () => {
		setError('')
		setInstalling(true)
		try {
			const body: Record<string, unknown> = {
				name,
				transport,
				description,
				installedFrom: featured?.name || server?.name,
			}
			if (transport === 'stdio') {
				body.command = command
				body.args = args.split(/\s+/).filter(Boolean)
				// Add env vars if any have values
				const env: Record<string, string> = {}
				for (const ev of envVars) {
					if (ev.key && ev.value) env[ev.key] = ev.value
				}
				if (Object.keys(env).length > 0) body.env = env
			} else {
				body.url = url
			}
			await mcpFetch('/servers', {method: 'POST', body: JSON.stringify(body)})
			onInstalled()
			onClose()
		} catch (err: any) {
			setError(err.message)
		} finally {
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
						<div className='flex h-9 w-9 items-center justify-center rounded-radius-lg bg-gradient-to-br from-violet-500/20 to-blue-500/20'>
							<IconDownload size={18} className='text-violet-400' />
						</div>
						<div>
							<h3 className='text-body font-semibold text-text-primary'>Install Server</h3>
							<p className='text-caption-sm text-text-tertiary'>{sourceName}</p>
						</div>
					</div>
					<button onClick={onClose} className='rounded-radius-sm p-1.5 text-text-tertiary transition-colors hover:bg-surface-1 hover:text-text-secondary'>
						<IconX size={16} />
					</button>
				</div>

				<div className='space-y-4'>
					{/* Name */}
					<div>
						<label className='mb-1.5 block text-caption-sm font-medium uppercase tracking-wide text-text-tertiary'>Name</label>
						<input
							type='text'
							value={name}
							onChange={(e) => setName(e.target.value)}
							className='w-full rounded-radius-lg border border-border-default bg-surface-base px-3 py-2 text-body-sm text-text-primary placeholder-text-tertiary outline-none transition-colors focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20'
						/>
					</div>

					{/* Transport */}
					<div>
						<label className='mb-1.5 block text-caption-sm font-medium uppercase tracking-wide text-text-tertiary'>Transport</label>
						<div className='flex gap-2'>
							{(['stdio', 'streamableHttp'] as const).map((t) => (
								<button
									key={t}
									onClick={() => setTransport(t)}
									className={cn(
										'flex items-center gap-1.5 rounded-radius-sm px-3 py-2 text-caption font-medium transition-all',
										transport === t
											? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30'
											: 'bg-surface-base text-text-tertiary hover:bg-surface-2 hover:text-text-secondary',
									)}
								>
									{t === 'stdio' ? (
										<>
											<IconTerminal2 size={14} />
											Stdio (CLI)
										</>
									) : (
										<>
											<IconWorld size={14} />
											HTTP
										</>
									)}
								</button>
							))}
						</div>
					</div>

					{/* Stdio fields */}
					{transport === 'stdio' && (
						<>
							<div>
								<label className='mb-1.5 block text-caption-sm font-medium uppercase tracking-wide text-text-tertiary'>Command</label>
								<input
									type='text'
									value={command}
									onChange={(e) => setCommand(e.target.value)}
									placeholder='npx'
									className='w-full rounded-radius-lg border border-border-default bg-surface-base px-3 py-2 font-mono text-body-sm text-text-primary placeholder-text-tertiary outline-none transition-colors focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20'
								/>
							</div>
							<div>
								<label className='mb-1.5 block text-caption-sm font-medium uppercase tracking-wide text-text-tertiary'>Arguments</label>
								<input
									type='text'
									value={args}
									onChange={(e) => setArgs(e.target.value)}
									placeholder='-y @modelcontextprotocol/server-name'
									className='w-full rounded-radius-lg border border-border-default bg-surface-base px-3 py-2 font-mono text-body-sm text-text-primary placeholder-text-tertiary outline-none transition-colors focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20'
								/>
							</div>
						</>
					)}

					{/* HTTP fields */}
					{transport === 'streamableHttp' && (
						<div>
							<label className='mb-1.5 block text-caption-sm font-medium uppercase tracking-wide text-text-tertiary'>Server URL</label>
							<input
								type='text'
								value={url}
								onChange={(e) => setUrl(e.target.value)}
								placeholder='https://mcp.example.com/mcp'
								className='w-full rounded-radius-lg border border-border-default bg-surface-base px-3 py-2 font-mono text-body-sm text-text-primary placeholder-text-tertiary outline-none transition-colors focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20'
							/>
						</div>
					)}

					{/* Env vars */}
					{envVars.length > 0 && (
						<div>
							<label className='mb-1.5 block text-caption-sm font-medium uppercase tracking-wide text-text-tertiary'>
								Environment Variables
							</label>
							<div className='space-y-2'>
								{envVars.map((ev, idx) => (
									<div key={ev.key} className='flex gap-2'>
										<span className='flex min-w-[140px] items-center rounded-radius-sm bg-surface-base px-2.5 font-mono text-caption-sm text-text-tertiary'>
											{ev.key}
										</span>
										<input
											type='text'
											value={ev.value}
											onChange={(e) => {
												const next = [...envVars]
												next[idx] = {...ev, value: e.target.value}
												setEnvVars(next)
											}}
											placeholder='Enter value...'
											className='flex-1 rounded-radius-sm border border-border-default bg-surface-base px-2.5 py-1.5 font-mono text-caption text-text-primary placeholder-text-tertiary outline-none transition-colors focus-visible:border-brand'
										/>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Description */}
					<div>
						<label className='mb-1.5 block text-caption-sm font-medium uppercase tracking-wide text-text-tertiary'>Description</label>
						<input
							type='text'
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder='Optional description'
							className='w-full rounded-radius-lg border border-border-default bg-surface-base px-3 py-2 text-body-sm text-text-primary placeholder-text-tertiary outline-none transition-colors focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20'
						/>
					</div>

					{/* Error */}
					{error && (
						<div className='flex items-start gap-2 rounded-radius-lg bg-red-500/10 px-3 py-2.5 text-caption text-red-400'>
							<IconAlertCircle size={14} className='mt-0.5 flex-shrink-0' />
							<span>{error}</span>
						</div>
					)}

					{/* Actions */}
					<div className='flex justify-end gap-2 pt-1'>
						<button
							onClick={onClose}
							className='rounded-radius-lg bg-surface-1 px-4 py-2 text-body-sm font-medium text-text-secondary transition-all hover:bg-surface-2 hover:text-text-primary'
						>
							Cancel
						</button>
						<button
							onClick={handleInstall}
							disabled={installing || !name}
							className='flex items-center gap-2 rounded-radius-lg bg-brand px-5 py-2 text-body-sm font-semibold text-white transition-all hover:bg-brand-lighter disabled:opacity-40'
						>
							{installing ? <IconLoader2 size={14} className='animate-spin' /> : <IconDownload size={14} />}
							Install
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}

// ─── Installed Tab ──────────────────────────────────────────────

function InstalledTab() {
	const [servers, setServers] = useState<McpServerConfig[]>([])
	const [statuses, setStatuses] = useState<Record<string, McpServerStatus>>({})
	const [loading, setLoading] = useState(true)
	const [actionLoading, setActionLoading] = useState<string | null>(null)
	const [expanded, setExpanded] = useState<string | null>(null)

	const fetchServers = useCallback(async () => {
		try {
			const data = await mcpFetch<{servers: McpServerConfig[]; statuses: Record<string, McpServerStatus>}>(
				'/servers',
			)
			setServers(data.servers || [])
			setStatuses(data.statuses || {})
		} catch (err) {
			console.error('Failed to fetch servers:', err)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchServers()
		// Auto-refresh every 10 seconds
		const interval = setInterval(fetchServers, 10000)
		return () => clearInterval(interval)
	}, [fetchServers])

	const handleAction = async (name: string, action: 'restart' | 'toggle' | 'remove', enabled?: boolean) => {
		if (action === 'remove' && !confirm(`Remove server "${name}"?`)) return
		setActionLoading(name)
		try {
			if (action === 'restart') {
				await mcpFetch(`/servers/${encodeURIComponent(name)}/restart`, {method: 'POST'})
				await new Promise((r) => setTimeout(r, 1500))
			} else if (action === 'toggle') {
				await mcpFetch(`/servers/${encodeURIComponent(name)}`, {
					method: 'PUT',
					body: JSON.stringify({enabled}),
				})
			} else if (action === 'remove') {
				await mcpFetch(`/servers/${encodeURIComponent(name)}`, {method: 'DELETE'})
			}
			await fetchServers()
		} catch (err) {
			console.error(`${action} error:`, err)
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

	if (servers.length === 0) {
		return (
			<div className='flex flex-col items-center justify-center py-16 text-text-tertiary'>
				<IconPlugOff size={28} className='mb-3' />
				<p className='text-body-sm font-medium'>No servers installed</p>
				<p className='mt-1 text-caption-sm text-text-tertiary'>Browse the Marketplace to add MCP servers</p>
			</div>
		)
	}

	return (
		<div className='space-y-2 p-4'>
			{/* Summary bar */}
			<div className='mb-3 flex items-center gap-4 text-caption-sm text-text-tertiary'>
				<span>{servers.length} server{servers.length !== 1 && 's'}</span>
				<span className='flex items-center gap-1'>
					<IconCircleFilled size={6} className='text-green-400' />
					{Object.values(statuses).filter((s) => s.running).length} running
				</span>
				<span>{Object.values(statuses).reduce((sum, s) => sum + (s.tools?.length || 0), 0)} tools</span>
				<button onClick={fetchServers} className='ml-auto rounded-radius-sm p-1 text-text-tertiary transition-colors hover:bg-surface-1 hover:text-text-secondary'>
					<IconRefresh size={13} />
				</button>
			</div>

			{servers.map((server) => {
				const status = statuses[server.name]
				const isRunning = status?.running
				const isExpanded = expanded === server.name
				const isLoading = actionLoading === server.name
				const toolCount = status?.tools?.length || 0

				return (
					<div
						key={server.name}
						className='rounded-radius-lg border border-border-subtle bg-surface-base transition-all hover:border-border-default'
					>
						{/* Header row */}
						<div className='flex items-center gap-3 px-3.5 py-3'>
							<button
								onClick={() => setExpanded(isExpanded ? null : server.name)}
								className='text-text-tertiary transition-colors hover:text-text-secondary'
							>
								{isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
							</button>

							{/* Status dot */}
							<div className='relative flex-shrink-0'>
								<IconCircleFilled
									size={8}
									className={
										isRunning
											? 'text-green-400'
											: server.enabled
												? 'text-amber-400'
												: 'text-text-tertiary'
									}
								/>
								{isRunning && (
									<span className='absolute inset-0 animate-ping'>
										<IconCircleFilled size={8} className='text-green-400 opacity-40' />
									</span>
								)}
							</div>

							<div className='min-w-0 flex-1'>
								<div className='flex items-center gap-2'>
									<span className='truncate text-body-sm font-medium text-text-primary'>{server.name}</span>
									<span className='flex items-center gap-1 rounded-radius-sm bg-surface-1 px-1.5 py-0.5 text-caption-sm font-medium text-text-tertiary'>
										{server.transport === 'stdio' ? (
											<>
												<IconTerminal2 size={10} />
												stdio
											</>
										) : (
											<>
												<IconWorld size={10} />
												http
											</>
										)}
									</span>
								</div>
								{server.description && (
									<p className='mt-0.5 truncate text-caption-sm text-text-tertiary'>{server.description}</p>
								)}
							</div>

							{/* Tool count */}
							{toolCount > 0 && (
								<span className='flex items-center gap-1 text-caption-sm text-text-tertiary'>
									<IconCode size={12} />
									{toolCount}
								</span>
							)}

							{/* Actions */}
							<div className='flex items-center gap-0.5'>
								{isLoading ? (
									<IconLoader2 size={14} className='animate-spin text-text-tertiary' />
								) : (
									<>
										<button
											onClick={() => handleAction(server.name, 'toggle', !server.enabled)}
											className={cn(
												'rounded-radius-sm p-1.5 transition-all',
												server.enabled
													? 'text-green-400/70 hover:bg-green-500/10 hover:text-green-400'
													: 'text-text-tertiary hover:bg-surface-1 hover:text-text-secondary',
											)}
											title={server.enabled ? 'Disable' : 'Enable'}
										>
											{server.enabled ? <IconPlug size={15} /> : <IconPlugOff size={15} />}
										</button>
										<button
											onClick={() => handleAction(server.name, 'restart')}
											className='rounded-radius-sm p-1.5 text-text-tertiary transition-all hover:bg-surface-1 hover:text-text-secondary'
											title='Restart'
										>
											<IconRefresh size={15} />
										</button>
										<button
											onClick={() => handleAction(server.name, 'remove')}
											className='rounded-radius-sm p-1.5 text-text-tertiary transition-all hover:bg-red-500/10 hover:text-red-400'
											title='Remove'
										>
											<IconTrash size={15} />
										</button>
									</>
								)}
							</div>
						</div>

						{/* Expanded details */}
						{isExpanded && (
							<div className='border-t border-border-subtle px-4 py-3'>
								<div className='space-y-2.5 text-caption-sm'>
									{/* Connection info */}
									<div className='grid grid-cols-2 gap-x-4 gap-y-1.5'>
										<div className='text-text-tertiary'>Status</div>
										<div className={isRunning ? 'text-green-400' : 'text-text-tertiary'}>
											{isRunning ? 'Connected' : server.enabled ? 'Connecting...' : 'Disabled'}
										</div>
										{server.command && (
											<>
												<div className='text-text-tertiary'>Command</div>
												<div className='font-mono text-text-secondary'>{server.command} {server.args?.join(' ')}</div>
											</>
										)}
										{server.url && (
											<>
												<div className='text-text-tertiary'>URL</div>
												<div className='truncate font-mono text-text-secondary'>{server.url}</div>
											</>
										)}
										{status?.connectedAt && (
											<>
												<div className='text-text-tertiary'>Connected</div>
												<div className='text-text-tertiary'>
													{new Date(status.connectedAt).toLocaleString()}
												</div>
											</>
										)}
									</div>

									{/* Error */}
									{status?.lastError && (
										<div className='rounded-radius-sm bg-red-500/10 px-2.5 py-2 text-caption-sm text-red-400/80'>
											{status.lastError}
										</div>
									)}

									{/* Tools */}
									{toolCount > 0 && (
										<div>
											<div className='mb-1.5 text-caption-sm font-medium uppercase tracking-wider text-text-tertiary'>
												Available Tools ({toolCount})
											</div>
											<div className='flex flex-wrap gap-1'>
												{status!.tools.map((t) => (
													<span
														key={t}
														className='rounded-radius-sm bg-surface-1 px-2 py-0.5 font-mono text-caption-sm text-text-tertiary'
													>
														{cleanToolName(t, server.name)}
													</span>
												))}
											</div>
										</div>
									)}
								</div>
							</div>
						)}
					</div>
				)
			})}
		</div>
	)
}

// ─── Config Tab ─────────────────────────────────────────────────

function ConfigTab() {
	const [config, setConfig] = useState('')
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [status, setStatus] = useState<{type: 'success' | 'error'; message: string} | null>(null)

	const fetchConfig = useCallback(async () => {
		try {
			const res = await fetch(`${API_BASE}/config`, {credentials: 'include'})
			const text = await res.text()
			setConfig(JSON.stringify(JSON.parse(text), null, 2))
		} catch (err) {
			console.error('Failed to fetch config:', err)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchConfig()
	}, [fetchConfig])

	const handleSave = async () => {
		setStatus(null)
		try {
			JSON.parse(config)
		} catch {
			setStatus({type: 'error', message: 'Invalid JSON'})
			return
		}
		setSaving(true)
		try {
			await mcpFetch('/config', {method: 'PUT', body: config})
			setStatus({type: 'success', message: 'Config saved and applied'})
			setTimeout(() => setStatus(null), 3000)
		} catch (err: any) {
			setStatus({type: 'error', message: err.message})
		} finally {
			setSaving(false)
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
		<div className='flex flex-col p-4'>
			<div className='mb-3 flex items-center justify-between'>
				<div className='flex items-center gap-2 text-caption-sm text-text-tertiary'>
					<IconCode size={13} />
					<span className='font-medium uppercase tracking-wide'>Raw Config</span>
				</div>
				<div className='flex items-center gap-2'>
					{status && (
						<span
							className={cn(
								'flex items-center gap-1 text-caption-sm',
								status.type === 'success' ? 'text-green-400' : 'text-red-400',
							)}
						>
							{status.type === 'success' ? <IconCheck size={12} /> : <IconAlertCircle size={12} />}
							{status.message}
						</span>
					)}
					<button
						onClick={fetchConfig}
						className='rounded-radius-sm p-1.5 text-text-tertiary transition-colors hover:bg-surface-1 hover:text-text-secondary'
						title='Reload'
					>
						<IconRefresh size={13} />
					</button>
					<button
						onClick={handleSave}
						disabled={saving}
						className='flex items-center gap-1.5 rounded-radius-sm bg-brand px-3 py-1.5 text-caption-sm font-semibold text-white transition-all hover:bg-brand-lighter disabled:opacity-40'
					>
						{saving ? <IconLoader2 size={12} className='animate-spin' /> : <IconCheck size={12} />}
						Save
					</button>
				</div>
			</div>
			<textarea
				value={config}
				onChange={(e) => setConfig(e.target.value)}
				spellCheck={false}
				className='min-h-[600px] resize-y rounded-radius-lg border border-border-subtle bg-surface-base p-4 font-mono text-caption leading-relaxed text-text-secondary outline-none transition-colors focus-visible:border-brand'
			/>
		</div>
	)
}

// ─── Main MCP Panel ─────────────────────────────────────────────

type McpTab = 'marketplace' | 'installed' | 'config'

export default function McpPanel() {
	const [activeTab, setActiveTab] = useState<McpTab>('installed')
	const [installTarget, setInstallTarget] = useState<RegistryServer | null>(null)
	const [installFeatured, setInstallFeatured] = useState<FeaturedMcp | null>(null)
	const [installedNames, setInstalledNames] = useState<Set<string>>(new Set())

	// Fetch installed names for the marketplace "Installed" badges
	useEffect(() => {
		mcpFetch<{servers: McpServerConfig[]}>('/servers')
			.then((data) => {
				setInstalledNames(new Set((data.servers || []).map((s) => s.name)))
			})
			.catch(() => {})
	}, [activeTab])

	const tabs: {id: McpTab; label: string; icon: React.ReactNode}[] = [
		{id: 'marketplace', label: 'Marketplace', icon: <IconSearch size={13} />},
		{id: 'installed', label: 'Installed', icon: <IconPlug size={13} />},
		{id: 'config', label: 'Config', icon: <IconSettings size={13} />},
	]

	return (
		<div className='flex h-full flex-col bg-surface-base'>
			{/* Sticky header */}
			<div className='flex-shrink-0 border-b border-border-subtle px-5 py-4'>
				<div className='flex items-center gap-3'>
					<div className='flex h-9 w-9 items-center justify-center rounded-radius-lg bg-gradient-to-br from-blue-500/20 to-violet-500/20'>
						<IconPlug size={18} className='text-blue-400' />
					</div>
					<div>
						<h2 className='text-body font-semibold text-text-primary'>MCP Servers</h2>
						<p className='text-caption-sm leading-relaxed text-text-tertiary'>
							Model Context Protocol servers extend Liv&apos;s capabilities with external tools.
							Browse the marketplace to discover servers, or manage your installed ones.
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

			{/* Tab content — this is the only scrollable area */}
			<div className='min-h-0 flex-1 overflow-y-auto'>
				{activeTab === 'marketplace' && (
					<MarketplaceTab
						onInstall={(server) => setInstallTarget(server)}
						onInstallFeatured={(mcp) => setInstallFeatured(mcp)}
						installedNames={installedNames}
					/>
				)}
				{activeTab === 'installed' && <InstalledTab />}
				{activeTab === 'config' && <ConfigTab />}
			</div>

			{/* Install dialogs */}
			{installTarget && (
				<InstallDialog
					server={installTarget}
					onClose={() => setInstallTarget(null)}
					onInstalled={() => setActiveTab('installed')}
				/>
			)}
			{installFeatured && (
				<InstallDialog
					featured={installFeatured}
					onClose={() => setInstallFeatured(null)}
					onInstalled={() => setActiveTab('installed')}
				/>
			)}
		</div>
	)
}
