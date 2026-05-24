/**
 * Phase 204-02 — ProvidersTab.
 *
 * Renders under `/settings → Providers`. Three regions:
 *
 *   1. Configured providers (N) — list of redacted ProviderRow items with a
 *      Delete button per row. Empty state: "No provider keys configured."
 *
 *   2. Add a provider — dropdown (only providers NOT already configured) +
 *      type=password input + Save button + a "Stored in plaintext on this
 *      server" notice (D-204-02 transparency).
 *
 *   3. Restart-status banner — surfaces after Save / Delete. States:
 *        - idle             (hidden)
 *        - restarting       ("Saved. Restarting Liv AI gateway…" + 30s health poll)
 *        - healthy          ("Gateway healthy.") auto-hides after 3s
 *        - restart_required ("Saved to Redis but gateway restart failed; SSH
 *                           to Mini PC and run `sudo systemctl restart
 *                           liv-claw-gateway`.") sticky.
 *        - error            ("Save failed: …") sticky.
 *
 * INV-204-04 — server returns only `preview`; we never receive the raw key.
 * INV-204-02 — every visible string is English.
 */

"use client";

import {useCallback, useEffect, useMemo, useState} from "react";
import {AlertTriangle, CheckCircle2, Loader2, ShieldAlert, Trash2} from "lucide-react";

import {Button} from "@/components/ui/button";
import {
	PROVIDER_LABELS,
	PROVIDER_NAMES,
	pingGatewayHealth,
	useProviders,
	type ProviderName,
	type ProviderRow,
} from "@/src/lib/settings/use-providers";

type BannerState =
	| {kind: "idle"}
	| {kind: "restarting"; remainingSeconds: number}
	| {kind: "healthy"}
	| {kind: "restart_required"; reason?: string; envFilePath?: string}
	| {kind: "error"; message: string};

const HEALTH_POLL_INTERVAL_MS = 1000;
const HEALTH_POLL_DEADLINE_MS = 30_000;
const HEALTHY_AUTO_HIDE_MS = 3_000;

