/**
 * Phase 202-07 — McpTab.
 *
 * Two-section MCP panel rendered under `/settings → MCP`:
 *
 *   1. **Built-in tools (N)** — read-only catalog from the
 *      `mastra.agent.listBuiltInTools` tRPC query. Mirrors the Phase 201-05
 *      panel surface (the original 1316-line `livinity-mcp-panel.tsx`) but
 *      built fresh — INV-202-10 keeps the Phase 201 generative UI renderers
 *      FROZEN, so we do NOT re-import legacy code.
 *
 *   2. **External MCP servers** — CRUD over the Redis hash `liv:mcp:config`
 *      (D-202-12). The `luse` row is rendered with a System badge and no
 *      Delete button (defense-in-depth — server also refuses with
 *      SYSTEM_MCP). Other rows expose Edit + Delete + an Enabled toggle.
 *
 * Between the two sections sits a yellow restart-required banner — adds /
 * deletes / toggles only persist to Redis; the running McpBridge keeps the
 * MCPClient connections it spawned at boot (INV-202-08), so a `systemctl
 * restart livos` is required before changes take effect.
 *
 * INV-202-05 — every visible string is English.
 */

"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, ShieldAlert, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMcpServers, type McpServerConfig } from "@/src/lib/settings/use-mcp-servers";
import { AddMcpServerDialog } from "@/components/settings/AddMcpServerDialog";

export function McpTab() {
	const { servers, builtInTools, isLoading, error, refetch } = useMcpServers();
	const [addOpen, setAddOpen] = useState<boolean>(false);
	const [actingOn, setActingOn] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	// Phase 219 T1 — surface non-blocking mutation warnings (e.g. openclaw
	// mirror failure) inline so the operator knows a partial-success landed.
	const [actionWarnings, setActionWarnings] = useState<string[]>([]);

	const toggleServer = useCallback(
		async (name: string, enabled: boolean) => {
			setActingOn(name);
			setActionError(null);
			try {
				const res = await fetch("/trpc/mcp.config.toggle?batch=1", {
					method: "POST",
					credentials: "include",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ "0": { json: { name, enabled } } }),
				});
				if (!res.ok) {
					setActionError(`Toggle failed (HTTP ${res.status})`);
					return;
				}
				const data = await res.json();
				const err = data?.[0]?.error?.json?.message ?? data?.[0]?.error?.message;
				if (err) {
					setActionError(err);
					return;
				}
				await refetch();
			} catch (e) {
				setActionError(e instanceof Error ? e.message : "Network error");
			} finally {
				setActingOn(null);
			}
		},
		[refetch],
	);

	const deleteServer = useCallback(
		async (name: string) => {
			const confirmed = window.confirm(
				`Delete MCP server '${name}'? It will stop connecting after the next service restart.`,
			);
			if (!confirmed) return;
			setActingOn(name);
			setActionError(null);
			try {
				const res = await fetch("/trpc/mcp.config.delete?batch=1", {
					method: "POST",
					credentials: "include",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ "0": { json: { name } } }),
				});
				if (!res.ok) {
					setActionError(`Delete failed (HTTP ${res.status})`);
					return;
				}
				const data = await res.json();
				const err = data?.[0]?.error?.json?.message ?? data?.[0]?.error?.message;
				if (err) {
					setActionError(err);
					return;
				}
				await refetch();
			} catch (e) {
				setActionError(e instanceof Error ? e.message : "Network error");
			} finally {
				setActingOn(null);
			}
		},
		[refetch],
	);

	return (
		<div className="space-y-8">
			{/* ── Built-in tools ──────────────────────────────────────────── */}
			<section className="space-y-3">
				<div>
					<h2 className="text-base font-medium">
						Built-in tools ({builtInTools.length})
					</h2>
					<p className="text-xs text-muted-foreground/80">
						Always available to every agent. Destructive tools route through the
						approval gate before firing.
					</p>
				</div>
				{isLoading ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : builtInTools.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No built-in tools registered.
					</p>
				) : (
					<ul className="divide-y divide-border/60 rounded-md border border-border/60">
						{builtInTools.map((t) => (
							<li
								key={t.id}
								className="flex items-start gap-3 px-3 py-2 text-sm"
							>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className="font-medium">{t.name}</span>
										<span className="font-mono text-xs text-muted-foreground">
											{t.id}
										</span>
										{t.destructive ? (
											<span
												className="inline-flex items-center gap-1 rounded-sm bg-destructive/10 px-1 py-0.5 text-[10px] font-medium text-destructive"
												title="Destructive — routes through the approval gate."
											>
												<ShieldAlert className="size-2.5" />
												approval
											</span>
										) : (
											<span className="rounded-sm bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
												auto
											</span>
										)}
									</div>
									<p className="mt-0.5 text-xs text-muted-foreground">
										{t.description}
									</p>
								</div>
							</li>
						))}
					</ul>
				)}
			</section>

			{/* ── Restart-required banner ─────────────────────────────────── */}
			<div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
				<AlertTriangle className="mt-0.5 size-4 shrink-0" />
				<p>
					Changes to external MCP servers take effect after the next service
					restart. The running MCP bridge keeps the connections it spawned at
					boot.
				</p>
			</div>

			{/* ── External MCP servers ────────────────────────────────────── */}
			<section className="space-y-3">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h2 className="text-base font-medium">
							External MCP servers ({servers.length})
						</h2>
						<p className="text-xs text-muted-foreground/80">
							Add stdio or HTTP MCP servers. Their tools become available to
							every agent at next boot.
						</p>
					</div>
					<Button
						type="button"
						variant="default"
						size="sm"
						onClick={() => setAddOpen(true)}
					>
						+ Add MCP Server
					</Button>
				</div>

				{error ? (
					<p
						role="alert"
						className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
					>
						{error}
					</p>
				) : null}
				{actionError ? (
					<p
						role="alert"
						className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
					>
						{actionError}
					</p>
				) : null}
				{actionWarnings.length > 0 ? (
					<div
						role="status"
						className="space-y-1 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
					>
						{actionWarnings.map((w, i) => (
							<p key={i}>{w}</p>
						))}
						<button
							type="button"
							className="text-[10px] underline hover:no-underline"
							onClick={() => setActionWarnings([])}
						>
							Dismiss
						</button>
					</div>
				) : null}

				{isLoading ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : servers.length === 0 ? (
					<p className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
						No external MCP servers configured.
					</p>
				) : (
					<ul className="divide-y divide-border/60 rounded-md border border-border/60">
						{servers.map((s) => (
							<McpServerRow
								key={s.name}
								server={s}
								busy={actingOn === s.name}
								onToggle={(enabled) => toggleServer(s.name, enabled)}
								onDelete={() => deleteServer(s.name)}
							/>
						))}
					</ul>
				)}
			</section>

			<AddMcpServerDialog
				open={addOpen}
				onOpenChange={setAddOpen}
				existingNames={servers.map((s) => s.name)}
				onAdded={async (warnings) => {
					await refetch();
					if (warnings && warnings.length > 0) {
						setActionWarnings(warnings);
					}
				}}
			/>
		</div>
	);
}

