/**
 * Phase 202-04 — `useAgentsList` SWR-style hook.
 *
 * Native fetch wrapper around `/trpc/agents.list` (no `@trpc/react-query`
 * client in the subapp — INV-202-02 + the D-201-09 native-fetch transport
 * inherited from Phase 201-04). Returns the current `LivosAgent[]` plus an
 * `isLoading` flag + `refetch` callback. Refetches every 30 s on a timer AND
 * on window focus so the dashboard stays fresh after backgrounded tabs come
 * back without forcing the operator to reload.
 *
 * Live status updates (running/idle) flow through the separate
 * `useAgentStatusSSE` hook — this one only owns the row list (name, model,
 * cron, etc).
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { LivosAgent } from "./types";

// tRPC v10 batch GET — the `input` query param is a URL-encoded JSON
// envelope `{ "0": { "json": null, "meta": { "values": ["undefined"] } } }`
// which the v10 server decodes back into the void input the procedure
// expects. Encoded ONCE here so we don't pay encodeURIComponent on every
// refetch. Same pattern used by `thread-list-adapter.ts` (Phase 201-04).
const AGENTS_LIST_QS =
	"batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%7D%7D%7D";

const REFETCH_INTERVAL_MS = 30_000;

async function fetchAgentsList(): Promise<LivosAgent[]> {
	try {
		const res = await fetch(`/trpc/agents.list?${AGENTS_LIST_QS}`, {
			credentials: "include",
		});
		if (!res.ok) return [];
		const data = await res.json();
		// tRPC v10 batch shape: [{ result: { data: <rows> } }]
		const rows = data?.[0]?.result?.data;
		if (Array.isArray(rows)) return rows as LivosAgent[];
		// tRPC v11 wrap (data.json): [{ result: { data: { json: <rows> } } }]
		const jsonRows = data?.[0]?.result?.data?.json;
		if (Array.isArray(jsonRows)) return jsonRows as LivosAgent[];
		return [];
	} catch {
		return [];
	}
}

export interface UseAgentsListResult {
	agents: LivosAgent[];
	isLoading: boolean;
	refetch: () => Promise<void>;
}

export function useAgentsList(): UseAgentsListResult {
	const [agents, setAgents] = useState<LivosAgent[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	// Track mount state so a refetch resolving after unmount does NOT call
	// setState on a dead component (StrictMode + 30s timer would otherwise
	// warn).
	const mountedRef = useRef<boolean>(true);

	const refetch = useCallback(async (): Promise<void> => {
		const rows = await fetchAgentsList();
		if (!mountedRef.current) return;
		setAgents(rows);
		setIsLoading(false);
	}, []);

	useEffect(() => {
		mountedRef.current = true;
		void refetch();

		// SWR-style timer + window-focus revalidation.
		const interval = window.setInterval(() => {
			void refetch();
		}, REFETCH_INTERVAL_MS);

		const onFocus = (): void => {
			void refetch();
		};
		window.addEventListener("focus", onFocus);

		return () => {
			mountedRef.current = false;
			window.clearInterval(interval);
			window.removeEventListener("focus", onFocus);
		};
	}, [refetch]);

	return { agents, isLoading, refetch };
}
