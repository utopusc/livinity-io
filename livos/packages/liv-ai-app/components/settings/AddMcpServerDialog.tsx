/**
 * Phase 202-07 — AddMcpServerDialog.
 *
 * Modal form for creating a new external MCP server entry in Redis hash
 * `liv:mcp:config` (D-202-12). Fields:
 *
 *   - **Name** — alphanumeric + dash/underscore, max 64 chars. Surfaces
 *     MCP_NAME_TAKEN inline if the server reports a CONFLICT.
 *   - **Transport** — stdio | http (radio).
 *   - **Command + Args** (stdio only) — args entered one-per-line in a
 *     textarea, normalised by `splitArgs`.
 *   - **URL** (http only).
 *   - **Env vars** — key=value rows; collapsible.
 *   - **Enabled** — boolean (default true).
 *
 * On submit, POSTs `mcp.config.add` via the tRPC v10 batch envelope and on
 * success calls `onAdded()` so the parent McpTab can refetch the list. Errors
 * surface inline; the dialog stays open so the operator can correct + retry.
 *
 * INV-202-05 — English copy only.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Plus, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

interface McpCatalogEntry {
	name: string;
	transport: "stdio" | "http";
	command?: string;
	args?: string[];
	url?: string;
	env?: Record<string, string>;
	description: string;
	category: string;
}

interface AddMcpServerDialogProps {
	open: boolean;
	onOpenChange: (next: boolean) => void;
	existingNames: string[];
	/**
	 * Phase 219 T1 — optional `warnings` parameter so the parent can surface
	 * non-blocking mutation warnings (e.g. openclaw.json mirror failure) in a
	 * toast or banner after the dialog closes. Pre-219 callers that pass a
	 * zero-arg callback still work.
	 */
	onAdded: (warnings?: string[]) => Promise<void> | void;
}

interface EnvRow {
	key: string;
	value: string;
}

const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

