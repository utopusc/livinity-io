/**
 * Phase 202-06 — CronPicker.
 *
 * Controlled cron-field for the create form. Two surfaces:
 *
 *   1. Preset row — four buttons that fill the field with a canonical cron
 *      expression. Click `every 15m` → `*\/15 * * * *` (the literal `*/` slash
 *      escaped here in the JSDoc so the parser does not bail; runtime value
 *      is the standard 5-field expression). Pre-filled presets remove the
 *      "what do I type here?" friction the operator hits on a blank form.
 *
 *   2. Free-form Input — a standard text field bound to `value`. On change,
 *      the field is debounced 300 ms and the result is shipped to the
 *      server-side `agents.cronPreview` tRPC query. The same query that
 *      AgentEditForm consumes (Plan 202-05). Server-side wraps cronstrue +
 *      node-cron.validate, so the preview matches the exact validator the
 *      `agents.create` mutation enforces (D-202-15 + T-202-03).
 *
 * Empty value (`""`) = no schedule. Surfaces a small `No schedule.` hint so
 * the operator knows the cron path is intentionally off. The `Clear` preset
 * resets to empty.
 *
 * INV-202-05 — every visible string is English.
 */

"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface CronPickerProps {
	value: string;
	onChange: (next: string) => void;
}

interface CronPreviewState {
	valid: boolean | null;
	human: string | null;
}

/**
 * Common cron presets surfaced as one-click buttons. Each entry's `cron`
 * value is a valid 5-field expression (min hour dom month dow) the
 * server-side validator accepts (T-202-03). `null` cron is the "Clear"
 * affordance — equivalent to typing nothing.
 */
const PRESETS: ReadonlyArray<{ label: string; cron: string | null }> = [
	{ label: "Every 15m", cron: "*/15 * * * *" },
	{ label: "Hourly", cron: "0 * * * *" },
	{ label: "Daily 09:00", cron: "0 9 * * *" },
	{ label: "Weekly Mon 09:00", cron: "0 9 * * 1" },
	{ label: "Clear", cron: null },
];

function buildCronPreviewQs(cron: string): string {
	const envelope = { "0": { json: { cron } } };
	return `batch=1&input=${encodeURIComponent(JSON.stringify(envelope))}`;
}

async function fetchCronPreview(cron: string): Promise<CronPreviewState> {
	if (!cron.trim()) return { valid: null, human: null };
	try {
		const res = await fetch(
			`/trpc/agents.cronPreview?${buildCronPreviewQs(cron)}`,
			{ credentials: "include" },
		);
		if (!res.ok) return { valid: false, human: null };
		const data = await res.json();
		const v10 = data?.[0]?.result?.data;
		const v11 = data?.[0]?.result?.data?.json;
		const payload = (v11 ?? v10) as
			| { valid: boolean; human: string | null }
			| undefined;
		if (!payload) return { valid: false, human: null };
		return { valid: payload.valid, human: payload.human ?? null };
	} catch {
		return { valid: false, human: null };
	}
}

export function CronPicker({ value, onChange }: CronPickerProps) {
	const [preview, setPreview] = useState<CronPreviewState>({
		valid: null,
		human: null,
	});

	// Debounced cron preview — 300 ms after the operator stops typing, hit
	// the server-side cronstrue + node-cron.validate wrap. Matches the
	// debounce window AgentEditForm uses (350 ms there; 300 ms here picks
	// the create form's lighter-weight composer).
	useEffect(() => {
		const handle = window.setTimeout(() => {
			void fetchCronPreview(value).then(setPreview);
		}, 300);
		return () => window.clearTimeout(handle);
	}, [value]);

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center gap-2">
				{PRESETS.map((p) => {
					const isActive = p.cron !== null && p.cron === value;
					return (
						<button
							key={p.label}
							type="button"
							onClick={() => onChange(p.cron ?? "")}
							className={cn(
								"rounded-md border border-border/60 px-2.5 py-1 text-xs transition-colors",
								"hover:border-foreground/30 hover:bg-muted/40",
								isActive && "border-foreground/40 bg-muted/40 font-medium",
							)}
						>
							{p.label}
						</button>
					);
				})}
			</div>
			<Input
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder="*/15 * * * *"
				className="font-mono"
			/>
			<CronPreviewLine cron={value} preview={preview} />
		</div>
	);
}

function CronPreviewLine({
	cron,
	preview,
}: {
	cron: string;
	preview: CronPreviewState;
}) {
	if (!cron.trim()) {
		return (
			<p className="text-xs text-muted-foreground/80">
				No schedule — cron triggering is off.
			</p>
		);
	}
	if (preview.valid === false) {
		return (
			<p className="text-xs text-destructive">Invalid cron expression.</p>
		);
	}
	if (preview.valid === true && preview.human) {
		return (
			<p className="text-xs text-emerald-600 dark:text-emerald-400">
				{preview.human}
			</p>
		);
	}
	if (preview.valid === true) {
		return (
			<p className="text-xs text-muted-foreground">
				Cron is valid (no human preview available).
			</p>
		);
	}
	return (
		<p className="text-xs text-muted-foreground/60">Checking schedule…</p>
	);
}