interface McpServerRowProps {
	server: McpServerConfig;
	busy: boolean;
	onToggle: (enabled: boolean) => void;
	onDelete: () => void;
}

function McpServerRow({ server, busy, onToggle, onDelete }: McpServerRowProps) {
	const targetLabel =
		server.transport === "stdio"
			? `${server.command ?? "?"}${server.args?.length ? " " + server.args.join(" ") : ""}`
			: server.url ?? "?";

	return (
		<li className="flex items-start gap-3 px-3 py-3 text-sm">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="font-medium">{server.name}</span>
					<span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
						{server.transport}
					</span>
					{server.system ? (
						<span className="rounded-sm bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
							system
						</span>
					) : null}
					<span
						className={
							server.enabled
								? "rounded-sm bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
								: "rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
						}
					>
						{server.enabled ? "enabled" : "disabled"}
					</span>
				</div>
				<p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
					{targetLabel}
				</p>
			</div>

			<div className="flex shrink-0 items-center gap-2">
				<label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
					<input
						type="checkbox"
						className="size-3.5 accent-foreground"
						checked={server.enabled}
						disabled={busy}
						onChange={(e) => onToggle(e.target.checked)}
					/>
					<span>Enabled</span>
				</label>
				{server.system ? null : (
					<button
						type="button"
						className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
						onClick={onDelete}
						disabled={busy}
						aria-label={`Delete ${server.name}`}
					>
						<Trash2 className="size-3" />
						Delete
					</button>
				)}
			</div>
		</li>
	);
}
