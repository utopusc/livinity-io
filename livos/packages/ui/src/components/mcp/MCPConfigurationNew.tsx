// Phase 84 V32-MCP — MCPConfigurationNew (top-level wrapper).
//
// Combines ConfiguredMcpList + a "+ MCP Server" button that opens the
// BrowseDialog. Mounted inside routes/agents/agent-editor.tsx Manual tab
// (P85-UI's file).
//
// On install/remove, invokes the agent.get cache update from the underlying
// mutation hook (mcp-api.ts). Parent (agent-editor) reads the fresh
// configuredMcps via its useAgent query hook on the next render.

import {useState} from 'react'
import {IconPlus} from '@tabler/icons-react'

import {trpcReact} from '@/trpc/trpc'
import {Button} from '@/shadcn-components/ui/button'

import {BrowseDialog} from './BrowseDialog'
import {ConfiguredMcpList} from './ConfiguredMcpList'
import type {ConfiguredMcp} from './types'

interface MCPConfigurationNewProps {
	agentId: string
	configuredMcps: ConfiguredMcp[]
	disabled?: boolean
}

export function MCPConfigurationNew({
	agentId,
	configuredMcps,
	disabled,
}: MCPConfigurationNewProps) {
	const [browseOpen, setBrowseOpen] = useState(false)
	const utils = trpcReact.useUtils()

	const handleChanged = () => {
		// The mutation hooks already setData / invalidate. This callback is a
		// safety net that forces a refetch of the agent — useful when other
		// fields (system prompt, tools) might also need updating in the
		// editor's preview pane.
		void utils.agents.get.invalidate({agentId})
		void utils.agents.list.invalidate()
	}

	return (
		<section
			className='space-y-4 rounded-2xl border border-liv-border bg-liv-card p-6'
			data-testid='mcp-configuration-new'
		>
			<header className='flex items-center justify-between gap-2'>
				<div>
					<h3 className='text-sm font-semibold text-liv-foreground'>MCP Servers</h3>
					<p className='mt-1 text-xs text-liv-muted-foreground'>
						Connect external tools and APIs to this agent via Model Context
						Protocol.
					</p>
				</div>
				<Button
					size='sm'
					onClick={() => setBrowseOpen(true)}
					disabled={disabled}
					className='gap-1'
					data-testid='mcp-add-button'
				>
					<IconPlus size={14} />
					MCP Server
				</Button>
			</header>

			<ConfiguredMcpList
				configuredMcps={configuredMcps}
				agentId={agentId}
				onChanged={handleChanged}
				disabled={disabled}
			/>

			{browseOpen && (
				<BrowseDialog
					open={browseOpen}
					onClose={() => setBrowseOpen(false)}
					agentId={agentId}
					onInstalled={handleChanged}
				/>
			)}
		</section>
	)
}
