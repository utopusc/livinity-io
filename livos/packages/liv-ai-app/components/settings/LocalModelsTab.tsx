/**
 * Phase 316-06 (LLM-01 / LLM-02) — LocalModelsTab.
 *
 * Renders under /settings -> Local Models. Manages local Ollama models:
 *
 *   1. Active model header — shows which model is currently Liv's provider
 *      (from getActiveModel) plus a "Revert to Claude" affordance
 *      (clearActiveModel, LLM-02). Claude is the default until an explicit
 *      selection is made.
 *
 *   2. Installed models — list of name + size with a per-row Delete and a
 *      per-row "Use as Liv model" button (setActiveModel — the explicit LLM-02
 *      selection). Empty state: "No local models installed."
 *
 *   3. Pull a model — input + a 1s poll-until-done progress banner (LLM-01). A
 *      failing RAM/disk guardrail BLOCKS BY DEFAULT and surfaces a "Pull anyway"
 *      button that re-issues the pull with override enabled.
 *
 * All lifecycle/polling lives in useOllamaModels; this component is a thin
 * renderer.
 *
 * INV-204-02 — every visible string is English. This subapp has no i18n layer
 * (no translation hook, no locale files) — same English-only convention as
 * ProvidersTab.
 */

"use client";

import {useCallback, useState} from "react";
import {
	AlertTriangle,
	CheckCircle2,
	Cpu,
	Download,
	Loader2,
	RotateCcw,
	Trash2,
} from "lucide-react";

import {Button} from "@/components/ui/button";
import {
	useOllamaModels,
	type OllamaModel,
	type PullGuardrails,
} from "@/src/lib/settings/use-ollama-models";

