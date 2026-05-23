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

import { useState } from "react";
import { Plus, X } from "lucide-react";

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

interface AddMcpServerDialogProps {
	open: boolean;
	onOpenChange: (next: boolean) => void;
	existingNames: string[];
	onAdded: () => Promise<void> | void;
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
			await onAdded();
			handleOpenChange(false);
		} catch (e) {
			setFormError(e instanceof Error ? e.message : "Network error");
			setSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Add MCP server</DialogTitle>
					<DialogDescription>
						Persists to <code className="font-mono">liv:mcp:config</code>.
						Changes take effect after the next service restart.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
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

				<DialogFooter>
					<DialogClose asChild>
						<Button type="button" variant="outline" disabled={submitting}>
							Cancel
						</Button>
					</DialogClose>
					<Button type="button" onClick={submit} disabled={submitting}>
						{submitting ? "Adding…" : "Add server"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
