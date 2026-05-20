/**
 * Phase 186-02 — FeaturedMcpInstaller
 *
 * Shared one-click install grid for the 6 featured MCP servers.
 * Lifted from routes/ai-chat/mcp-panel.tsx + routes/settings/mcp-servers.tsx.
 * Pure presentational wrapper — caller handles install fetch via onInstall prop.
 *
 * Mounted:
 *  - routes/ai-chat/index.tsx (above McpServerList in the MCP tab)
 *  - routes/settings/mcp-servers.tsx (replaces inline featured section)
 */

import {IconDownload, IconCheck} from '@tabler/icons-react'
import {FEATURED_MCPS, type FeaturedMcp} from './featured-mcps'

export type {FeaturedMcp}

export interface FeaturedMcpInstallerProps {
	installedNames: Set<string>
	onInstall: (mcp: FeaturedMcp) => Promise<void>
}

export function FeaturedMcpInstaller({installedNames, onInstall}: FeaturedMcpInstallerProps) {
	const featured = FEATURED_MCPS.slice(0, 6)
	return (
		<div data-testid='featured-mcp-installer'>
			<p className='text-caption text-text-tertiary mb-3'>Featured MCP servers — one-click install:</p>
			<div className='grid grid-cols-2 gap-3'>
				{featured.map((mcp) => {
					const installed = installedNames.has(mcp.name)
					return (
						<div
							key={mcp.name}
							data-testid={`featured-mcp-${mcp.name}`}
							onClick={() => {
								if (!installed) void onInstall(mcp)
							}}
							className={`rounded-radius-lg p-3 bg-gradient-to-br ${mcp.gradient} border border-white/10 ${installed ? 'cursor-default' : 'cursor-pointer hover:border-white/20'} transition-colors`}
						>
							<p className='text-caption font-semibold text-text-primary'>{mcp.displayName}</p>
							<p className='text-[11px] text-text-tertiary mt-0.5 line-clamp-2'>{mcp.description}</p>
							{installed ? (
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
					)
				})}
			</div>
		</div>
	)
}
