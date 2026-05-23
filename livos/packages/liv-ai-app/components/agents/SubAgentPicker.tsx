/**
 * Phase 202-06 — SubAgentPicker.
 *
 * Native-HTML `<select>` for binding a new agent under an existing parent.
 * Inputs:
 *
 *   - `value`           — currently-selected parent id, or `null` for top-level.
 *   - `onChange`        — fires with `string | null` when the operator picks.
 *   - `allAgents`       — full agents list from `useAgentsList`.
 *   - `excludeAgentId?` — optional id to filter out (no self-parent on
 *                         edit-form scenarios; create flow has no own id yet
 *                         so this is optional).
 *
 * D-202-13 / INV-202-06 — sub-agent depth ≤ 2. Client-side filter:
 *   - candidates with `parentAgentId !== null` are SHOWN but DISABLED with
 *     the suffix `(already a sub-agent)` so the operator sees the constraint
 *     instead of silently missing rows from the list. Saves the "why isn't
 *     X here?" support ticket.
 *
 * The server still enforces the constraint via the DB trigger from Plan
 * 202-01 + `mapRepoError` → `AGENT_DEPTH_EXCEEDED`. This client-side gate is
 * UX-only.
 *
 * D-202-17 inline hint — sub-agents share their parent's Memory instance
 * (Mastra Supervisor default). Surfaced below the select so the operator
 * is not surprised by cross-thread context.
 *
 * INV-202-05 English text only.
 */

"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import type { LivosAgent } from "@/src/lib/agents/types";

interface SubAgentPickerProps {
	value: string | null;
	onChange: (next: string | null) => void;
	allAgents: LivosAgent[];
	excludeAgentId?: string;
}

interface CandidateRow {
	agent: LivosAgent;
	disabled: boolean;
	disabledReason?: string;
}

export function SubAgentPicker({
	value,
	onChange,
	allAgents,
	excludeAgentId,
}: SubAgentPickerProps) {
	// Build the candidate list. We surface every agent (so the operator can
	// see the full registry), but disable the ones the server would reject.
	const candidates = useMemo<CandidateRow[]>(() => {
		const out: CandidateRow[] = [];
		for (const a of allAgents) {
			if (excludeAgentId && a.id === excludeAgentId) continue;
			if (a.parentAgentId) {
				out.push({
					agent: a,
					disabled: true,
					disabledReason: "already a sub-agent",
				});
			} else {
				out.push({ agent: a, disabled: false });
			}
		}
		// Sort alphabetically — easier scanning in long lists. System agent
		// (e.g. `livAi`) sorts naturally with the rest, no special pinning.
		out.sort((p, q) => p.agent.name.localeCompare(q.agent.name));
		return out;
	}, [allAgents, excludeAgentId]);

	const selectedAgent =
		value !== null ? allAgents.find((a) => a.id === value) ?? null : null;

	return (
		<div className="space-y-1.5">
			<select
				value={value ?? ""}
				onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
				className={selectClassName}
				aria-label="Parent agent"
			>
				<option value="">None — top-level agent</option>
				{candidates.map(({ agent, disabled, disabledReason }) => (
					<option
						key={agent.id}
						value={agent.id}
						disabled={disabled}
						title={disabled ? disabledReason : undefined}
					>
						{agent.name}
						{disabled ? ` (${disabledReason})` : ""}
					</option>
				))}
			</select>
			{selectedAgent ? (
				<p className="text-xs text-muted-foreground">
					This agent will be invokable by{" "}
					<span className="font-medium text-foreground">
						{selectedAgent.name}
					</span>{" "}
					and share its Memory thread context.
				</p>
			) : (
				<p className="text-xs text-muted-foreground/80">
					Top-level agents respond directly to chat + cron triggers. Pick a
					parent to make this a delegated sub-agent (depth limited to 2).
				</p>
			)}
		</div>
	);
}

const selectClassName = cn(
	"h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs",
	"outline-none transition-[color,box-shadow]",
	"focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
	"disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
);