export function ProvidersTab() {
	const {
		providers,
		isLoading,
		error,
		refetch,
		setProvider,
		deleteProvider,
	} = useProviders();

	const [pendingProvider, setPendingProvider] = useState<ProviderName | "">("");
	const [pendingKey, setPendingKey] = useState<string>("");
	const [saving, setSaving] = useState<boolean>(false);
	const [deletingProvider, setDeletingProvider] = useState<ProviderName | null>(null);
	const [banner, setBanner] = useState<BannerState>({kind: "idle"});

	// Providers available in the dropdown = locked enum minus already-configured.
	const availableProviders = useMemo<ProviderName[]>(() => {
		const configured = new Set(providers.map((p) => p.provider));
		return PROVIDER_NAMES.filter((p) => !configured.has(p));
	}, [providers]);

	// Keep the dropdown selection in sync with what's actually available — if the
	// user just saved a provider, drop it from the form so they don't accidentally
	// re-overwrite.
	useEffect(() => {
		if (pendingProvider && !availableProviders.includes(pendingProvider)) {
			setPendingProvider(availableProviders[0] ?? "");
			setPendingKey("");
		}
	}, [availableProviders, pendingProvider]);

	// Default the dropdown to the first available option on first render.
	useEffect(() => {
		if (!pendingProvider && availableProviders.length > 0) {
			setPendingProvider(availableProviders[0]!);
		}
	}, [availableProviders, pendingProvider]);

	const startHealthPoll = useCallback(async () => {
		const deadline = Date.now() + HEALTH_POLL_DEADLINE_MS;
		while (Date.now() < deadline) {
			const remainingMs = Math.max(0, deadline - Date.now());
			setBanner({
				kind: "restarting",
				remainingSeconds: Math.ceil(remainingMs / 1000),
			});
			// eslint-disable-next-line no-await-in-loop
			await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
			// eslint-disable-next-line no-await-in-loop
			const ok = await pingGatewayHealth();
			if (ok) {
				setBanner({kind: "healthy"});
				setTimeout(() => {
					setBanner((b) =>
						b.kind === "healthy" ? {kind: "idle"} : b,
					);
				}, HEALTHY_AUTO_HIDE_MS);
				return;
			}
		}
		// Timed out without 200 — flip to restart_required.
		setBanner({
			kind: "restart_required",
			reason: `Health check timed out after ${HEALTH_POLL_DEADLINE_MS / 1000}s`,
		});
	}, []);

	const handleSave = useCallback(async () => {
		if (!pendingProvider || pendingKey.length < 8) {
			setBanner({
				kind: "error",
				message: "Pick a provider and paste a key (at least 8 characters).",
			});
			return;
		}
		setSaving(true);
		setBanner({kind: "idle"});
		const res = await setProvider(pendingProvider, pendingKey.trim());
		setSaving(false);
		if (!res.ok) {
			setBanner({kind: "error", message: res.error ?? "Save failed"});
			return;
		}
		// Clear the form regardless of restart outcome — the key is in Redis now.
		setPendingKey("");
		if (res.restartRequired) {
			setBanner({
				kind: "restart_required",
				reason: res.restartReason,
				envFilePath: res.envFilePath,
			});
			return;
		}
		// Kick off the 30s health poll.
		void startHealthPoll();
	}, [pendingKey, pendingProvider, setProvider, startHealthPoll]);

	const handleDelete = useCallback(
		async (provider: ProviderName) => {
			const confirmed = window.confirm(
				`Remove the ${PROVIDER_LABELS[provider]} key? The Liv AI gateway will restart.`,
			);
			if (!confirmed) return;
			setDeletingProvider(provider);
			setBanner({kind: "idle"});
			const res = await deleteProvider(provider);
			setDeletingProvider(null);
			if (!res.ok) {
				setBanner({kind: "error", message: res.error ?? "Delete failed"});
				return;
			}
			if (res.restartRequired) {
				setBanner({
					kind: "restart_required",
					reason: res.restartReason,
					envFilePath: res.envFilePath,
				});
				return;
			}
			void startHealthPoll();
		},
		[deleteProvider, startHealthPoll],
	);

	return (
		<div className="space-y-8">
			{/* ── Configured providers ─────────────────────────────────── */}
			<section className="space-y-3">
				<div>
					<h2 className="text-base font-medium">
						Configured providers ({providers.length})
					</h2>
					<p className="text-xs text-muted-foreground/80">
						LLM provider API keys the Liv AI gateway reads at startup. Keys
						never leave this Mini PC; the UI only ever shows a redacted
						preview.
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
				) : providers.length === 0 ? (
					<p className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
						No provider keys configured. Add one below to enable chat.
					</p>
				) : (
					<ul className="divide-y divide-border/60 rounded-md border border-border/60">
						{providers.map((p) => (
							<ProviderRowItem
								key={p.provider}
								row={p}
								busy={deletingProvider === p.provider}
								onDelete={() => handleDelete(p.provider)}
							/>
						))}
					</ul>
				)}
			</section>

			{/* ── Restart banner ──────────────────────────────────────── */}
			<RestartBanner state={banner} onDismiss={() => setBanner({kind: "idle"})} />

			{/* ── Add a provider ──────────────────────────────────────── */}
			<section className="space-y-3">
				<div>
					<h2 className="text-base font-medium">Add a provider</h2>
					<p className="text-xs text-muted-foreground/80">
						Paste a key for any supported provider. Saving writes the key to
						this server and restarts the Liv AI gateway so it picks the value
						up immediately.
					</p>
				</div>

				{availableProviders.length === 0 ? (
					<p className="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-sm text-muted-foreground">
						All supported providers are already configured. Delete one above
						to add a different key.
					</p>
				) : (
					<div className="space-y-3 rounded-md border border-border/60 px-4 py-4">
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr_auto]">
							<label className="space-y-1">
								<span className="text-xs font-medium text-muted-foreground">
									Provider
								</span>
								<select
									className="block w-full rounded-md border border-border/60 bg-background px-2 py-2 text-sm"
									value={pendingProvider}
									onChange={(e) =>
										setPendingProvider(
											e.target.value as ProviderName | "",
										)
									}
								>
									{availableProviders.map((p) => (
										<option key={p} value={p}>
											{PROVIDER_LABELS[p]}
										</option>
									))}
								</select>
							</label>

							<label className="space-y-1">
								<span className="text-xs font-medium text-muted-foreground">
									API key
								</span>
								<input
									type="password"
									className="block w-full rounded-md border border-border/60 bg-background px-2 py-2 font-mono text-sm"
									placeholder="paste your key here"
									autoComplete="off"
									spellCheck={false}
									value={pendingKey}
									onChange={(e) => setPendingKey(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											void handleSave();
										}
									}}
								/>
							</label>

							<div className="flex items-end">
								<Button
									type="button"
									variant="default"
									size="sm"
									disabled={
										saving ||
										!pendingProvider ||
										pendingKey.trim().length < 8
									}
									onClick={() => void handleSave()}
								>
									{saving ? (
										<>
											<Loader2 className="mr-1 size-3 animate-spin" />
											Saving…
										</>
									) : (
										"Save"
									)}
								</Button>
							</div>
						</div>

						<p className="text-[11px] text-muted-foreground/70">
							Stored in plaintext on this server. Same trust model as{" "}
							<code className="rounded bg-muted px-1 py-0.5">
								/opt/livos/.env
							</code>
							. The key is never re-shown after save — only a redacted
							preview.
						</p>
					</div>
				)}
			</section>
		</div>
	);
}

