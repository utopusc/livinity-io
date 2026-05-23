/**
 * Phase 202-06 — ModelPicker.
 *
 * Native-HTML `<select>` for picking an LLM model on the create / edit form.
 * Inputs:
 *
 *   - `value`     — current modelName string. Default for new agents is
 *                   `grok-4.3` (matches the `agents.create` zod default in
 *                   202-03 agent-router.ts).
 *   - `onChange`  — fires on selection change.
 *
 * Plan template references `mastra.agent.listAvailableModels`. That route
 * was NOT shipped in Wave 1 (the catalog is hardcoded in the dynamic model
 * resolver — Phase 197-04). To keep INV-202-02 (NO backend changes in Wave
 * 2), this component uses the same hardcoded 3-Grok set 202-05
 * AgentEditForm ships. Future plan can swap to a tRPC fetch without
 * breaking the `{value, onChange}` contract.
 *
 * Unknown values (e.g. legacy `kimi-for-coding` rows) get a preserved-as-is
 * fallback `<option>` so the operator does not silently lose state when
 * opening an old agent in the picker.
 *
 * INV-202-05 English UI only.
 */

"use client";

import { cn } from "@/lib/utils";

interface ModelPickerProps {
	value: string;
	onChange: (next: string) => void;
}

interface ModelOption {
	value: string;
	label: string;
	description: string;
}

const MODEL_OPTIONS: ReadonlyArray<ModelOption> = [
	{
		value: "grok-4.3",
		label: "Grok 4.3 (default)",
		description: "Balanced — best general-purpose pick.",
	},
	{
		value: "grok-4.3-fast",
		label: "Grok 4.3 Fast",
		description: "Lower latency, smaller context window.",
	},
	{
		value: "grok-4.3-reasoning",
		label: "Grok 4.3 Reasoning",
		description: "Slower but stronger on multi-step logic + tool chains.",
	},
];

export function ModelPicker({ value, onChange }: ModelPickerProps) {
	const isKnown = MODEL_OPTIONS.some((o) => o.value === value);
	const description = MODEL_OPTIONS.find((o) => o.value === value)?.description;

	return (
		<div className="space-y-1.5">
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={selectClassName}
				aria-label="Model"
			>
				{MODEL_OPTIONS.map((opt) => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
				{/* Preserve any unknown model the row already carries (legacy). */}
				{!isKnown ? (
					<option value={value}>{value} (existing)</option>
				) : null}
			</select>
			{description ? (
				<p className="text-xs text-muted-foreground/80">{description}</p>
			) : null}
		</div>
	);
}

const selectClassName = cn(
	"h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs",
	"outline-none transition-[color,box-shadow]",
	"focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
	"disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
);
