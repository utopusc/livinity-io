/**
 * Phase 206 — ModelPicker (dynamic).
 *
 * Native-HTML searchable dropdown for picking the LLM model an agent runs
 * against. Driven by the openclaw native CLI catalog
 * (`openclaw capability model list`) surfaced through livinityd as
 * `openclaw.models.list`. Replaces the hardcoded 3-Grok set Phase 202-06
 * shipped (legacy MODEL_OPTIONS) — operator UAT 2026-05-24 wants the same
 * 35+ provider × hundreds-of-models surface the Liv AI Providers tab now
 * exposes.
 *
 * Fetch path: bare native fetch to `/trpc/openclaw.models.list?input=…` per
 * the existing transport convention in this subapp (Phase 202-05 set the
 * pattern with `agents.cronPreview`). No `@trpc/react-query` client.
 *
 * Fallback: when the fetch fails (livinityd offline / openclaw CLI missing
 * locally during dev), the legacy 3-Grok set is shown so an existing agent
 * row never silently loses state.
 *
 * INV-202-05 English UI only.
 */

"use client";

import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";

interface ModelPickerProps {
	value: string;
	onChange: (next: string) => void;
}

interface ModelInfo {
	id: string;
	name?: string;
	provider: string;
	contextWindow?: number;
	reasoning?: boolean;
}

// ── Legacy fallback (used when openclaw.models.list fetch fails) ───────────

const LEGACY_OPTIONS: ReadonlyArray<{
	value: string;
	label: string;
	description: string;
	provider: string;
}> = [
	{
		value: "grok-4.3",
		label: "Grok 4.3 (default)",
		description: "Balanced — best general-purpose pick.",
		provider: "xai",
	},
	{
		value: "grok-4.3-fast",
		label: "Grok 4.3 Fast",
		description: "Lower latency, smaller context window.",
		provider: "xai",
	},
	{
		value: "grok-4.3-reasoning",
		label: "Grok 4.3 Reasoning",
		description: "Slower but stronger on multi-step logic + tool chains.",
		provider: "xai",
	},
];

const PROVIDER_LABEL: Record<string, string> = {
	xai: "xAI (Grok)",
	anthropic: "Anthropic (Claude)",
	openai: "OpenAI",
	"openai-codex": "OpenAI Codex / ChatGPT",
	google: "Google (Gemini)",
	groq: "Groq",
	mistral: "Mistral",
	openrouter: "OpenRouter",
	"amazon-bedrock": "Amazon Bedrock",
	"vercel-ai-gateway": "Vercel AI Gateway",
	"github-copilot": "GitHub Copilot",
	deepseek: "DeepSeek",
	fireworks: "Fireworks AI",
	huggingface: "Hugging Face",
	together: "Together AI",
	cerebras: "Cerebras",
	minimax: "MiniMax",
	moonshotai: "Moonshot AI",
	zai: "Z.AI",
	nvidia: "NVIDIA NIM",
	"cloudflare-ai-gateway": "Cloudflare AI Gateway",
	"cloudflare-workers-ai": "Cloudflare Workers AI",
	"azure-openai-responses": "Azure OpenAI",
	"google-vertex": "Google Vertex AI",
};

function labelOf(provider: string): string {
	return PROVIDER_LABEL[provider] ?? provider;
}

// ── Wire helper ─────────────────────────────────────────────────────────────

interface TrpcEnvelope<T> {
	result?: { data?: T | { json: T } };
	error?: { message?: string; json?: { message?: string } };
}

function unwrap<T>(env: TrpcEnvelope<T>): T | null {
	if (env.error) return null;
	const raw = env.result?.data;
	if (
		raw &&
		typeof raw === "object" &&
		"json" in (raw as Record<string, unknown>)
	) {
		return (raw as { json: T }).json;
	}
	return (raw as T) ?? null;
}

