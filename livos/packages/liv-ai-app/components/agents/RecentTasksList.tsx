/**
 * Phase 202-05 — RecentTasksList.
 *
 * Renders the last 20 tasks for one agent. Driven by `useTasksList` which
 * polls `agents.tasks.list` every 10s + on window-focus. Each row has:
 *
 *   - Status badge   (running / completed / failed / cancelled)
 *   - Triggered-by   chip (cron / manual / parent / unknown)
 *   - Timestamp      (relative, absolute on hover via title)
 *   - "Open" button  navigates to /?threadId=… so the assistant-ui runtime
 *                     mounts the thread
 *
 * Empty state mirrors the dashboard's empty card surface — quiet "No runs
 * yet" message with no CTA. The detail page header owns the Run-now CTA.
 */

"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
	type TaskSummary,
	useTasksList,
} from "@/src/lib/agents/use-tasks-list";

interface RecentTasksListProps {
	agentId: string;
	limit?: number;
}

export function RecentTasksList({ agentId, limit = 20 }: RecentTasksListProps) {
	const { tasks, isLoading } = useTasksList(agentId, { limit });

	if (isLoading) {
		return (
			<div className="space-y-2">
				{[0, 1, 2].map((i) => (
					<div
						key={i}
						className="h-14 animate-pulse rounded-md border border-border bg-card/40"
					/>
				))}
			</div>
		);
	}
	if (tasks.length === 0) {
		return (
			<div className="rounded-md border border-dashed border-border bg-card/40 p-6 text-center">
				<p className="text-sm text-muted-foreground">No runs yet.</p>
			</div>
		);
	}
	return (
		<ul className="divide-y divide-border rounded-md border border-border bg-card/40">
			{tasks.map((task) => (
				<TaskRow key={task.threadId} task={task} />
			))}
		</ul>
	);
}

function TaskRow({ task }: { task: TaskSummary }) {
	const triggeredAbs = task.triggeredAt;
	const triggeredRel = relativeTime(task.triggeredAt);

	return (
		<li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
			<div className="flex min-w-0 flex-1 items-center gap-3">
				<TaskStatusBadge status={task.status} />
				<TriggeredByChip kind={task.triggeredBy} />
				<span
					className="truncate text-xs text-muted-foreground"
					title={triggeredAbs}
				>
					{triggeredRel}
				</span>
			</div>
			<div className="flex min-w-0 flex-1 items-center justify-end gap-3">
				{task.lastMessagePreview ? (
					<span
						className="line-clamp-1 max-w-md text-xs text-muted-foreground/80"
						title={task.lastMessagePreview}
					>
						{task.lastMessagePreview.slice(0, 80)}
					</span>
				) : (
					<span className="truncate text-xs text-muted-foreground/60">
						{task.title}
					</span>
				)}
				<Button asChild variant="outline" size="xs">
					<Link href={`/?threadId=${encodeURIComponent(task.threadId)}`}>
						Open
					</Link>
				</Button>
			</div>
		</li>
	);
}

function TaskStatusBadge({ status }: { status: TaskSummary["status"] }) {
	let dot: string;
	let label: string;
	switch (status) {
		case "running":
			dot = "bg-emerald-500 animate-pulse";
			label = "Running";
			break;
		case "failed":
			dot = "bg-red-500";
			label = "Failed";
			break;
		case "cancelled":
			dot = "bg-zinc-500";
			label = "Cancelled";
			break;
		default:
			dot = "bg-blue-500";
			label = "Completed";
			break;
	}
	return (
		<span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
			<span aria-hidden className={cn("size-2 rounded-full", dot)} />
			{label}
		</span>
	);
}

function TriggeredByChip({ kind }: { kind: string }) {
	let label: string;
	switch (kind) {
		case "cron":
			label = "cron";
			break;
		case "manual":
			label = "manual";
			break;
		case "parent_agent":
		case "parent":
			label = "parent";
			break;
		default:
			label = kind || "unknown";
			break;
	}
	return (
		<span className="rounded-sm bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
			{label}
		</span>
	);
}

/**
 * Small inline relative-time helper — mirrors the StatusBadge helper from
 * 202-04 (no date-fns dep). Returns short past-tense strings since the task
 * list only shows historical runs.
 */
function relativeTime(iso: string | undefined): string {
	if (!iso) return "unknown";
	const target = new Date(iso).getTime();
	if (Number.isNaN(target)) return "unknown";
	const diffMs = Date.now() - target;
	const absSec = Math.max(0, Math.round(diffMs / 1000));
	if (absSec < 30) return "just now";
	if (absSec < 60) return `${absSec}s ago`;
	if (absSec < 3600) return `${Math.round(absSec / 60)}m ago`;
	if (absSec < 86_400) return `${Math.round(absSec / 3600)}h ago`;
	return `${Math.round(absSec / 86_400)}d ago`;
}
