/**
 * Phase 202-09 — SubAgentTree component.
 *
 * Visualizes the parent → children relationship for a single agent on the
 * `/agents/[id]` detail page. Pure visualization — no edit affordances. The
 * edit form (Plan 202-05 AgentEditForm) already exposes the `parentAgentId`
 * select for re-parenting; this component is the read-only mirror surface.
 *
 * Inputs:
 *   - `agent`     — the current agent (the page's subject).
 *   - `allAgents` — full LivosAgent list from `useAgentsList()` (Plan 202-04).
 *                   Used to resolve the parent row + the children rows without
 *                   any extra fetch (the dashboard already keeps this list
 *                   warm).
 *
 * Layout decisions:
 *   - D-202-13 / INV-202-06 — sub-agent depth ≤ 2. The backend trigger + the
 *     AgentRegistry depth guard both enforce this; the tree component renders
 *     a `[depth limit reached]` placeholder card if a depth-3 chain somehow
 *     surfaces (manual SQL bypass / stale rows from before the trigger
 *     landed). The placeholder is rendered INSIDE the child row so the
 *     operator can still see + click the immediate child.
 *   - Empty state — when the agent has neither a parent nor children, the
 *     entire component returns `null` so the detail page does not show an
 *     orphan "Sub-agents" heading (per plan task 1 acceptance criteria).
 *   - Minimal flexbox — no graph library. Parent breadcrumb on top, children
 *     row as small clickable cards below. Matches the visual weight of the
 *     202-04 AgentCard grid without duplicating it (the cards here are
 *     intentionally compact so they don't compete with the full grid on the
 *     `/agents` list page).
 *
 * Each card is a Next.js Link to `/agents/[childId]` so the operator can
 * navigate the tree by clicking. Parent breadcrumb is also a Link.
 *
 * INV-202-05 — English UI text only.
 */

"use client";

import Link from "next/link";
import { ArrowUpRight, GitBranch } from "lucide-react";

import { cn } from "@/lib/utils";
import type { LivosAgent } from "@/src/lib/agents/types";

interface SubAgentTreeProps {
	agent: LivosAgent;
	allAgents: LivosAgent[];
	className?: string;
}

export function SubAgentTree({
	agent,
	allAgents,
	className,
}: SubAgentTreeProps) {
	const parent = agent.parentAgentId
		? allAgents.find((a) => a.id === agent.parentAgentId) ?? null
		: null;

	const children = allAgents.filter((a) => a.parentAgentId === agent.id);

	// Empty state — no parent AND no children → render nothing so the
	// detail page suppresses the heading via its own conditional wrapper.
	if (!parent && children.length === 0) {
		return null;
	}

	return (
		<div className={cn("space-y-4", className)}>
			{parent ? (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<span className="text-xs uppercase tracking-wider">Parent</span>
					<Link
						href={`/agents/${parent.id}`}
						className="inline-flex items-center gap-1 rounded-sm border border-border bg-card/40 px-2 py-1 text-sm font-medium text-foreground transition hover:border-primary/60 hover:bg-primary/5"
					>
						<GitBranch className="size-3" />
						{parent.name}
						<ArrowUpRight className="size-3 opacity-60" />
					</Link>
					<span className="text-xs">/</span>
					<span className="text-sm font-medium text-foreground">
						{agent.name}
					</span>
				</div>
			) : null}

			{children.length > 0 ? (
				<div>
					<div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
						Children ({children.length})
					</div>
					<div className="flex flex-wrap gap-2">
						{children.map((child) => (
							<ChildCard
								key={child.id}
								child={child}
								allAgents={allAgents}
							/>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}

interface ChildCardProps {
	child: LivosAgent;
	allAgents: LivosAgent[];
}

/**
 * Compact card for a single sub-agent. Shows name + model + optional
 * grandchild-warning placeholder. Clickable — navigates to child's
 * detail page.
 *
 * D-202-13 — if the child itself has children (i.e. the operator looking at
 * the parent would naively expect depth-3 to be valid), we surface a
 * `[depth limit reached]` hint so the operator understands why the
 * grandchildren are not shown here. The DB trigger + AgentRegistry depth
 * guard already prevent depth-3 dispatch; this is just user-facing clarity.
 */
function ChildCard({ child, allAgents }: ChildCardProps) {
	const grandchildren = allAgents.filter((a) => a.parentAgentId === child.id);
	const hasGrandchildren = grandchildren.length > 0;

	return (
		<Link
			href={`/agents/${child.id}`}
			className="group flex min-w-[160px] max-w-[240px] flex-col gap-1 rounded-md border border-border bg-card/40 p-3 transition hover:border-primary/60 hover:bg-primary/5"
		>
			<div className="flex items-center gap-1.5">
				<GitBranch className="size-3 text-muted-foreground" />
				<span className="truncate text-sm font-medium">{child.name}</span>
				<ArrowUpRight className="ml-auto size-3 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
			</div>
			<span className="font-mono text-[10px] text-muted-foreground">
				{child.modelName}
			</span>
			{!child.enabled ? (
				<span className="text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-400">
					disabled
				</span>
			) : null}
			{hasGrandchildren ? (
				<span
					className="text-[10px] italic text-muted-foreground"
					title="D-202-13 — sub-agent depth limited to 2. Grandchildren are not dispatched at runtime."
				>
					[depth limit reached]
				</span>
			) : null}
		</Link>
	);
}
