/**
 * Phase 202-06 — `/agents/new` create form page.
 *
 * Composes the four pickers shipped in Tasks 1-4 (CronPicker, ToolPicker,
 * SubAgentPicker, ModelPicker) + a name input + instructions textarea into
 * a single form bound to the `agents.create` tRPC mutation.
 *
 * Decisions:
 *   D-202-13   — SubAgentPicker filters out agents that already have a
 *                parent (depth ≤ 2 client-side; server enforces via DB
 *                trigger + AGENT_DEPTH_EXCEEDED).
 *   D-202-14   — Duplicate `name` → inline AGENT_NAME_TAKEN error.
 *   D-202-15   — Cron validated via the same debounced cronstrue preview
 *                CronPicker mounts; server rejects malformed via
 *                AGENT_CRON_INVALID inline.
 *   D-202-17   — Sub-agents share parent Memory (documented in
 *                SubAgentPicker hint).
 *   D-202-21 / INV-202-05 — English only.
 *   D-202-24   — Lives under `livos/packages/liv-ai-app/app/agents/new/`.
 *   INV-202-02 — NO backend changes. Reuses `agents.create` shipped in
 *                Plan 202-03.
 *
 * Submit path:
 *   POST `/trpc/agents.create?batch=1` with envelope `{0:{json:{…}}}`
 *   On success: parse the new agent id from the response and
 *   `router.push('/agents/{newId}')` so the detail page mounts. Next.js
 *   `next/navigation` automatically prepends the `basePath` (set to
 *   `/liv-ai-app` in production via next.config.ts).
 *
 * Same native-fetch transport pattern as `agents.update` in AgentEditForm
 * (Plan 202-05) — no `@trpc/react-query` client in the subapp.
 */

"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { CronPicker } from "@/components/agents/CronPicker";
import { ModelPicker } from "@/components/agents/ModelPicker";
import { SubAgentPicker } from "@/components/agents/SubAgentPicker";
import { ToolPicker } from "@/components/agents/ToolPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAgentsList } from "@/src/lib/agents/use-agents-list";
import type { LivosAgent } from "@/src/lib/agents/types";

type CreateState =
	| { kind: "idle" }
	| { kind: "creating" }
	| { kind: "error"; code: string; message: string }
	| { kind: "success" };

interface CreateInput {
	name: string;
	instructions: string;
	modelName: string;
	toolIds: string[];
	scheduleCron: string | null;
	parentAgentId: string | null;
	enabled: boolean;
}

