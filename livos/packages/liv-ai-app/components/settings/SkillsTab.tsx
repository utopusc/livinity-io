/**
 * Phase 219 T7 — Skills tab.
 *
 * Two-section panel:
 *   1. Browse Marketplace — curated skill cards grouped by category.
 *      Click Install → writes SKILL.md into ~bruce/livinity/<agent>/skills/
 *      <slug>/SKILL.md via the skills.market.install mutation.
 *   2. Installed (per-agent) — operator picks an agent (defaults to liv-ai),
 *      sees which marketplace skills are present, can Remove with confirm.
 *
 * Per RESEARCH-skills-market.md: in-product only, telemetry-free, shadcn/ui
 * tokens, colorful category emoji (no monochrome — per feedback_v36).
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface MarketSkillCard {
	slug: string;
	name: string;
	description: string;
	category:
		| "code-review"
		| "frontend"
		| "devops"
		| "prompt"
		| "brainstorm"
		| "research"
		| "debug";
	tools: string[];
	verified: boolean;
}

interface InstalledSkill {
	name: string;
	slug: string;
	description: string;
}

const CATEGORY_EMOJI: Record<MarketSkillCard["category"], string> = {
	"code-review": "🔍",
	frontend: "🎨",
	devops: "🛠️",
	prompt: "💬",
	brainstorm: "💡",
	research: "📚",
	debug: "🐞",
};

const DEFAULT_AGENT = "liv-ai";

async function trpcFetch<T>(
	path: string,
	method: "GET" | "POST",
	body?: unknown,
): Promise<T> {
	if (method === "GET") {
		const input = body === undefined
			? "%7B%220%22%3A%7B%22json%22%3Anull%7D%7D"
			: encodeURIComponent(JSON.stringify({0: {json: body}}));
		const res = await fetch(`/trpc/${path}?batch=1&input=${input}`, {
			credentials: "include",
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		const err = data?.[0]?.error?.json?.message;
		if (err) throw new Error(err);
		return data?.[0]?.result?.data?.json as T;
	}
	const res = await fetch(`/trpc/${path}?batch=1`, {
		method: "POST",
		credentials: "include",
		headers: {"content-type": "application/json"},
		body: JSON.stringify({0: {json: body ?? null}}),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const data = await res.json();
	const err = data?.[0]?.error?.json?.message;
	if (err) throw new Error(err);
	return data?.[0]?.result?.data?.json as T;
}

export function SkillsTab() {
	const [market, setMarket] = useState<MarketSkillCard[] | null>(null);
	const [marketErr, setMarketErr] = useState<string | null>(null);

	const [agent, setAgent] = useState<string>(DEFAULT_AGENT);
	const [installed, setInstalled] = useState<InstalledSkill[]>([]);
	const [installedErr, setInstalledErr] = useState<string | null>(null);

	const [actingOn, setActingOn] = useState<string | null>(null);
	const [actionMsg, setActionMsg] = useState<string | null>(null);

	const loadMarket = useCallback(async () => {
		setMarketErr(null);
		try {
			const data = await trpcFetch<MarketSkillCard[]>("skills.market.list", "GET", undefined);
			setMarket(data);
		} catch (e) {
			setMarketErr(e instanceof Error ? e.message : "Failed to load marketplace");
		}
	}, []);

	const loadInstalled = useCallback(async () => {
		setInstalledErr(null);
		try {
			const data = await trpcFetch<{skills: InstalledSkill[]}>(
				"skills.list",
				"GET",
				{agentSlug: agent},
			);
			setInstalled(data?.skills ?? []);
		} catch (e) {
			setInstalledErr(e instanceof Error ? e.message : "Failed to load installed list");
		}
	}, [agent]);

	useEffect(() => {
		void loadMarket();
	}, [loadMarket]);

	useEffect(() => {
		void loadInstalled();
	}, [loadInstalled]);

	const install = async (skill: MarketSkillCard) => {
		setActingOn(skill.slug);
		setActionMsg(null);
		try {
			await trpcFetch("skills.market.install", "POST", {
				agentSlug: agent,
				skillSlug: skill.slug,
			});
			await loadInstalled();
			setActionMsg(`Installed "${skill.name}" on ${agent}.`);
		} catch (e) {
			setActionMsg(e instanceof Error ? `Install failed: ${e.message}` : "Install failed");
		} finally {
			setActingOn(null);
		}
	};

	const uninstall = async (slug: string) => {
		if (!window.confirm(`Remove skill "${slug}" from ${agent}?`)) return;
		setActingOn(slug);
		setActionMsg(null);
		try {
			await trpcFetch("skills.delete", "POST", {agentSlug: agent, skillSlug: slug});
			await loadInstalled();
			setActionMsg(`Removed "${slug}".`);
		} catch (e) {
			setActionMsg(e instanceof Error ? `Remove failed: ${e.message}` : "Remove failed");
		} finally {
			setActingOn(null);
		}
	};

	const installedSlugs = useMemo(() => new Set(installed.map((s) => s.slug)), [installed]);

	const grouped = useMemo(() => {
		const out: Record<string, MarketSkillCard[]> = {};
		for (const s of market ?? []) {
			(out[s.category] ??= []).push(s);
		}
		return out;
	}, [market]);

	return (
		<div className="space-y-8">
			{/* ── Agent selector ─────────────────────────────────────────── */}
			<section className="space-y-2">
				<label className="text-sm font-medium">Agent</label>
				<div className="flex items-center gap-2">
					<input
						type="text"
						value={agent}
						onChange={(e) =>
							setAgent(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
						}
						placeholder="liv-ai"
						className="h-8 max-w-[200px] rounded-md border border-input bg-transparent px-2 font-mono text-sm"
					/>
					<p className="text-xs text-muted-foreground">
						Skills get written under <code className="font-mono">~bruce/livinity/{agent}/skills/&lt;slug&gt;/SKILL.md</code>.
					</p>
				</div>
			</section>

			{actionMsg ? (
				<div className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
					{actionMsg}
				</div>
			) : null}

			{/* ── Installed ──────────────────────────────────────────────── */}
			<section className="space-y-3">
				<div>
					<h2 className="text-base font-medium">Installed ({installed.length})</h2>
					<p className="text-xs text-muted-foreground/80">
						SKILL.md files currently present in the agent&apos;s skills dir.
					</p>
				</div>
				{installedErr ? (
					<p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
						{installedErr}
					</p>
				) : installed.length === 0 ? (
					<p className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
						No skills installed for {agent}. Pick from the marketplace below.
					</p>
				) : (
					<ul className="divide-y divide-border/60 rounded-md border border-border/60">
						{installed.map((s) => (
							<li key={s.slug} className="flex items-start gap-3 px-3 py-2 text-sm">
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className="font-medium">{s.name}</span>
										<span className="font-mono text-xs text-muted-foreground">{s.slug}</span>
									</div>
									<p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
								</div>
								<button
									type="button"
									className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
									onClick={() => uninstall(s.slug)}
									disabled={actingOn === s.slug}
								>
									<Trash2 className="size-3" />
									Remove
								</button>
							</li>
						))}
					</ul>
				)}
			</section>

			{/* ── Marketplace ────────────────────────────────────────────── */}
			<section className="space-y-3">
				<div>
					<h2 className="text-base font-medium">Marketplace</h2>
					<p className="text-xs text-muted-foreground/80">
						Curated skills grouped by category. Click Install to write the SKILL.md.
					</p>
				</div>

				{marketErr ? (
					<p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
						{marketErr}
					</p>
				) : market === null ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : (
					<div className="space-y-5">
						{Object.entries(grouped)
							.sort(([a], [b]) => a.localeCompare(b))
							.map(([category, items]) => (
								<div key={category} className="space-y-1.5">
									<h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
										<span>{CATEGORY_EMOJI[category as MarketSkillCard["category"]] ?? "•"}</span>
										{category}
									</h3>
									<ul className="divide-y divide-border/60 rounded-md border border-border/60">
										{items.map((skill) => {
											const installedHere = installedSlugs.has(skill.slug);
											return (
												<li
													key={skill.slug}
													className="flex items-start gap-3 px-3 py-2 text-sm"
												>
													<div className="min-w-0 flex-1">
														<div className="flex items-center gap-2">
															<span className="font-medium">{skill.name}</span>
															{skill.verified ? (
																<CheckCircle2
																	className="size-3 text-emerald-500"
																	aria-label="Verified by Livinity"
																/>
															) : null}
															<span className="font-mono text-xs text-muted-foreground">
																{skill.slug}
															</span>
														</div>
														<p className="mt-0.5 text-xs text-muted-foreground">
															{skill.description}
														</p>
													</div>
													<Button
														size="sm"
														variant={installedHere ? "outline" : "default"}
														disabled={actingOn === skill.slug}
														onClick={() => install(skill)}
													>
														{actingOn === skill.slug ? (
															<Loader2 className="size-3 animate-spin" />
														) : installedHere ? (
															"Re-install"
														) : (
															"Install"
														)}
													</Button>
												</li>
											);
										})}
									</ul>
								</div>
							))}
					</div>
				)}
			</section>
		</div>
	);
}
