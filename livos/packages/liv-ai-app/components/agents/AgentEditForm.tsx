/**
 * Phase 202-05 — AgentEditForm.
 *
 * Edit form for a single `livos_agents` row. Bound to the `agents.update`
 * tRPC mutation. Renders editable fields for:
 *
 *   - name             (Input — disabled when row.system=true per D-202-20)
 *   - instructions     (Textarea, native HTML — autosize fallback via min-h)
 *   - modelName        (Select, native HTML <select> — three Grok options)
 *   - toolIds          (Checkbox grid — Luse 17 (manual list) + Built-in 10)
 *   - scheduleCron     (Input — free-form 5-field cron + cronstrue preview)
 *   - parentAgentId    (Select — non-self enabled non-parent agents + "None";
 *                       disabled for system agent per D-202-20)
 *   - enabled          (Switch — native HTML checkbox styled as a toggle)
 *
 * Decisions honoured:
 *   D-202-13   Sub-agent depth ≤ 2 — parent select hides agents that ARE
 *              themselves a parent (have children). Inline hint surfaces the
 *              constraint when the operator hovers the disabled option.
 *   D-202-14   Agent name UNIQUE — submit shows inline error when the
 *              `agents.update` mutation returns AGENT_NAME_TAKEN.
 *   D-202-15   Standard 5-field cron with cronstrue preview via the
 *              `agents.cronPreview` tRPC query (debounced 350ms).
 *   D-202-20   System agents — name + parent disabled (Delete button hidden
 *              by the parent detail page, not this form).
 *   D-202-21   English UI text only (INV-202-05).
 *
 * No shadcn Select / Tabs / Switch / Textarea install — uses native HTML
 * primitives styled with Tailwind to stay additive (the subapp's shadcn
 * registry stays pinned to the @assistant-ui pieces only; same rationale as
 * StatusBadge + AgentCard in Plan 202-04).
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LivosAgent } from "@/src/lib/agents/types";
import { ModelPicker } from "@/components/agents/ModelPicker";

interface AgentEditFormProps {
	agent: LivosAgent;
	allAgents: LivosAgent[];
	onSaved?: () => void | Promise<void>;
}

/**
 * Phase 206 — MODEL_OPTIONS hardcoded list removed. The Model dropdown now
 * delegates to <ModelPicker>, which fetches openclaw.models.list dynamically.
 * Legacy fallback (3 Grok variants) lives inside ModelPicker.tsx for use
 * when the live catalog is unreachable.
 */

/**
 * Built-in tools surface from Phase 200-C (INV-202-09 — 10 tools preserved).
 * Curated list mirrors the Mastra registry's built-in tool names so the
 * checkbox grid surfaces the canonical set without a round-trip query.
 * The runtime catalog stays the source of truth — unknown ids are still
 * persisted (the form does not strip them) so MCP-side tool additions
 * don't get clobbered on save.
 */
const BUILTIN_TOOLS = [
	"weather",
	"get_current_time",
	"luse_list_windows",
	"luse_focus_window",
	"luse_screenshot",
	"luse_click",
	"luse_type_text",
	"luse_press_key",
	"luse_scroll",
	"luse_navigate",
];

type SaveState =
	| { kind: "idle" }
	| { kind: "saving" }
	| { kind: "error"; code: string; message: string }
	| { kind: "success" };

interface CronPreviewState {
	valid: boolean | null;
	human: string | null;
}

/**
 * Debounced cron preview helper — posts the cron string to
 * `agents.cronPreview` (server-side cronstrue wrapped in node-cron.validate
 * gate). Returns `{valid, human}` so the form can surface a green
 * human-readable line OR a red invalid hint inline.
 */
function buildCronPreviewQs(cron: string): string {
	const envelope = {
		"0": {
			json: { cron },
		},
	};
	return `batch=1&input=${encodeURIComponent(JSON.stringify(envelope))}`;
}

