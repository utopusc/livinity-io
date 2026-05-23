/**
 * Phase 202-05 — `/agents/[id]` detail page.
 *
 * Shows one agent's:
 *   - Header (name + model badge + live StatusBadge) + Run-now button
 *   - Configuration section (AgentEditForm bound to agents.update)
 *   - Recent runs section (RecentTasksList from agents.tasks.list)
 *   - Delete action (hidden for system agents per D-202-20)
 *
 * Reuses 202-04 surfaces:
 *   - `useAgentsList` for the parent-agent select inside AgentEditForm
 *   - `useAgentStatusSSE` for the live status pill in the header
 *   - `StatusBadge` from 202-04 (not duplicated here)
 *
 * Sub-agent tree visualization is intentionally a stub — full viz lands in
 * Plan 202-09 (the per-row child count surfaces inline in the recent-runs
 * heading as a precursor).
 */

"use client";

import { use, useCallback, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { AgentEditForm } from "@/components/agents/AgentEditForm";
import { RecentTasksList } from "@/components/agents/RecentTasksList";
import { RunNowButton } from "@/components/agents/RunNowButton";
import { StatusBadge } from "@/components/agents/StatusBadge";
import { Button } from "@/components/ui/button";
import { useAgent } from "@/src/lib/agents/use-agent";
import { useAgentsList } from "@/src/lib/agents/use-agents-list";
import { useAgentStatusSSE } from "@/src/lib/agents/use-agent-status-sse";

export default function AgentDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
	const { agent, isLoading, refetch } = useAgent(id);
	const { agents: allAgents, refetch: refetchList } = useAgentsList();
	const { statusByAgentId } = useAgentStatusSSE();

	if (isLoading) {
		return (
			<div className="container mx-auto max-w-4xl px-6 py-8">
				<div className="flex items-center gap-3 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" />
					Loading agent…
				</div>
			</div>
		);
	}

	if (!agent) {
		return (
			<div className="container mx-auto max-w-4xl px-6 py-8">
				<div className="rounded-md border border-dashed border-border bg-card/40 p-12 text-center">
					<h1 className="text-lg font-medium">Agent not found</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						No agent with id <span className="font-mono">{id}</span>.
					</p>
				</div>
			</div>
		);
	}

	const live = statusByAgentId[agent.id];
	const state = live?.state ?? (agent.scheduleCron ? "scheduled" : "idle");

	return (
		<div className="container mx-auto max-w-4xl space-y-8 px-6 py-8">
			<header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold tracking-tight">
							{agent.name}
						</h1>
						{agent.system ? (
							<span className="rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
								system
							</span>
						) : null}
					</div>
					<div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
						<span className="font-mono text-xs">{agent.modelName}</span>
						<span aria-hidden>·</span>
						<StatusBadge
							state={state}
							lastRunAt={live?.lastRunAt}
							nextScheduledAt={live?.nextScheduledAt}
						/>
						{!agent.enabled ? (
							<span className="rounded-sm bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
								disabled
							</span>
						) : null}
					</div>
				</div>
				<RunNowButton agentId={agent.id} disabled={!agent.enabled} />
			</header>

			<section>
				<h2 className="mb-3 text-lg font-medium tracking-tight">
					Configuration
				</h2>
				<AgentEditForm
					agent={agent}
					allAgents={allAgents}
					onSaved={async () => {
						await Promise.all([refetch(), refetchList()]);
					}}
				/>
			</section>

			<section>
				<h2 className="mb-3 text-lg font-medium tracking-tight">
					Recent runs
				</h2>
				<RecentTasksList agentId={agent.id} />
			</section>

			{/* D-202-20 — system agents cannot be deleted. Hide the Delete row
			    entirely so the operator does not see a disabled-but-tempting
			    button. */}
			{!agent.system ? (
				<section className="border-t border-border pt-6">
					<h2 className="mb-3 text-lg font-medium tracking-tight text-destructive">
						Danger zone
					</h2>
					<DeleteAgentRow
						agentId={agent.id}
						agentName={agent.name}
						onDeleted={() => {}}
					/>
				</section>
			) : null}
		</div>
	);
}

interface DeleteAgentRowProps {
	agentId: string;
	agentName: string;
	onDeleted: () => void;
}

function DeleteAgentRow({ agentId, agentName, onDeleted }: DeleteAgentRowProps) {
	const router = useRouter();
	const [state, setState] = useState<
		{ kind: "idle" } | { kind: "deleting" } | { kind: "error"; message: string }
	>({ kind: "idle" });

	const onDelete = useCallback(async () => {
		const ok = window.confirm(
			`Delete agent "${agentName}"? This cannot be undone.`,
		);
		if (!ok) return;
		setState({ kind: "deleting" });
		try {
			const res = await fetch("/trpc/agents.delete?batch=1", {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ "0": { json: { id: agentId } } }),
			});
			if (!res.ok) {
				let msg = `HTTP ${res.status}`;
				try {
					const errData = await res.json();
					const errMsg =
						errData?.[0]?.error?.json?.message ??
						errData?.[0]?.error?.message;
					if (typeof errMsg === "string") {
						if (errMsg === "AGENT_IS_SYSTEM") {
							msg =
								"System agents cannot be deleted (server-side guard).";
						} else if (errMsg === "AGENT_NOT_FOUND") {
							msg = "Agent no longer exists.";
						} else {
							msg = errMsg;
						}
					}
				} catch {
					// fall through with generic HTTP msg
				}
				setState({ kind: "error", message: msg });
				return;
			}
			onDeleted();
			router.push("/agents");
		} catch (err) {
			setState({
				kind: "error",
				message: err instanceof Error ? err.message : "Network error",
			});
		}
	}, [agentId, agentName, onDeleted, router]);

	return (
		<div className="flex items-center justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/5 p-4">
			<div className="min-w-0">
				<p className="text-sm font-medium">Delete this agent</p>
				<p className="text-xs text-muted-foreground">
					Permanently removes the agent row + de-arms its cron schedule.
					Existing task threads are preserved.
				</p>
				{state.kind === "error" ? (
					<p className="mt-1 text-xs text-destructive" role="alert">
						{state.message}
					</p>
				) : null}
			</div>
			<Button
				variant="destructive"
				type="button"
				onClick={onDelete}
				disabled={state.kind === "deleting"}
			>
				{state.kind === "deleting" ? (
					<>
						<Loader2 className="size-4 animate-spin" />
						Deleting…
					</>
				) : (
					<>
						<Trash2 className="size-4" />
						Delete
					</>
				)}
			</Button>
		</div>
	);
}