function splitArgs(textarea: string): string[] {
	return textarea
		.split(/\r?\n/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

function buildEnv(rows: EnvRow[]): Record<string, string> | undefined {
	const cleaned: Record<string, string> = {};
	for (const r of rows) {
		const k = r.key.trim();
		if (k.length === 0) continue;
		cleaned[k] = r.value;
	}
	return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

export function AddMcpServerDialog({
	open,
	onOpenChange,
	existingNames,
	onAdded,
}: AddMcpServerDialogProps) {
	const [name, setName] = useState<string>("");
	const [transport, setTransport] = useState<"stdio" | "http">("stdio");
	const [command, setCommand] = useState<string>("");
	const [argsText, setArgsText] = useState<string>("");
	const [url, setUrl] = useState<string>("");
	const [envRows, setEnvRows] = useState<EnvRow[]>([]);
	const [enabled, setEnabled] = useState<boolean>(true);

	const [submitting, setSubmitting] = useState<boolean>(false);
	const [nameError, setNameError] = useState<string | null>(null);
	const [formError, setFormError] = useState<string | null>(null);

	// Phase 219 T2 — Browse catalog panel.
	const [mode, setMode] = useState<"form" | "browse">("form");
	const [catalog, setCatalog] = useState<McpCatalogEntry[] | null>(null);
	const [catalogError, setCatalogError] = useState<string | null>(null);
	const [catalogFilter, setCatalogFilter] = useState<string>("");

	const loadCatalog = useCallback(async () => {
		setCatalogError(null);
		try {
			const res = await fetch("/trpc/mcp.config.catalog?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D", {
				credentials: "include",
			});
			if (!res.ok) {
				setCatalogError(`Catalog fetch failed (HTTP ${res.status})`);
				return;
			}
			const data = await res.json();
			const list = data?.[0]?.result?.data?.json;
			if (!Array.isArray(list)) {
				setCatalogError("Catalog returned an unexpected shape.");
				return;
			}
			setCatalog(list as McpCatalogEntry[]);
		} catch (e) {
			setCatalogError(e instanceof Error ? e.message : "Network error");
		}
	}, []);

	useEffect(() => {
		if (mode === "browse" && catalog === null) {
			void loadCatalog();
		}
	}, [mode, catalog, loadCatalog]);

	const applyCatalogEntry = (entry: McpCatalogEntry) => {
		// Suggest the catalog name but let the operator edit/dedupe.
		let suggested = entry.name;
		let i = 2;
		while (existingNames.includes(suggested)) {
			suggested = `${entry.name}-${i}`;
			i += 1;
		}
		setName(suggested);
		setTransport(entry.transport);
		setCommand(entry.command ?? "");
		setArgsText((entry.args ?? []).join("\n"));
		setUrl(entry.url ?? "");
		setEnvRows(
			Object.entries(entry.env ?? {}).map(([key, value]) => ({key, value})),
		);
		setNameError(null);
		setFormError(null);
		setMode("form");
	};

	const reset = () => {
		setName("");
		setTransport("stdio");
		setCommand("");
		setArgsText("");
		setUrl("");
		setEnvRows([]);
		setEnabled(true);
		setNameError(null);
		setFormError(null);
		setSubmitting(false);
		setMode("form");
		setCatalogFilter("");
	};

	const handleOpenChange = (next: boolean) => {
		if (!next) reset();
		onOpenChange(next);
	};

	const validate = (): boolean => {
		setNameError(null);
		setFormError(null);
		const trimmed = name.trim();
		if (trimmed.length === 0) {
			setNameError("Name is required.");
			return false;
		}
		if (!NAME_PATTERN.test(trimmed)) {
			setNameError("Use only letters, numbers, dashes, or underscores.");
			return false;
		}
		if (existingNames.includes(trimmed)) {
			setNameError("An MCP server with this name already exists.");
			return false;
		}
		if (transport === "stdio") {
			if (command.trim().length === 0) {
				setFormError("Command is required for stdio transport.");
				return false;
			}
		} else {
			const trimmedUrl = url.trim();
			if (trimmedUrl.length === 0) {
				setFormError("URL is required for HTTP transport.");
				return false;
			}
			try {
				// new URL throws on malformed input — surface as inline form error
				// before round-tripping to the server.
				// eslint-disable-next-line no-new
				new URL(trimmedUrl);
			} catch {
				setFormError("URL must be a valid absolute URL.");
				return false;
			}
		}
		return true;
	};

	const submit = async () => {
		if (!validate()) return;
		setSubmitting(true);
		const payload: Record<string, unknown> = {
			name: name.trim(),
			transport,
			enabled,
		};
		if (transport === "stdio") {
			payload.command = command.trim();
			const args = splitArgs(argsText);
			if (args.length > 0) payload.args = args;
		} else {
			payload.url = url.trim();
		}
		const env = buildEnv(envRows);
		if (env) payload.env = env;

		try {
			const res = await fetch("/trpc/mcp.config.add?batch=1", {
				method: "POST",
				credentials: "include",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ "0": { json: payload } }),
			});
			if (!res.ok) {
				setFormError(`Add failed (HTTP ${res.status})`);
				setSubmitting(false);
				return;
			}
			const data = await res.json();
			const errMsg = data?.[0]?.error?.json?.message ?? data?.[0]?.error?.message;
			if (errMsg) {
				if (typeof errMsg === "string" && errMsg.includes("MCP_NAME_TAKEN")) {
					setNameError("An MCP server with this name already exists.");
				} else {
					setFormError(errMsg);
				}
				setSubmitting(false);
				return;
			}
			// Phase 219 T1 — surface non-blocking warnings (openclaw mirror,
			// etc.) so the operator knows about partial-success cases.
			const result = data?.[0]?.result?.data?.json;
			const warnings: string[] = Array.isArray(result?.warnings)
				? (result.warnings.filter((w: unknown): w is string => typeof w === "string"))
				: [];
			await onAdded(warnings.length > 0 ? warnings : undefined);
			handleOpenChange(false);
		} catch (e) {
			setFormError(e instanceof Error ? e.message : "Network error");
			setSubmitting(false);
		}
	};

	const filteredCatalog = catalog
		? catalog.filter((entry) => {
				if (catalogFilter.trim().length === 0) return true;
				const q = catalogFilter.trim().toLowerCase();
				return (
					entry.name.toLowerCase().includes(q) ||
					entry.category.toLowerCase().includes(q) ||
					entry.description.toLowerCase().includes(q)
				);
			})
		: [];
	const grouped: Record<string, McpCatalogEntry[]> = {};
	for (const entry of filteredCatalog) {
		(grouped[entry.category] ??= []).push(entry);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{mode === "browse" ? "Browse MCP catalog" : "Add MCP server"}
					</DialogTitle>
					<DialogDescription>
						{mode === "browse"
							? "Pick a curated MCP server; the Add form pre-fills with command + env."
							: "Persists to "}
						{mode === "browse" ? null : (
							<code className="font-mono">liv:mcp:config</code>
						)}
						{mode === "browse"
							? null
							: ". Changes take effect after the next service restart."}
					</DialogDescription>
				</DialogHeader>

				{mode === "browse" ? (
					<div className="space-y-3">
						<button
							type="button"
							className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
							onClick={() => setMode("form")}
						>
							<ArrowLeft className="size-3" /> Back to form
						</button>
						<div className="relative">
							<Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={catalogFilter}
								onChange={(e) => setCatalogFilter(e.target.value)}
								placeholder="Filter by name, category, or description…"
								className="pl-7"
							/>
						</div>
						{catalogError ? (
							<p
								role="alert"
								className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
							>
								{catalogError}
							</p>
						) : catalog === null ? (
							<p className="text-sm text-muted-foreground">Loading catalog…</p>
						) : filteredCatalog.length === 0 ? (
							<p className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
								No catalog entries match "{catalogFilter}".
							</p>
						) : (
							<div className="max-h-[400px] space-y-4 overflow-y-auto pr-1">
								{Object.entries(grouped)
									.sort(([a], [b]) => a.localeCompare(b))
									.map(([category, entries]) => (
										<div key={category} className="space-y-1.5">
											<h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
												{category}
											</h3>
											<ul className="divide-y divide-border/60 rounded-md border border-border/60">
												{entries.map((entry) => {
													const alreadyInstalled = existingNames.includes(entry.name);
													return (
														<li
															key={entry.name}
															className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
														>
															<div className="min-w-0 flex-1">
																<div className="flex items-center gap-2">
																	<span className="font-medium">{entry.name}</span>
																	<span className="rounded-sm bg-muted px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
																		{entry.transport}
																	</span>
																	{alreadyInstalled ? (
																		<span className="rounded-sm bg-amber-500/15 px-1 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
																			already installed
																		</span>
																	) : null}
																</div>
																<p className="mt-0.5 text-xs text-muted-foreground">
																	{entry.description}
																</p>
															</div>
															<Button
																type="button"
																size="sm"
																variant={alreadyInstalled ? "outline" : "default"}
																onClick={() => applyCatalogEntry(entry)}
															>
																Use
															</Button>
														</li>
													);
												})}
											</ul>
										</div>
									))}
							</div>
						)}
					</div>
				) : (
				<div className="space-y-4">
					<button
						type="button"
						className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs hover:bg-muted/40"
						onClick={() => setMode("browse")}
					>
						<Search className="size-3" /> Browse catalog
					</button>
					{/* Name */}
					<div className="space-y-1.5">
						<label htmlFor="mcp-add-name" className="text-sm font-medium">
							Name
						</label>
						<Input
							id="mcp-add-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. playwright"
							disabled={submitting}
							autoFocus
						/>
						{nameError ? (
							<p role="alert" className="text-xs text-destructive">
								{nameError}
							</p>
						) : null}
					</div>

					{/* Transport */}
					<div className="space-y-1.5">
						<label className="text-sm font-medium">Transport</label>
						<div className="flex gap-4 text-sm">
							<label className="flex cursor-pointer items-center gap-2">
								<input
									type="radio"
									className="accent-foreground"
									checked={transport === "stdio"}
									onChange={() => setTransport("stdio")}
									disabled={submitting}
								/>
								<span>stdio</span>
							</label>
							<label className="flex cursor-pointer items-center gap-2">
								<input
									type="radio"
									className="accent-foreground"
									checked={transport === "http"}
									onChange={() => setTransport("http")}
									disabled={submitting}
								/>
								<span>http</span>
							</label>
						</div>
					</div>

					{/* Transport-specific fields */}
					{transport === "stdio" ? (
						<>
							<div className="space-y-1.5">
								<label htmlFor="mcp-add-command" className="text-sm font-medium">
									Command
								</label>
								<Input
									id="mcp-add-command"
									value={command}
									onChange={(e) => setCommand(e.target.value)}
									placeholder="e.g. npx"
									disabled={submitting}
								/>
							</div>
							<div className="space-y-1.5">
								<label htmlFor="mcp-add-args" className="text-sm font-medium">
									Args <span className="text-xs text-muted-foreground">(one per line)</span>
								</label>
								<textarea
									id="mcp-add-args"
									value={argsText}
									onChange={(e) => setArgsText(e.target.value)}
									placeholder={"-y\n@modelcontextprotocol/server-example"}
									disabled={submitting}
									rows={4}
									className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
								/>
							</div>
						</>
					) : (
						<div className="space-y-1.5">
							<label htmlFor="mcp-add-url" className="text-sm font-medium">
								URL
							</label>
							<Input
								id="mcp-add-url"
								value={url}
								onChange={(e) => setUrl(e.target.value)}
								placeholder="https://mcp.example.com/sse"
								disabled={submitting}
							/>
						</div>
					)}

					{/* Env */}
					<div className="space-y-1.5">
						<div className="flex items-center justify-between">
							<label className="text-sm font-medium">Environment variables</label>
							<button
								type="button"
								className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs hover:bg-muted/40 disabled:opacity-50"
								onClick={() => setEnvRows((r) => [...r, { key: "", value: "" }])}
								disabled={submitting}
							>
								<Plus className="size-3" />
								Add
							</button>
						</div>
						{envRows.length === 0 ? (
							<p className="text-xs text-muted-foreground/80">
								None — add one if the server needs an API key or path.
							</p>
						) : (
							<div className="space-y-1.5">
								{envRows.map((row, idx) => (
									<div key={`env-${idx}`} className="flex items-center gap-2">
										<Input
											value={row.key}
											onChange={(e) =>
												setEnvRows((prev) => {
													const next = [...prev];
													next[idx] = { ...next[idx], key: e.target.value };
													return next;
												})
											}
											placeholder="KEY"
											disabled={submitting}
											className="h-8 flex-1 font-mono text-xs"
										/>
										<Input
											value={row.value}
											onChange={(e) =>
												setEnvRows((prev) => {
													const next = [...prev];
													next[idx] = { ...next[idx], value: e.target.value };
													return next;
												})
											}
											placeholder="value"
											disabled={submitting}
											className="h-8 flex-[2] font-mono text-xs"
										/>
										<button
											type="button"
											className="inline-flex size-8 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
											onClick={() =>
												setEnvRows((prev) => prev.filter((_, i) => i !== idx))
											}
											disabled={submitting}
											aria-label={`Remove env row ${idx + 1}`}
										>
											<X className="size-3" />
										</button>
									</div>
								))}
							</div>
						)}
					</div>

					{/* Enabled */}
					<label className="flex cursor-pointer items-center gap-2 text-sm">
						<input
							type="checkbox"
							className="size-4 accent-foreground"
							checked={enabled}
							onChange={(e) => setEnabled(e.target.checked)}
							disabled={submitting}
						/>
						<span>Enabled on next boot</span>
					</label>

					{formError ? (
						<p
							role="alert"
							className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
						>
							{formError}
						</p>
					) : null}
				</div>
				)}

				<DialogFooter>
					<DialogClose asChild>
						<Button type="button" variant="outline" disabled={submitting}>
							Cancel
						</Button>
					</DialogClose>
					{mode === "form" ? (
						<Button type="button" onClick={submit} disabled={submitting}>
							{submitting ? "Adding…" : "Add server"}
						</Button>
					) : null}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
