// Phase 84 V32-MCP — typed tRPC hook wrappers for the MCP router.
//
// Mirrors the agents-api.ts pattern (P85-UI Wave 2) so the dialogs can
// stay declarative. All 6 procedure paths route via HTTP per
// httpOnlyPaths in livinityd common.ts (D-PROCEDURE-HTTP).
//
// All mutations invalidate `agents.get` for the affected agentId so the
// editor + ConfiguredMcpList re-render with the fresh configured_mcps
// array immediately.

import {trpcReact} from '@/trpc/trpc'

import type {McpSource} from './types'

// ─── Search ────────────────────────────────────────────────────────────

export function useMcpSearch(input: {
	query?: string
	source: McpSource
	limit?: number
	offset?: number
	enabled?: boolean
}) {
	return trpcReact.mcp.search.useQuery(
		{
			query: input.query,
			source: input.source,
			limit: input.limit,
			offset: input.offset,
		},
		{
			enabled: input.enabled ?? true,
			// Don't aggressively refetch — the registry result is fairly
			// stable and a debounced search input is the better UX driver.
			staleTime: 30_000,
		},
	)
}

// ─── Single server ──────────────────────────────────────────────────────

export function useMcpServer(input: {serverId: string; source: McpSource; enabled?: boolean}) {
	return trpcReact.mcp.getServer.useQuery(
		{serverId: input.serverId, source: input.source},
		{enabled: input.enabled ?? true},
	)
}

// ─── Smithery configured gate ──────────────────────────────────────────

export function useSmitheryConfigured() {
	return trpcReact.mcp.smitheryConfigured.useQuery(undefined, {
		// This is a slow-changing flag; cache aggressively so the toggle
		// doesn't flicker as the user moves between dialogs.
		staleTime: 60_000,
	})
}

// ─── Mutations ──────────────────────────────────────────────────────────

export function useInstallMcpToAgent() {
	const utils = trpcReact.useUtils()
	return trpcReact.mcp.installToAgent.useMutation({
		onSuccess: (updatedAgent) => {
			utils.agents.get.setData({agentId: updatedAgent.id}, updatedAgent)
			void utils.agents.list.invalidate()
		},
	})
}

export function useRemoveMcpFromAgent() {
	const utils = trpcReact.useUtils()
	return trpcReact.mcp.removeFromAgent.useMutation({
		onSuccess: (updatedAgent) => {
			utils.agents.get.setData({agentId: updatedAgent.id}, updatedAgent)
			void utils.agents.list.invalidate()
		},
	})
}

export function useSetSmitheryKey() {
	const utils = trpcReact.useUtils()
	return trpcReact.mcp.setSmitheryKey.useMutation({
		onSuccess: () => {
			void utils.mcp.smitheryConfigured.invalidate()
		},
	})
}
