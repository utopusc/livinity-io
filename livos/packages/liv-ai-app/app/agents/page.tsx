/**
 * Phase 202-04 — `/agents` dashboard.
 *
 * Grid of agent cards. Each card surfaces:
 *   - agent name + model badge
 *   - instructions (1-line truncated)
 *   - live status badge (idle/running/scheduled) driven by SSE
 *   - cron string (if scheduled)
 *   - sub-agent count (if > 0)
 *
 * Live updates flow through the `useAgentStatusSSE` hook — one EventSource
 * per browser session, merged into `statusByAgentId` keyed by agentId.
 * Status changes re-render only the affected card (React's diffing handles
 * the granular update for free since each card reads
 * `statusByAgentId[a.id]`).
 *
 * D-202-08 — SSE transport, not WebSocket.
 */

"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { AgentCard } from "@/components/agents/AgentCard";
import { useAgentsList } from "@/src/lib/agents/use-agents-list";
import { useAgentStatusSSE } from "@/src/lib/agents/use-agent-status-sse";

export default function AgentsPage() {
	const { agents, isLoading } = useAgentsList();
	const { statusByAgentId } = useAgentStatusSSE();

	// Pre-compute sub-agent counts so each card receives a stable scalar
	// instead of every card scanning the full agents array on every render.
	const subAgentCountByParent = useMemo<Record<string, number>>(() => {
		const map: Record<string, number> = {};
		for (const a of agents) {
			if (a.parentAgentId) {
				map[a.parentAgentId] = (map[a.parentAgentId] ?? 0) + 1;
			}
		}
		return map;
	}, [agents]);

	return (
		<div className="container mx-auto px-6 py-8">
			<header className="mb-8 flex items-center justify-between gap-4">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Manage your custom agents, schedules, and sub-agent
						orchestration.
					</p>
				</div>
				<Link
					href="/agents/new"
					className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
				>
					<Plus className="size-4" />
					New Agent
				</Link>
			</header>

			{isLoading ? (
				<AgentsGridSkeleton />
			) : agents.length === 0 ? (
				<EmptyState />
			) : (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{agents.map((a) => (
						<Link
							key={a.id}
							href={`/agents/${a.id}`}
							className="block focus:outline-none"
						>
							<AgentCard
								agent={a}
								status={statusByAgentId[a.id]}
								subAgentCount={subAgentCountByParent[a.id]}
							/>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}

function EmptyState() {
	return (
		<div className="rounded-lg border border-dashed border-border bg-card/40 p-12 text-center">
			<h2 className="text-lg font-medium">No agents yet</h2>
			<p className="mt-2 text-sm text-muted-foreground">
				Create your first agent to give it instructions, tools, and an
				optional schedule.
			</p>
			<Link
				href="/agents/new"
				className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
			>
				<Plus className="size-4" />
				New Agent
			</Link>
		</div>
	);
}

function AgentsGridSkeleton() {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{[0, 1, 2].map((i) => (
				<div
					key={i}
					className="h-32 animate-pulse rounded-lg border border-border bg-card/40"
				/>
			))}
		</div>
	);
}