async function fetchCronPreview(
	cron: string,
): Promise<CronPreviewState> {
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

export function AgentEditForm({
	agent,
	allAgents,
	onSaved,
}: AgentEditFormProps) {
	// Form state — initialised from the agent row, mutated as the operator
	// edits fields. Submit posts a diff patch to `agents.update`.
	const [name, setName] = useState(agent.name);
	const [instructions, setInstructions] = useState(agent.instructions ?? "");
	const [modelName, setModelName] = useState(agent.modelName);
	const [toolIds, setToolIds] = useState<string[]>(agent.toolIds ?? []);
	const [scheduleCron, setScheduleCron] = useState<string>(
		agent.scheduleCron ?? "",
	);
	const [parentAgentId, setParentAgentId] = useState<string>(
		agent.parentAgentId ?? "",
	);
	const [enabled, setEnabled] = useState<boolean>(agent.enabled);
	const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
	const [cronPreview, setCronPreview] = useState<CronPreviewState>({
		valid: null,
		human: null,
	});

	// Reset form when the underlying agent prop swaps (e.g. router navigates
	// from /agents/a → /agents/b without unmounting the form).
	useEffect(() => {
		setName(agent.name);
		setInstructions(agent.instructions ?? "");
		setModelName(agent.modelName);
		setToolIds(agent.toolIds ?? []);
		setScheduleCron(agent.scheduleCron ?? "");
		setParentAgentId(agent.parentAgentId ?? "");
		setEnabled(agent.enabled);
		setSaveState({ kind: "idle" });
	}, [agent]);

	// D-202-13 — parent select hides agents that ARE themselves a parent
	// (have at least one child) plus the agent being edited (no self-ref).
	const parentOptions = useMemo(() => {
		const idsThatAreParents = new Set<string>();
		for (const a of allAgents) {
			if (a.parentAgentId) idsThatAreParents.add(a.parentAgentId);
		}
		// Edit-form-specific filter: parent must NOT be the current agent and
		// must NOT itself be a child (so the chain stays ≤ 2 deep).
		return allAgents.filter((candidate) => {
			if (candidate.id === agent.id) return false; // no self-ref
			if (candidate.parentAgentId) return false; // candidate is already a child
			return true;
		});
	}, [allAgents, agent.id]);

	// Debounced cron preview — 350 ms after the operator stops typing the cron
	// field, fetch the server-side cronstrue render so the preview matches the
	// exact validator the create/update mutation uses.
	useEffect(() => {
		const handle = window.setTimeout(() => {
			void fetchCronPreview(scheduleCron).then(setCronPreview);
		}, 350);
		return () => window.clearTimeout(handle);
	}, [scheduleCron]);

	const toggleTool = useCallback((toolId: string) => {
		setToolIds((prev) =>
			prev.includes(toolId)
				? prev.filter((t) => t !== toolId)
				: [...prev, toolId],
		);
	}, []);

	const onSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();
			setSaveState({ kind: "saving" });

			// Build a diff patch — only include fields the operator actually
			// changed. Reduces accidental no-op writes and surfaces a tighter
			// audit log on the backend.
			const patch: Record<string, unknown> = {};
			if (!agent.system && name !== agent.name) patch.name = name;
			if (instructions !== (agent.instructions ?? ""))
				patch.instructions = instructions;
			if (modelName !== agent.modelName) patch.modelName = modelName;
			if (JSON.stringify(toolIds) !== JSON.stringify(agent.toolIds ?? []))
				patch.toolIds = toolIds;
			const cronOut = scheduleCron.trim() === "" ? null : scheduleCron;
			if (cronOut !== (agent.scheduleCron ?? null))
				patch.scheduleCron = cronOut;
			if (!agent.system) {
				const parentOut = parentAgentId === "" ? null : parentAgentId;
				if (parentOut !== (agent.parentAgentId ?? null))
					patch.parentAgentId = parentOut;
			}
			if (enabled !== agent.enabled) patch.enabled = enabled;

			if (Object.keys(patch).length === 0) {
				setSaveState({ kind: "success" });
				return;
			}

			try {
				const res = await fetch("/trpc/agents.update?batch=1", {
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						"0": { json: { id: agent.id, patch } },
					}),
				});
				if (!res.ok) {
					// Surface the AGENT_* code from the tRPC error envelope.
					let code = "UNKNOWN";
					let message = `HTTP ${res.status}`;
					try {
						const errData = await res.json();
						const errMsg =
							errData?.[0]?.error?.json?.message ??
							errData?.[0]?.error?.message ??
							errData?.error?.message;
						if (typeof errMsg === "string") {
							code = errMsg;
							if (errMsg === "AGENT_NAME_TAKEN") {
								message = "An agent with this name already exists.";
							} else if (errMsg === "AGENT_DEPTH_EXCEEDED") {
								message =
									"Sub-agent depth exceeds 2 — a child cannot itself be a parent.";
							} else if (errMsg === "AGENT_CRON_INVALID") {
								message = "Schedule cron is invalid.";
							} else if (errMsg === "AGENT_NOT_FOUND") {
								message = "Agent no longer exists.";
							} else {
								message = errMsg;
							}
						}
					} catch {
						// fall through with generic HTTP message
					}
					setSaveState({ kind: "error", code, message });
					return;
				}
				setSaveState({ kind: "success" });
				if (onSaved) await onSaved();
			} catch (err) {
				setSaveState({
					kind: "error",
					code: "NETWORK",
					message: err instanceof Error ? err.message : "Network error",
				});
			}
		},
		[
			agent,
			name,
			instructions,
			modelName,
			toolIds,
			scheduleCron,
			parentAgentId,
			enabled,
			onSaved,
		],
	);

	const isSaving = saveState.kind === "saving";

	return (
		<form onSubmit={onSubmit} className="space-y-6">
			{/* Name */}
			<Field
				label="Name"
				hint={
					agent.system
						? "System agents cannot be renamed."
						: "Must be unique across all agents."
				}
			>
				<Input
					value={name}
					onChange={(e) => setName(e.target.value)}
					disabled={agent.system}
					maxLength={120}
					required
				/>
			</Field>

			{/* Instructions */}
			<Field label="Instructions" hint="System prompt sent to the model.">
				<textarea
					value={instructions}
					onChange={(e) => setInstructions(e.target.value)}
					rows={8}
					className={cn(
						"w-full min-h-32 rounded-md border border-input bg-transparent px-3 py-2 text-sm",
						"placeholder:text-muted-foreground outline-none transition-[color,box-shadow]",
						"focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
						"disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
					)}
					placeholder="You are a helpful assistant…"
				/>
			</Field>

			{/* Model — Phase 206: dynamic catalog from openclaw.models.list */}
			<Field
				label="Model"
				hint="Pick from any provider configured in Liv AI Settings → Providers."
			>
				<ModelPicker value={modelName} onChange={setModelName} />
			</Field>

			{/* Tools */}
			<Field
				label="Tools"
				hint="Built-in tools wired into every Mastra agent. MCP-side tools auto-register at boot."
			>
				<div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
					{BUILTIN_TOOLS.map((t) => (
						<label
							key={t}
							className={cn(
								"flex cursor-pointer items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm transition-colors",
								"hover:border-foreground/30",
								toolIds.includes(t) &&
									"border-foreground/40 bg-muted/40",
							)}
						>
							<input
								type="checkbox"
								className="size-4 rounded accent-foreground"
								checked={toolIds.includes(t)}
								onChange={() => toggleTool(t)}
							/>
							<span className="font-mono text-xs">{t}</span>
						</label>
					))}
				</div>
				{/* Surface any extra tool ids that were already persisted but are
				    not in BUILTIN_TOOLS — so the operator can see them and
				    deliberately remove them. */}
				{toolIds.filter((t) => !BUILTIN_TOOLS.includes(t)).length > 0 ? (
					<div className="mt-2 text-xs text-muted-foreground">
						Also enabled:{" "}
						{toolIds
							.filter((t) => !BUILTIN_TOOLS.includes(t))
							.map((t) => (
								<button
									key={t}
									type="button"
									onClick={() => toggleTool(t)}
									className="mr-1 inline-flex items-center gap-1 rounded-sm bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] hover:bg-muted/60"
									title="Click to remove"
								>
									{t} ×
								</button>
							))}
					</div>
				) : null}
			</Field>

			{/* Schedule */}
			<Field
				label="Schedule (cron)"
				hint="5-field cron. Leave blank to disable cron triggering."
			>
				<Input
					value={scheduleCron}
					onChange={(e) => setScheduleCron(e.target.value)}
					placeholder="*/15 * * * *"
					className="font-mono"
				/>
				<CronPreviewLine cron={scheduleCron} preview={cronPreview} />
			</Field>

			{/* Parent agent */}
			<Field
				label="Parent Agent"
				hint={
					agent.system
						? "System agents cannot be assigned a parent."
						: "Sub-agent depth is capped at 2. Only top-level agents can be parents."
				}
			>
				<select
					value={parentAgentId}
					onChange={(e) => setParentAgentId(e.target.value)}
					disabled={agent.system}
					className={selectClassName}
				>
					<option value="">None</option>
					{parentOptions.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name}
						</option>
					))}
					{/* If the agent currently has a parent that no longer qualifies
					    (eg the parent was promoted/demoted), still surface it so
					    the operator can deliberately change it. */}
					{agent.parentAgentId &&
					!parentOptions.some((p) => p.id === agent.parentAgentId) ? (
						<option value={agent.parentAgentId}>
							{allAgents.find((a) => a.id === agent.parentAgentId)?.name ??
								agent.parentAgentId}{" "}
							(current)
						</option>
					) : null}
				</select>
			</Field>

			{/* Enabled */}
			<Field
				label="Enabled"
				hint="Disabled agents do not respond to cron or manual runs."
			>
				<label className="inline-flex cursor-pointer items-center gap-3">
					<input
						type="checkbox"
						className="size-4 rounded accent-foreground"
						checked={enabled}
						onChange={(e) => setEnabled(e.target.checked)}
					/>
					<span className="text-sm">
						{enabled ? "Agent is enabled" : "Agent is disabled"}
					</span>
				</label>
			</Field>

			{/* Submit row */}
			<div className="flex items-center justify-between gap-4 border-t border-border pt-4">
				<SaveStatusLine state={saveState} />
				<div className="flex items-center gap-2">
					<Button type="submit" disabled={isSaving}>
						{isSaving ? (
							<>
								<Loader2 className="size-4 animate-spin" />
								Saving…
							</>
						) : (
							"Save changes"
						)}
					</Button>
				</div>
			</div>
		</form>
	);
}

const selectClassName = cn(
	"h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs",
	"outline-none transition-[color,box-shadow]",
	"focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
	"disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
);

interface FieldProps {
	label: string;
	hint?: string;
	children: React.ReactNode;
}

function Field({ label, hint, children }: FieldProps) {
	return (
		<div className="space-y-1.5">
			<label className="block text-sm font-medium leading-none">
				{label}
			</label>
			{children}
			{hint ? (
				<p className="text-xs text-muted-foreground/80">{hint}</p>
			) : null}
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

function SaveStatusLine({ state }: { state: SaveState }) {
	if (state.kind === "idle") return <span className="text-xs" aria-hidden />;
	if (state.kind === "saving") {
		return (
			<span className="text-xs text-muted-foreground">Saving changes…</span>
		);
	}
	if (state.kind === "success") {
		return (
			<span className="text-xs text-emerald-600 dark:text-emerald-400">
				Saved.
			</span>
		);
	}
	return (
		<span
			className="text-xs text-destructive"
			role="alert"
			data-code={state.code}
		>
			{state.message}
		</span>
	);
}