function formatBytes(bytes: number): string {
	if (!bytes || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value = value / 1024;
		unit++;
	}
	return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

export function LocalModelsTab() {
	const {
		models,
		activeModel,
		isLoading,
		error,
		pullTarget,
		pullProgress,
		pull,
		remove,
		setActive,
		revertToClaude,
	} = useOllamaModels();

	const [pullName, setPullName] = useState<string>("");
	const [busyModel, setBusyModel] = useState<string | null>(null);
	const [reverting, setReverting] = useState<boolean>(false);
	const [blockedGuardrail, setBlockedGuardrail] = useState<PullGuardrails | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);

	const doPull = useCallback(
		async (override: boolean) => {
			const name = pullName.trim();
			if (!name) return;
			setActionError(null);
			setBlockedGuardrail(null);
			const res = await pull(name, override);
			if (res && res.blocked) {
				// Guardrail failed — show the headroom warning + "Pull anyway".
				setBlockedGuardrail(res.guardrail);
				return;
			}
			if (res && res.started) {
				setPullName("");
			}
		},
		[pull, pullName],
	);

	const onUseAsLiv = useCallback(
		async (name: string) => {
			setBusyModel(name);
			setActionError(null);
			const res = await setActive(name);
			setBusyModel(null);
			if (!res.ok) setActionError(res.error ?? "Failed to set the active model.");
		},
		[setActive],
	);

	const onDelete = useCallback(
		async (name: string) => {
			const confirmed = window.confirm(
				`Delete the local model "${name}"? This frees its disk space and cannot be undone.`,
			);
			if (!confirmed) return;
			setBusyModel(name);
			setActionError(null);
			const res = await remove(name);
			setBusyModel(null);
			if (!res.ok) setActionError(res.error ?? "Failed to delete the model.");
		},
		[remove],
	);

	const onRevertToClaude = useCallback(async () => {
		setReverting(true);
		setActionError(null);
		const res = await revertToClaude();
		setReverting(false);
		if (!res.ok) setActionError(res.error ?? "Failed to revert to Claude.");
	}, [revertToClaude]);

	return (
		<div className="space-y-8">
			{/* Active model header ─────────────────────────────────────── */}
			<section className="space-y-3">
				<div>
					<h2 className="text-base font-medium">Liv's active model</h2>
					<p className="text-xs text-muted-foreground/80">
						Claude (via your subscription) is the default. Selecting a local
						model here routes Liv through Ollama on this Mini PC instead. Your
						Claude subscription path is never modified — only the active-model
						pointer changes.
					</p>
				</div>
				<div className="flex items-center justify-between rounded-md border border-border/60 px-4 py-3">
					<div className="flex items-center gap-2 text-sm">
						{activeModel ? (
							<>
								<Cpu className="size-4 text-emerald-500" />
								<span className="font-medium">{activeModel}</span>
								<span className="rounded-sm bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
									local (Ollama)
								</span>
							</>
						) : (
							<>
								<CheckCircle2 className="size-4 text-blue-500" />
								<span className="font-medium">Claude</span>
								<span className="text-xs text-muted-foreground">default</span>
							</>
						)}
					</div>
					{activeModel ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={reverting}
							onClick={() => void onRevertToClaude()}
						>
							{reverting ? (
								<Loader2 className="mr-1 size-3 animate-spin" />
							) : (
								<RotateCcw className="mr-1 size-3" />
							)}
							Revert to Claude
						</Button>
					) : null}
				</div>
			</section>

			{actionError ? (
				<p
					role="alert"
					className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
				>
					{actionError}
				</p>
			) : null}

			{/* Installed models ────────────────────────────────────────── */}
			<section className="space-y-3">
				<div>
					<h2 className="text-base font-medium">Installed models ({models.length})</h2>
					<p className="text-xs text-muted-foreground/80">
						Local models downloaded to this Mini PC via Ollama.
					</p>
				</div>

				{error ? (
					<p
						role="alert"
						className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
					>
						{error}
					</p>
				) : null}

				{isLoading ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : models.length === 0 ? (
					<p className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
						No local models installed. Pull one below to get started.
					</p>
				) : (
					<ul className="divide-y divide-border/60 rounded-md border border-border/60">
						{models.map((model) => (
							<ModelRow
								key={model.name}
								model={model}
								isActive={activeModel === model.name}
								busy={busyModel === model.name}
								onUseAsLiv={() => void onUseAsLiv(model.name)}
								onDelete={() => void onDelete(model.name)}
							/>
						))}
					</ul>
				)}
			</section>

			{/* Pull progress banner ────────────────────────────────────── */}
			<PullBanner target={pullTarget} progress={pullProgress} />

			{/* Guardrail block + Pull anyway ───────────────────────────── */}
			{blockedGuardrail ? (
				<GuardrailWarning
					guardrail={blockedGuardrail}
					onPullAnyway={() => void doPull(true)}
					onDismiss={() => setBlockedGuardrail(null)}
				/>
			) : null}

			{/* Pull a model ────────────────────────────────────────────── */}
			<section className="space-y-3">
				<div>
					<h2 className="text-base font-medium">Pull a model</h2>
					<p className="text-xs text-muted-foreground/80">
						Enter an Ollama model tag (for example{" "}
						<code className="rounded bg-muted px-1 py-0.5">llama3:8b</code> or{" "}
						<code className="rounded bg-muted px-1 py-0.5">qwen2.5:7b</code>). Large
						models need free RAM and disk — a headroom check runs first.
					</p>
				</div>
				<div className="flex flex-wrap items-end gap-3 rounded-md border border-border/60 px-4 py-4">
					<label className="min-w-[220px] flex-1 space-y-1">
						<span className="text-xs font-medium text-muted-foreground">
							Model tag
						</span>
						<input
							type="text"
							className="block w-full rounded-md border border-border/60 bg-background px-2 py-2 font-mono text-sm"
							placeholder="llama3:8b"
							autoComplete="off"
							spellCheck={false}
							value={pullName}
							onChange={(e) => setPullName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									void doPull(false);
								}
							}}
						/>
					</label>
					<Button
						type="button"
						variant="default"
						size="sm"
						disabled={!pullName.trim() || pullTarget !== null}
						onClick={() => void doPull(false)}
					>
						<Download className="mr-1 size-3" />
						Pull
					</Button>
				</div>
			</section>
		</div>
	);
}

