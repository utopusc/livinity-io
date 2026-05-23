/**
 * Phase 202-04 — StatusBadge component.
 *
 * Renders a single dot + label that reflects an agent's live status. Three
 * mutually-exclusive states (per plan task 5):
 *
 *   - idle       — gray dot, "Idle" label
 *   - running    — green dot with animate-pulse, "Running" label
 *   - scheduled  — blue dot, "Next: <relative time>" label using a
 *                  lightweight relative-time formatter
 *
 * Component is intentionally hand-rolled (no shadcn Badge dependency) so the
 * subapp stays additive-only — no new components added to the
 * `components/ui/` directory.
 */

"use client";

import { cn } from "@/lib/utils";

import type { AgentStatus } from "@/src/lib/agents/types";

interface StatusBadgeProps {
	state: AgentStatus["state"];
	lastRunAt?: string;
	nextScheduledAt?: string;
	className?: string;
}

/**
 * Lightweight `formatDistanceToNow`-style helper. Returns a short string like
 * `in 3m` / `2h ago` / `just now`. Avoids pulling `date-fns` for a single
 * use-site (~80 KB gzipped saved on the agents page bundle).
 */
function relativeTime(iso: string | undefined): string {
	if (!iso) return "soon";
	const target = new Date(iso).getTime();
	if (Number.isNaN(target)) return "soon";
	const diffMs = target - Date.now();
	const absSec = Math.round(Math.abs(diffMs) / 1000);
	const future = diffMs >= 0;
	let label: string;
	if (absSec < 30) {
		return future ? "in <1m" : "just now";
	}
	if (absSec < 60) label = `${absSec}s`;
	else if (absSec < 3600) label = `${Math.round(absSec / 60)}m`;
	else if (absSec < 86_400) label = `${Math.round(absSec / 3600)}h`;
	else label = `${Math.round(absSec / 86_400)}d`;
	return future ? `in ${label}` : `${label} ago`;
}

export function StatusBadge({
	state,
	lastRunAt,
	nextScheduledAt,
	className,
}: StatusBadgeProps) {
	let dotClass: string;
	let label: string;

	switch (state) {
		case "running":
			dotClass = "bg-emerald-500 animate-pulse";
			label = "Running";
			break;
		case "scheduled":
			dotClass = "bg-blue-500";
			label = `Next: ${relativeTime(nextScheduledAt)}`;
			break;
		default: {
			dotClass = "bg-zinc-400 dark:bg-zinc-500";
			label = lastRunAt ? `Idle · ${relativeTime(lastRunAt)}` : "Idle";
			break;
		}
	}

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground",
				className,
			)}
		>
			<span
				aria-hidden="true"
				className={cn("size-2 rounded-full", dotClass)}
			/>
			<span>{label}</span>
		</span>
	);
}