async function fetchModels(): Promise<ModelInfo[]> {
	const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
	const res = await fetch(`${baseUrl}/trpc/openclaw.models.list`, {
		method: "GET",
		credentials: "include",
		headers: { Accept: "application/json" },
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const env = (await res.json()) as TrpcEnvelope<ModelInfo[]>;
	const list = unwrap(env);
	return Array.isArray(list) ? list : [];
}

// ── Component ───────────────────────────────────────────────────────────────

export function ModelPicker({ value, onChange }: ModelPickerProps) {
	const [models, setModels] = useState<ModelInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [usingFallback, setUsingFallback] = useState(false);
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const list = await fetchModels();
				if (cancelled) return;
				if (list.length === 0) {
					setUsingFallback(true);
				}
				setModels(list);
			} catch {
				if (!cancelled) setUsingFallback(true);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	// Close on outside click
	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (!ref.current || !ref.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	const grouped = useMemo(() => {
		const safe = Array.isArray(models) ? models : [];
		const filtered = search.trim()
			? safe.filter((m) => {
					const q = search.trim().toLowerCase();
					return (
						m.id.toLowerCase().includes(q) ||
						(m.name ?? "").toLowerCase().includes(q) ||
						m.provider.toLowerCase().includes(q)
					);
				})
			: safe;
		const byProvider = new Map<string, ModelInfo[]>();
		for (const m of filtered) {
			const arr = byProvider.get(m.provider) ?? [];
			arr.push(m);
			byProvider.set(m.provider, arr);
		}
		return Array.from(byProvider.entries()).sort((a, b) =>
			a[0].localeCompare(b[0]),
		);
	}, [models, search]);

	// Determine the visible label for the current value
	const currentLabel = useMemo(() => {
		const found = models.find(
			(m) => m.id === value || `${m.provider}/${m.id}` === value,
		);
		if (found) return found.name ?? found.id;
		const legacy = LEGACY_OPTIONS.find((o) => o.value === value);
		if (legacy) return legacy.label;
		return value || "Choose model";
	}, [models, value]);

	if (loading) {
		return (
			<div className={selectClassName} aria-busy="true">
				Loading models…
			</div>
		);
	}

	if (usingFallback) {
		// Legacy fallback render — original 3-Grok set + preserved unknown.
		const isKnown = LEGACY_OPTIONS.some((o) => o.value === value);
		const description = LEGACY_OPTIONS.find((o) => o.value === value)?.description;
		return (
			<div className="space-y-1.5">
				<select
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className={selectClassName}
					aria-label="Model"
				>
					{LEGACY_OPTIONS.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
					{!isKnown ? (
						<option value={value}>{value} (existing)</option>
					) : null}
				</select>
				{description ? (
					<p className="text-xs text-muted-foreground/80">{description}</p>
				) : null}
				<p className="text-xs text-muted-foreground/80">
					Live model catalog unavailable — showing legacy fallback. Configure
					providers in Liv AI → Settings → Providers to unlock the full list.
				</p>
			</div>
		);
	}

	return (
		<div ref={ref} className="relative space-y-1.5">
			<button
				type="button"
				onClick={() => setOpen((p) => !p)}
				className={cn(selectClassName, "flex items-center justify-between text-left")}
				aria-label="Model"
				aria-expanded={open}
			>
				<span className="min-w-0 truncate font-mono">{currentLabel}</span>
				<span className="shrink-0 text-muted-foreground">{open ? "▲" : "▼"}</span>
			</button>
			{open ? (
				<div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-[420px] overflow-hidden rounded-md border border-input bg-popover shadow-lg">
					<input
						type="text"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search models or providers…"
						autoFocus
						className="w-full border-b border-input bg-transparent px-3 py-2 text-sm outline-none"
					/>
					<div className="max-h-[360px] overflow-y-auto">
						{grouped.length === 0 ? (
							<p className="px-3 py-6 text-center text-sm text-muted-foreground">
								No models match.
							</p>
						) : (
							grouped.map(([provider, list]) => (
								<div key={provider} className="border-b border-input/40 last:border-b-0">
									<div className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
										{labelOf(provider)} ({list.length})
									</div>
									{list.slice(0, 30).map((m) => {
										const id = m.id;
										const isCurrent = id === value || `${m.provider}/${id}` === value;
										return (
											<button
												key={`${provider}/${id}`}
												type="button"
												onClick={() => {
													onChange(id);
													setOpen(false);
													setSearch("");
												}}
												className={cn(
													"flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent",
													isCurrent ? "bg-accent" : "",
												)}
											>
												<span className="min-w-0 flex-1 truncate font-mono">{id}</span>
												{m.name && m.name !== id ? (
													<span className="shrink-0 text-xs text-muted-foreground">
														{m.name}
													</span>
												) : null}
												{isCurrent ? (
													<span className="shrink-0 text-xs">✓</span>
												) : null}
											</button>
										);
									})}
									{list.length > 30 ? (
										<p className="px-3 py-1 text-xs text-muted-foreground">
											{list.length - 30} more — refine search to narrow.
										</p>
									) : null}
								</div>
							))
						)}
					</div>
				</div>
			) : null}
			<p className="text-xs text-muted-foreground/80">
				{models.length} models across {grouped.length} providers. Configure
				more via Liv AI → Settings → Providers.
			</p>
		</div>
	);
}

const selectClassName = cn(
	"h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs",
	"outline-none transition-[color,box-shadow]",
	"focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
	"disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
);
