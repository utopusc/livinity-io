/**
 * Phase 202-07 — ModelsTab.
 *
 * Lists the 3 Grok models from `mastra.agent.listAvailableModels` plus the
 * current active model from `mastra.agent.getActiveModel`. Clicking a row
 * fires `mastra.agent.setActiveModel` (D-199-10 / D-202-12) which writes
 * Redis key `liv:config:active_model`.
 *
 * Affects only the default model resolution for agents that do NOT pin a
 * `modelName` on their row. Per-agent picks (set on `/agents/[id]` via
 * AgentEditForm) win over this global default.
 *
 * INV-202-05 — English copy only.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

interface ModelOption {
	id: string;
	name: string;
	description: string;
}

const LIST_QS =
	"batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%7D%7D%2C%221%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%7D%7D%7D";

interface BatchResult<T> {
	result?: { data?: T | { json?: T } };
	error?: { json?: { message?: string }; message?: string };
}

function unwrap<T>(entry: BatchResult<T> | undefined): T | null {
	if (!entry) return null;
	const direct = entry.result?.data;
	if (Array.isArray(direct)) return direct as T;
	if (direct && typeof direct === "object" && !("json" in direct)) return direct as T;
	const wrapped = (entry.result?.data as { json?: T } | undefined)?.json;
	if (wrapped !== undefined) return wrapped;
	return (direct as T) ?? null;
}

async function fetchModels(): Promise<{
	options: ModelOption[];
	active: string | null;
	error: string | null;
}> {
	try {
		const res = await fetch(
			`/trpc/mastra.agent.listAvailableModels,mastra.agent.getActiveModel?${LIST_QS}`,
			{ credentials: "include" },
		);
		if (!res.ok) {
			return {
				options: [],
				active: null,
				error: `Failed to load models (HTTP ${res.status})`,
			};
		}
		const data = (await res.json()) as Array<BatchResult<unknown>>;
		const listEntry = data?.[0] as BatchResult<ModelOption[]> | undefined;
		const activeEntry = data?.[1] as BatchResult<{ modelName: string }> | undefined;
		const options = unwrap<ModelOption[]>(listEntry) ?? [];
		const active = unwrap<{ modelName: string }>(activeEntry)?.modelName ?? null;
		const err = listEntry?.error?.json?.message ?? activeEntry?.error?.json?.message ?? null;
		return {
			options: Array.isArray(options) ? options : [],
			active,
			error: err,
		};
	} catch (e) {
		return {
			options: [],
			active: null,
			error: e instanceof Error ? e.message : "Network error",
		};
	}
}

async function setActiveModel(modelName: string): Promise<string | null> {
	try {
		const res = await fetch("/trpc/mastra.agent.setActiveModel?batch=1", {
			method: "POST",
			credentials: "include",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ "0": { json: { modelName } } }),
		});
		if (!res.ok) return `Set failed (HTTP ${res.status})`;
		const data = await res.json();
		const err = data?.[0]?.error?.json?.message ?? data?.[0]?.error?.message;
		if (err) return err;
		return null;
	} catch (e) {
		return e instanceof Error ? e.message : "Network error";
	}
}

export function ModelsTab() {
	const [options, setOptions] = useState<ModelOption[]>([]);
	const [active, setActive] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState<string | null>(null);
	const mountedRef = useRef<boolean>(true);

	const refetch = useCallback(async () => {
		const next = await fetchModels();
		if (!mountedRef.current) return;
		setOptions(next.options);
		setActive(next.active);
		setError(next.error);
		setIsLoading(false);
	}, []);

	useEffect(() => {
		mountedRef.current = true;
		void refetch();
		return () => {
			mountedRef.current = false;
		};
	}, [refetch]);

	const pick = useCallback(
		async (id: string) => {
			if (id === active) return;
			setPending(id);
			setError(null);
			const err = await setActiveModel(id);
			if (!mountedRef.current) return;
			if (err) {
				setError(err);
				setPending(null);
				return;
			}
			setActive(id);
			setPending(null);
		},
		[active],
	);

	return (
		<div className="space-y-4">
			<div>
				<h2 className="text-base font-medium">Default model</h2>
				<p className="text-xs text-muted-foreground/80">
					Used by every agent that does not pin its own model. Per-agent picks
					override this default.
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
			) : options.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					No models available. Connect an xAI account in onboarding.
				</p>
			) : (
				<ul className="space-y-2">
					{options.map((opt) => {
						const isActive = opt.id === active;
						const isPending = pending === opt.id;
						return (
							<li key={opt.id}>
								<button
									type="button"
									onClick={() => pick(opt.id)}
									disabled={isPending}
									className={cn(
										"flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
										isActive
											? "border-foreground/40 bg-muted/40"
											: "border-border/60 hover:border-foreground/30 hover:bg-muted/30",
										isPending && "opacity-60",
									)}
									aria-pressed={isActive}
								>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<span className="font-medium">{opt.name}</span>
											<span className="font-mono text-xs text-muted-foreground">
												{opt.id}
											</span>
										</div>
										<p className="mt-0.5 text-xs text-muted-foreground">
											{opt.description}
										</p>
									</div>
									{isActive ? (
										<span className="flex items-center gap-1 rounded-sm bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
											<Check className="size-3" />
											active
										</span>
									) : null}
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