// ── Sub-components ──────────────────────────────────────────────────────

interface ProviderRowItemProps {
	row: ProviderRow;
	busy: boolean;
	onDelete: () => void;
}

function ProviderRowItem({row, busy, onDelete}: ProviderRowItemProps) {
	const label = PROVIDER_LABELS[row.provider];
	const addedAt = formatTimestamp(row.addedAt);
	return (
		<li className="flex items-start gap-3 px-3 py-3 text-sm">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="font-medium">{label}</span>
					<span className="rounded-sm bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
						configured
					</span>
				</div>
				<p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
					{row.preview} <span className="opacity-60">· added {addedAt}</span>
				</p>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<button
					type="button"
					className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
					onClick={onDelete}
					disabled={busy}
					aria-label={`Delete ${label}`}
				>
					{busy ? (
						<Loader2 className="size-3 animate-spin" />
					) : (
						<Trash2 className="size-3" />
					)}
					Delete
				</button>
			</div>
		</li>
	);
}

interface RestartBannerProps {
	state: BannerState;
	onDismiss: () => void;
}

function RestartBanner({state, onDismiss}: RestartBannerProps) {
	if (state.kind === "idle") return null;

	if (state.kind === "restarting") {
		return (
			<div className="flex items-start gap-2 rounded-md border border-blue-500/40 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
				<Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
				<p>
					Saved. Restarting the Liv AI gateway… ({state.remainingSeconds}s
					remaining before manual restart fallback)
				</p>
			</div>
		);
	}

	if (state.kind === "healthy") {
		return (
			<div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
				<CheckCircle2 className="mt-0.5 size-4 shrink-0" />
				<p>Gateway is healthy. Try a chat message in Liv AI.</p>
			</div>
		);
	}

	if (state.kind === "restart_required") {
		const path = state.envFilePath ?? "/etc/default/liv-claw-gateway";
		return (
			<div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
				<ShieldAlert className="mt-0.5 size-4 shrink-0" />
				<div className="space-y-1">
					<p>
						Saved on this server, but the gateway restart failed
						{state.reason ? ` (${state.reason})` : ""}. SSH the Mini PC and
						run:
					</p>
					<pre className="rounded bg-amber-900/10 px-2 py-1 font-mono text-[11px]">
						sudo systemctl restart liv-claw-gateway
					</pre>
					<p className="opacity-80">
						Env file is at <code className="font-mono">{path}</code>.
					</p>
					<button
						type="button"
						onClick={onDismiss}
						className="text-[11px] underline opacity-70 hover:opacity-100"
					>
						Dismiss
					</button>
				</div>
			</div>
		);
	}

	// state.kind === "error"
	return (
		<div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
			<AlertTriangle className="mt-0.5 size-4 shrink-0" />
			<div className="space-y-1">
				<p>{state.message}</p>
				<button
					type="button"
					onClick={onDismiss}
					className="text-[11px] underline opacity-70 hover:opacity-100"
				>
					Dismiss
				</button>
			</div>
		</div>
	);
}

function formatTimestamp(iso: string): string {
	try {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleString();
	} catch {
		return iso;
	}
}
