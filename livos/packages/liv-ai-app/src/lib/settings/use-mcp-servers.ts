/**
 * Phase 202-07 — `useMcpServers` hook.
 *
 * Native-fetch tRPC wrapper for the /settings → MCP tab. Returns:
 *
 *   {
 *     servers:        McpServerConfig[]              — from mcp.config.list
 *     builtInTools:   BuiltInToolCatalogEntry[]      — from mastra.agent.listBuiltInTools
 *     isLoading:      boolean
 *     error:          string | null
 *     refetch:        () => Promise<void>
 *   }
 *
 * Both queries are batched into a single `/trpc/<a>,<b>?batch=1&input=...`
 * round-trip so the panel renders both sections in one paint. Defensive
 * parsing handles v10 + v11 envelope shapes (same pattern as
 * use-agents-list.ts in Phase 202-04).
 *
 * INV-202-02 — no backend changes here; this is a UI-tier-only hook.
 * INV-202-05 — strings emitted by this hook are English only.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ───────────────────────────────────────────────────────────────

/**
 * Mirrors the McpServerConfig type from
 * livos/packages/livinityd/source/modules/server/trpc/mcp-config-router.ts.
 * Re-declared here to avoid a cross-workspace import (matches the precedent
 * set by use-agents-list.ts' LivosAgent mirror in 202-04).
 */
export interface McpServerConfig {
	name: string;
	transport: "stdio" | "http";
	command?: string;
	args?: string[];
	url?: string;
	env?: Record<string, string>;
	enabled: boolean;
	/** True for `luse` and any other system MCP. UI hides Delete when true. */
	system: boolean;
}

/**
 * Mirrors BUILT_IN_TOOL_CATALOG entries from
 * livos/packages/livinityd/source/modules/mastra/agents/built-in-tools.ts.
 * The shape is intentionally narrow — only the fields the UI renders.
 */
export interface BuiltInToolCatalogEntry {
	id: string;
	name: string;
	description: string;
	destructive: boolean;
	category: string;
}

// ── Fetch wrappers ──────────────────────────────────────────────────────

const MCP_CONFIG_LIST_QS =
	"batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%7D%7D%7D";

interface BatchResult<T> {
	result?: { data?: T | { json?: T } };
	error?: { json?: { message?: string }; message?: string };
}

function unwrapBatch<T>(entry: BatchResult<T> | undefined): T | null {
	if (!entry) return null;
	const direct = entry.result?.data;
	if (Array.isArray(direct) || (direct && typeof direct === "object" && !("json" in direct))) {
		return direct as T;
	}
	const wrapped = (entry.result?.data as { json?: T } | undefined)?.json;
	if (wrapped !== undefined) return wrapped;
	// Fall through — `direct` may still be the right value (primitive / object
	// without `json` key). Cast and return.
	return (direct as T) ?? null;
}

function readBatchError(entry: BatchResult<unknown> | undefined): string | null {
	if (!entry?.error) return null;
	return entry.error.json?.message ?? entry.error.message ?? "Unknown error";
}

async function fetchMcpServers(): Promise<{
	servers: McpServerConfig[];
	builtInTools: BuiltInToolCatalogEntry[];
	error: string | null;
}> {
	try {
		const res = await fetch(
			`/trpc/mcp.config.list,mastra.agent.listBuiltInTools?${MCP_CONFIG_LIST_QS}`,
			{ credentials: "include" },
		);
		if (!res.ok) {
			return {
				servers: [],
				builtInTools: [],
				error: `Failed to load MCP config (HTTP ${res.status})`,
			};
		}
		const data = (await res.json()) as Array<BatchResult<unknown>>;
		const serversEntry = data?.[0];
		const toolsEntry = data?.[1];
		const serversError = readBatchError(serversEntry);
		if (serversError) {
			return { servers: [], builtInTools: [], error: serversError };
		}
		const servers = unwrapBatch<McpServerConfig[]>(serversEntry) ?? [];
		const builtInTools = unwrapBatch<BuiltInToolCatalogEntry[]>(toolsEntry) ?? [];
		return {
			servers: Array.isArray(servers) ? servers : [],
			builtInTools: Array.isArray(builtInTools) ? builtInTools : [],
			error: null,
		};
	} catch (err) {
		return {
			servers: [],
			builtInTools: [],
			error: err instanceof Error ? err.message : "Network error",
		};
	}
}

// ── Hook ────────────────────────────────────────────────────────────────

export interface UseMcpServersResult {
	servers: McpServerConfig[];
	builtInTools: BuiltInToolCatalogEntry[];
	isLoading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
}

export function useMcpServers(): UseMcpServersResult {
	const [servers, setServers] = useState<McpServerConfig[]>([]);
	const [builtInTools, setBuiltInTools] = useState<BuiltInToolCatalogEntry[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);
	const mountedRef = useRef<boolean>(true);

	const refetch = useCallback(async (): Promise<void> => {
		const next = await fetchMcpServers();
		if (!mountedRef.current) return;
		setServers(next.servers);
		setBuiltInTools(next.builtInTools);
		setError(next.error);
		setIsLoading(false);
	}, []);

	useEffect(() => {
		mountedRef.current = true;
		void refetch();
		const onFocus = (): void => {
			void refetch();
		};
		window.addEventListener("focus", onFocus);
		return () => {
			mountedRef.current = false;
			window.removeEventListener("focus", onFocus);
		};
	}, [refetch]);

	return { servers, builtInTools, isLoading, error, refetch };
}