// ── Sub-components ──────────────────────────────────────────────────────

interface ModelRowProps {
	model: OllamaModel;
	isActive: boolean;
	busy: boolean;
	onUseAsLiv: () => void;
	onDelete: () => void;
}

function ModelRow({model, isActive, busy, onUseAsLiv, onDelete}: ModelRowProps) {
	return (
		<li className="flex items-start gap-3 px-3 py-3 text-sm">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="font-mono font-medium">{model.name}</span>
					{isActive ? (
						<span className="rounded-sm bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
							active
						</span>
					) : null}
				</div>
				<p className="mt-0.5 text-xs text-muted-foreground">{formatBytes(model.size)}</p>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<Button
					type="button"
					variant={isActive ? "outline" : "default"}
					size="sm"
					disabled={busy || isActive}
					onClick={onUseAsLiv}
				>
					{busy ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
					Use as Liv model
				</Button>
				<button
					type="button"
					className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
					onClick={onDelete}
					disabled={busy}
					aria-label={`Delete ${model.name}`}
				>
					{busy ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
					Delete
				</button>
			</div>
		</li>
	);
}

interface PullBannerProps {
	target: string | null;
	progress: {
		percent: number;
		status: string;
		done: boolean;
		error?: string;
	} | null;
}

function PullBanner({target, progress}: PullBannerProps) {
	if (!target || !progress) return null;

	if (progress.error) {
		return (
			<div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
				<AlertTriangle className="mt-0.5 size-4 shrink-0" />
				<p>
					Pull of <span className="font-mono">{target}</span> failed:{" "}
					{progress.error}
				</p>
			</div>
		);
	}

	if (progress.done) {
		return (
			<div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
				<CheckCircle2 className="mt-0.5 size-4 shrink-0" />
				<p>
					Pulled <span className="font-mono">{target}</span>. It now appears in
					the installed models list.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-2 rounded-md border border-blue-500/40 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
			<div className="flex items-center gap-2">
				<Loader2 className="size-4 shrink-0 animate-spin" />
				<p>
					Pulling <span className="font-mono">{target}</span> — {progress.status}{" "}
					({progress.percent}%)
				</p>
			</div>
			<div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-500/20">
				<div
					className="h-full rounded-full bg-blue-500 transition-all"
					style={{width: `${Math.min(100, Math.max(0, progress.percent))}%`}}
				/>
			</div>
		</div>
	);
}

interface GuardrailWarningProps {
	guardrail: PullGuardrails;
	onPullAnyway: () => void;
	onDismiss: () => void;
}

function GuardrailWarning({guardrail, onPullAnyway, onDismiss}: GuardrailWarningProps) {
	const ramShort = !guardrail.ram.ok;
	const diskShort = !guardrail.disk.ok;
	return (
		<div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
			<div className="flex items-start gap-2">
				<AlertTriangle className="mt-0.5 size-4 shrink-0" />
				<div className="space-y-1">
					<p className="font-medium">
						This pull was blocked — not enough headroom (needs about{" "}
						{guardrail.estimate.gb} GB).
					</p>
					{ramShort ? (
						<p>
							RAM: {guardrail.ram.availableGb} GB free, needs{" "}
							{guardrail.ram.neededGb} GB.
						</p>
					) : null}
					{diskShort ? (
						<p>
							Disk: {guardrail.disk.availableGb} GB free, needs{" "}
							{guardrail.disk.neededGb} GB.
						</p>
					) : null}
					<p className="opacity-80">
						Pulling anyway may make this Mini PC unresponsive or fail partway.
					</p>
				</div>
			</div>
			<div className="flex gap-2">
				<Button type="button" variant="destructive" size="sm" onClick={onPullAnyway}>
					Pull anyway
				</Button>
				<button
					type="button"
					onClick={onDismiss}
					className="text-[11px] underline opacity-70 hover:opacity-100"
				>
					Cancel
				</button>
			</div>
		</div>
	);
}
