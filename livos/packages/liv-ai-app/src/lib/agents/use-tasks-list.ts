/**
 * Phase 202-05 — `useTasksList` recent-runs hook.
 *
 * Native fetch wrapper around `/trpc/agents.tasks.list`. Mirrors
 * `useAgentsList` from Plan 202-04 (D-201-09 native-fetch transport, INV-202-02
 * no @trpc/react-query in the subapp).
 *
 * Auto-refetch every 10 s on a timer + window-focus event so the list stays
 * fresh after a manual "Run now" or a cron tick lands. The `refetch` callback
 * is also exposed so the parent page can trigger an immediate refresh after
 * a Run-now mutation resolves.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Shape mirrors server-side `TaskSummary` from
// `livos/packages/livinityd/source/modules/server/trpc/agent-task-router.ts`.
// Kept local so the subapp does NOT cross a workspace import boundary
// (INV-202-02). Update when the backend tightens this contract in Plan 202-09.
export interface TaskSummary {
	threadId: string;
	agentId: string;
	agentName: string;
	status: "running" | "completed" | "failed" | "cancelled";
	triggeredBy: string;
	triggeredAt: string;
	title: string;
	lastMessagePreview?: string;
}

const REFETCH_INTERVAL_MS = 10_000;

function buildTasksListQs(agentId: string, limit: number): string {
	const envelope = {
		"0": {
			json: { agentId, limit },
		},
	};
	return `batch=1&input=${encodeURIComponent(JSON.stringify(envelope))}`;
}

async function fetchTasksList(
	agentId: string,
	limit: number,
): Promise<TaskSummary[]> {
	try {
		const res = await fetch(
			`/trpc/agents.tasks.list?${buildTasksListQs(agentId, limit)}`,
			{
				credentials: "include",
			},
		);
		if (!res.ok) return [];
		const data = await res.json();
		// tRPC v10 batch shape
		const v10 = data?.[0]?.result?.data;
		if (Array.isArray(v10)) return v10 as TaskSummary[];
		// tRPC v11 wrap
		const v11 = data?.[0]?.result?.data?.json;
		if (Array.isArray(v11)) return v11 as TaskSummary[];
		return [];
	} catch {
		return [];
	}
}

export interface UseTasksListOptions {
	limit?: number;
}

export interface UseTasksListResult {
	tasks: TaskSummary[];
	isLoading: boolean;
	refetch: () => Promise<void>;
}

export function useTasksList(
	agentId: string,
	options: UseTasksListOptions = {},
): UseTasksListResult {
	const limit = options.limit ?? 20;
	const [tasks, setTasks] = useState<TaskSummary[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const mountedRef = useRef<boolean>(true);

	const refetch = useCallback(async (): Promise<void> => {
		if (!agentId) {
			setTasks([]);
			setIsLoading(false);
			return;
		}
		const rows = await fetchTasksList(agentId, limit);
		if (!mountedRef.current) return;
		setTasks(rows);
		setIsLoading(false);
	}, [agentId, limit]);

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

	return { tasks, isLoading, refetch };
}
