// Phase 182-04 — MCP Servers settings page.
//
// Two-column layout: McpServerList (left) + McpServerDetail / featured MCPs (right).
// Data fetched from REST /api/mcp/servers (same endpoint as chat-sidebar mcp-panel).
// Featured MCP one-click install section shown in right pane when no server selected.

import {useCallback, useEffect, useState} from 'react'
import {McpServerList, type McpServerConfig, type McpServerStatus} from '@/components/mcp/McpServerList'
import {McpServerDetail} from '@/components/mcp/McpServerDetail'
import {FEATURED_MCPS, type FeaturedMcp} from '@/components/mcp/featured-mcps'
import {SettingsPageLayout} from './_components/settings-page-layout'
import {SettingsPageHeader} from '@/components/settings-page-header'
import {IconDownload, IconCheck} from '@tabler/icons-react'

// ── REST helpers (same /api/mcp base as mcp-panel.tsx) ───────────────────────

const API_BASE = '/api/mcp'

async function mcpFetch<T>(path: string, options?: RequestInit): Promise<T> {
	const res = await fetch(`${API_BASE}${path}`, {
		credentials: 'include',
		headers: {'Content-Type': 'application/json', ...options?.headers},
		...options,
	})
	if (!res.ok) {
		const body = await res.json().catch(() => ({error: res.statusText}))
		throw new Error((body as {error?: string}).error || `API error: ${res.status}`)
	}
	return res.json()
}

// ── Page component ────────────────────────────────────────────────────────────

export default function McpServersPage() {
	const [selectedName, setSelectedName] = useState<string | null>(null)
	const [servers, setServers] = useState<McpServerConfig[]>([])
	const [statuses, setStatuses] = useState<Record<string, McpServerStatus>>({})
	const [isLoading, setIsLoading] = useState(true)
	const [actionLoading, setActionLoading] = useState<string | null>(null)

	const fetchServers = useCallback(async () => {
		try {
			const data = await mcpFetch<{servers: McpServerConfig[]; statuses: Record<string, McpServerStatus>}>('/servers')
			setServers(data.servers || [])
			setStatuses(data.statuses || {})
		} catch {
			// silent
		} finally {
			setIsLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchServers()
		const interval = setInterval(fetchServers, 15000)
		return () => clearInterval(interval)
	}, [fetchServers])

	// Adapt data to McpServerList props shape
	const serverItems = servers.map((s) => ({
		name: s.name,
		config: s,
		status: statuses[s.name],
	}))

	const selectedServer = selectedName
		? (serverItems.find((s) => s.name === selectedName) ?? null)
		: null

	const installedNames = new Set(servers.map((s) => s.name))

	const handleToggle = async (name: string, enabled: boolean) => {
		setActionLoading(name)
		try {
			await mcpFetch(`/servers/${encodeURIComponent(name)}`, {
				method: 'PUT',
				body: JSON.stringify({enabled}),
			})
			await fetchServers()
		} catch {
			// silent
		} finally {
			setActionLoading(null)
		}
	}

	const handleRemove = async (name: string) => {
		setActionLoading(name)
		try {
			await mcpFetch(`/servers/${encodeURIComponent(name)}`, {method: 'DELETE'})
			setSelectedName(null)
			await fetchServers()
		} catch {
			// silent
		} finally {
			setActionLoading(null)
		}
	}

	const handleInstallFeatured = async (mcp: FeaturedMcp) => {
		if (installedNames.has(mcp.name)) return
		const body: Record<string, unknown> = {
			name: mcp.name,
			transport: mcp.transport,
			description: mcp.description,
		}
		if (mcp.transport === 'stdio') {
			body.command = mcp.customCommand ?? 'npx'
			body.args = mcp.customArgs ?? (mcp.npmPackage ? ['-y', mcp.npmPackage] : [])
		} else {
			body.url = mcp.remoteUrl ?? ''
		}
		try {
			await mcpFetch('/servers', {method: 'POST', body: JSON.stringify(body)})
			await fetchServers()
		} catch {
			// silent
		}
	}

	return (
		<SettingsPageLayout title='MCP Servers' description='Manage Model Context Protocol servers' hideHeader>
			<SettingsPageHeader
				eyebrow='10 · MCP'
				title='Model Context Protocol'
				titleAccent='servers.'
				sub='Add, configure, and monitor MCP servers that extend Claude with tools.'
			/>
			<div className='h-4' />
			<div data-testid='mcp-servers-page' className='flex gap-4 px-1'>
				{/* Left: server list */}
				<div className='w-64 shrink-0'>
					<McpServerList
						servers={serverItems}
						selectedName={selectedName}
						onSelect={setSelectedName}
						onToggleEnabled={handleToggle}
						onRemove={handleRemove}
						isLoading={isLoading}
					/>
				</div>

				{/* Right: detail or featured */}
				<div className='flex-1 min-w-0'>
					{selectedServer ? (
						<McpServerDetail
							server={selectedServer}
							onClose={() => setSelectedName(null)}
							onToggleEnabled={handleToggle}
						/>
					) : (
						<div data-testid='mcp-featured-section'>
							<p className='text-caption text-text-tertiary mb-3'>Featured MCP servers — one-click install:</p>
							<div className='grid grid-cols-2 gap-3'>
								{FEATURED_MCPS.slice(0, 6).map((mcp) => (
									<div
										key={mcp.name}
										data-testid={`featured-mcp-${mcp.name}`}
										onClick={() => handleInstallFeatured(mcp)}
										className={`rounded-radius-lg p-3 bg-gradient-to-br ${mcp.gradient} border border-white/10 cursor-pointer hover:border-white/20 transition-colors`}
									>
										<p className='text-caption font-semibold text-text-primary'>{mcp.displayName}</p>
										<p className='text-[11px] text-text-tertiary mt-0.5 line-clamp-2'>{mcp.description}</p>
										{installedNames.has(mcp.name) ? (
											<span className='flex items-center gap-1 text-[10px] text-accent-green mt-1'>
												<IconCheck size={10} />
												Installed
											</span>
										) : (
											<span className='flex items-center gap-1 text-[10px] text-text-tertiary mt-1'>
												<IconDownload size={10} />
												Install
											</span>
										)}
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		</SettingsPageLayout>
	)
}
