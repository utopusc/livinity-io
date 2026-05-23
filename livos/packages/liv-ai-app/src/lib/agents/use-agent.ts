/**
 * Phase 202-05 — `useAgent` single-row fetch hook.
 *
 * Native fetch wrapper around `/trpc/agents.get` (no `@trpc/react-query` in
 * the subapp — INV-202-02 + D-201-09 native-fetch transport, mirrors
 * `useAgentsList` from Plan 202-04).
 *
 * Returns `{ agent, isLoading, refetch }` where `agent` is `null` while
 * loading AND when the agent id does not exist (the route returns `null` for
 * unknown ids — caller decides whether to render a 404 surface).
 *
 * No timer-revalidate (the detail page is foreground; the operator either
 * edits the row or navigates away). Live status flows through the separate
 * `useAgentStatusSSE` hook reused from 202-04 — this hook only owns the row
 * shape (name, model, cron, instructions, etc).
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { LivosAgent } from "./types";

// tRPC v10 batch GET — `input` is a URL-encoded JSON envelope. We build the
// QS lazily per id since the id varies per mount (unlike `agents.list` which
// has a void input).
function buildAgentGetQs(id: string): string {
	const envelope = {
		"0": {
			json: { id },
		},
	};
	return `batch=1&input=${encodeURIComponent(JSON.stringify(envelope))}`;
}

async function fetchAgent(id: string): Promise<LivosAgent | null> {
	try {
		const res = await fetch(`/trpc/agents.get?${buildAgentGetQs(id)}`, {
			credentials: "include",
		});
		if (!res.ok) return null;
		const data = await res.json();
		// tRPC v10 batch shape: [{ result: { data: <row|null> } }]
		const v10 = data?.[0]?.result?.data;
		if (v10 !== undefined) {
			if (v10 === null) return null;
			if (typeof v10 === "object" && "id" in v10) return v10 as LivosAgent;
		}
		// tRPC v11 wrap (data.json): [{ result: { data: { json: <row|null> } } }]
		const v11 = data?.[0]?.result?.data?.json;
		if (v11 !== undefined) {
			if (v11 === null) return null;
			if (typeof v11 === "object" && "id" in v11) return v11 as LivosAgent;
		}
		return null;
	} catch {
		return null;
	}
}

export interface UseAgentResult {
	agent: LivosAgent | null;
	isLoading: boolean;
	refetch: () => Promise<void>;
}

export function useAgent(id: string): UseAgentResult {
	const [agent, setAgent] = useState<LivosAgent | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	// Mount guard — same pattern as use-agents-list.ts so a slow fetch
	// resolving after unmount does NOT call setState on a dead component.
	const mountedRef = useRef<boolean>(true);

	const refetch = useCallback(async (): Promise<void> => {
		if (!id) {
			setAgent(null);
			setIsLoading(false);
			return;
		}
		const row = await fetchAgent(id);
		if (!mountedRef.current) return;
		setAgent(row);
		setIsLoading(false);
	}, [id]);

	useEffect(() => {
		mountedRef.current = true;
		setIsLoading(true);
		void refetch();
		return () => {
			mountedRef.current = false;
		};
	}, [refetch]);

	return { agent, isLoading, refetch };
}