export default function NewAgentPage() {
	const router = useRouter();
	const { agents: allAgents } = useAgentsList();

	// Form state — initialised to sane defaults that match the
	// `agents.create` zod schema.
	const [name, setName] = useState("");
	const [instructions, setInstructions] = useState("");
	const [modelName, setModelName] = useState("grok-4.3");
	const [toolIds, setToolIds] = useState<string[]>([]);
	const [scheduleCron, setScheduleCron] = useState<string>("");
	const [parentAgentId, setParentAgentId] = useState<string | null>(null);
	const [enabled, setEnabled] = useState<boolean>(true);
	const [state, setState] = useState<CreateState>({ kind: "idle" });

	const onSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();

			// Client-side guards — surface errors inline instead of round-
			// tripping a known-bad payload to the server.
			const trimmedName = name.trim();
			if (!trimmedName) {
				setState({
					kind: "error",
					code: "EMPTY_NAME",
					message: "Name is required.",
				});
				return;
			}

			setState({ kind: "creating" });

			const input: CreateInput = {
				name: trimmedName,
				instructions: instructions.trim(),
				modelName,
				toolIds,
				scheduleCron: scheduleCron.trim() === "" ? null : scheduleCron.trim(),
				parentAgentId,
				enabled,
			};

			try {
				const res = await fetch("/trpc/agents.create?batch=1", {
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ "0": { json: input } }),
				});

				if (!res.ok) {
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
								message =
									"An agent with this name already exists. Pick a different name.";
							} else if (errMsg === "AGENT_DEPTH_EXCEEDED") {
								message =
									"Sub-agent depth exceeds 2 — the selected parent is itself a child.";
							} else if (errMsg === "AGENT_CRON_INVALID") {
								message = "Schedule cron is invalid.";
							} else {
								message = errMsg;
							}
						}
					} catch {
						// fall through with generic HTTP message
					}
					setState({ kind: "error", code, message });
					return;
				}

				// Parse the created row from the tRPC batch envelope (v10 + v11
				// shapes covered defensively, mirroring use-agents-list.ts).
				const data = await res.json();
				const v10 = data?.[0]?.result?.data;
				const v11 = data?.[0]?.result?.data?.json;
				const created = (v11 ?? v10) as LivosAgent | undefined;
				if (!created || typeof created.id !== "string") {
					setState({
						kind: "error",
						code: "MALFORMED_RESPONSE",
						message:
							"The agent was created but the response was malformed. Refresh /agents to view it.",
					});
					return;
				}

				setState({ kind: "success" });
				// Hand off to the detail page so the operator can wire follow-up
				// edits + trigger Run now. `useRouter` from next/navigation
				// auto-prepends basePath (`/liv-ai-app` in production).
				router.push(`/agents/${created.id}`);
			} catch (err) {
				setState({
					kind: "error",
					code: "NETWORK",
					message: err instanceof Error ? err.message : "Network error",
				});
			}
		},
		[
			name,
			instructions,
			modelName,
			toolIds,
			scheduleCron,
			parentAgentId,
			enabled,
			router,
		],
	);

	const onCancel = useCallback(() => {
		router.back();
	}, [router]);

	const isCreating = state.kind === "creating";
	const nameError =
		state.kind === "error" &&
		(state.code === "AGENT_NAME_TAKEN" || state.code === "EMPTY_NAME")
			? state.message
			: null;
	const cronError =
		state.kind === "error" && state.code === "AGENT_CRON_INVALID"
			? state.message
			: null;
	const depthError =
		state.kind === "error" && state.code === "AGENT_DEPTH_EXCEEDED"
			? state.message
			: null;

	return (
		<div className="container mx-auto max-w-3xl px-6 py-8">
			<header className="mb-8">
				<h1 className="text-2xl font-semibold tracking-tight">New Agent</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Configure name, instructions, model, tools, schedule, and an
					optional parent agent. You can edit any of these later.
				</p>
			</header>

			<form onSubmit={onSubmit} className="space-y-6">
				<Field
					label="Name"
					hint="Must be unique across all agents. 1-120 characters."
					error={nameError}
				>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						maxLength={120}
						required
						placeholder="e.g. Daily Briefing"
						autoFocus
					/>
				</Field>

				<Field
					label="Instructions"
					hint="System prompt sent to the model on every run. Be specific."
				>
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
						placeholder="You are a helpful assistant that…"
					/>
				</Field>

				<Field label="Model" hint="Backed by the dynamic model resolver.">
					<ModelPicker value={modelName} onChange={setModelName} />
				</Field>

				<Field
					label="Tools"
					hint="Pick from the available tool catalog. Leave empty for full access."
				>
					<ToolPicker value={toolIds} onChange={setToolIds} />
				</Field>

				<Field
					label="Schedule (cron)"
					hint="Optional. 5-field cron expression. Leave blank for manual-only."
					error={cronError}
				>
					<CronPicker value={scheduleCron} onChange={setScheduleCron} />
				</Field>

				<Field
					label="Parent Agent"
					hint="Optional. Make this a delegated sub-agent of an existing top-level agent."
					error={depthError}
				>
					<SubAgentPicker
						value={parentAgentId}
						onChange={setParentAgentId}
						allAgents={allAgents}
					/>
				</Field>

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

				<div className="flex items-center justify-between gap-4 border-t border-border pt-4">
					<CreateStatusLine state={state} />
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="ghost"
							onClick={onCancel}
							disabled={isCreating}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isCreating}>
							{isCreating ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Creating…
								</>
							) : (
								"Create agent"
							)}
						</Button>
					</div>
				</div>
			</form>
		</div>
	);
}

interface FieldProps {
	label: string;
	hint?: string;
	error?: string | null;
	children: React.ReactNode;
}

function Field({ label, hint, error, children }: FieldProps) {
	return (
		<div className="space-y-1.5">
			<label className="block text-sm font-medium leading-none">{label}</label>
			{children}
			{error ? (
				<p className="text-xs text-destructive" role="alert">
					{error}
				</p>
			) : hint ? (
				<p className="text-xs text-muted-foreground/80">{hint}</p>
			) : null}
		</div>
	);
}

function CreateStatusLine({ state }: { state: CreateState }) {
	if (state.kind === "idle") return <span className="text-xs" aria-hidden />;
	if (state.kind === "creating") {
		return (
			<span className="text-xs text-muted-foreground">Creating agent…</span>
		);
	}
	if (state.kind === "success") {
		return (
			<span className="text-xs text-emerald-600 dark:text-emerald-400">
				Created — opening detail…
			</span>
		);
	}
	// Generic catch-all error line. Field-specific errors (name, cron, depth)
	// render under their respective Field above; this line carries the
	// remainder (network, MALFORMED_RESPONSE, etc.).
	if (
		state.code === "AGENT_NAME_TAKEN" ||
		state.code === "EMPTY_NAME" ||
		state.code === "AGENT_CRON_INVALID" ||
		state.code === "AGENT_DEPTH_EXCEEDED"
	) {
		return <span className="text-xs" aria-hidden />;
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
