/**
 * Phase 202-04 — AgentCard component.
 *
 * Renders one row from `livos_agents` as a clickable card on the /agents
 * dashboard grid. Layout (per plan task 4):
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │  Agent name (h3)                       [model]      │  ← top row
 *   │  Instructions truncated to 1 line                   │  ← subtitle
 *   │                                                     │
 *   │  <StatusBadge>   cron string · sub-agents (n)       │  ← bottom row
 *   └─────────────────────────────────────────────────────┘
 *
 * Hand-rolled with Tailwind primitives (no shadcn Card dependency). The
 * surrounding `<Link>` wraps the card in app/agents/page.tsx so the whole
 * card is the click-target; the card itself only owns layout + hover ring.
 *
 * Live status update: the parent page passes `status` prop sourced from
 * `useAgentStatusSSE`. When the SSE channel pushes a new event for this
 * agentId, React re-renders this card automatically — no internal
 * subscription needed (keeps the card pure for downstream reuse on the
 * `/agents/[id]` detail page in Plan 202-05).
 */

"use client";

import { cn } from "@/lib/utils";

import type { AgentStatus, LivosAgent } from "@/src/lib/agents/types";

import { StatusBadge } from "./StatusBadge";

interface AgentCardProps {
	agent: LivosAgent;
	status?: AgentStatus;
	subAgentCount?: number;
	className?: string;
}

export function AgentCard({
	agent,
	status,
	subAgentCount,
	className,
}: AgentCardProps) {
	const state = status?.state ?? (agent.scheduleCron ? "scheduled" : "idle");
	const instructions = agent.instructions?.trim() ?? "";

	return (
		<div
			className={cn(
				// Card chrome — matches LivOS typography (-tracking-3 letter
				// spacing applied globally in globals.css); shadow + ring on
				// hover for affordance feedback.
				"group relative flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-all",
				"hover:border-foreground/20 hover:shadow-sm",
				"focus-within:ring-2 focus-within:ring-ring/40",
				className,
			)}
		>
			{/* Top row — name + model badge */}
			<div className="flex items-start justify-between gap-3">
				<h3 className="text-base font-medium leading-tight text-foreground">
					{agent.name}
					{agent.system ? (
						<span className="ml-2 align-middle text-[10px] font-normal uppercase tracking-wider text-muted-foreground/70">
							system
						</span>
					) : null}
				</h3>
				<span
					className={cn(
						"shrink-0 rounded-md border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground",
					)}
					title={`Model: ${agent.modelName}`}
				>
					{agent.modelName}
				</span>
			</div>

			{/* Subtitle — instructions truncated to one line */}
			<p
				className={cn(
					"line-clamp-1 text-sm text-muted-foreground",
					instructions.length === 0 && "italic opacity-60",
				)}
			>
				{instructions.length > 0
					? instructions
					: "No instructions configured"}
			</p>

			{/* Spacer — push the bottom row to the bottom of a flex card */}
			<div className="flex-1" />

			{/* Bottom row — status badge + cron + sub-agent count */}
			<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
				<StatusBadge
					state={state}
					lastRunAt={status?.lastRunAt}
					nextScheduledAt={status?.nextScheduledAt}
				/>
				<div className="flex items-center gap-2 text-muted-foreground/80">
					{agent.scheduleCron ? (
						<span
							className="rounded-sm bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]"
							title="Schedule (cron)"
						>
							{agent.scheduleCron}
						</span>
					) : null}
					{subAgentCount && subAgentCount > 0 ? (
						<span title="Sub-agents">
							{subAgentCount} sub-agent
							{subAgentCount === 1 ? "" : "s"}
						</span>
					) : null}
					{!agent.enabled ? (
						<span className="rounded-sm bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
							disabled
						</span>
					) : null}
				</div>
			</div>
		</div>
	);
}
