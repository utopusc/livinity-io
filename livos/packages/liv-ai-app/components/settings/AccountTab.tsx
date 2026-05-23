/**
 * Phase 202-07 — AccountTab.
 *
 * Minimal v202 placeholder. Today the only admin is the bootstrap admin
 * created at first boot (Phase 134). Full account management — invites,
 * role changes, password rotation, MFA per-account — is deferred to Phase
 * 220+ per the v202 OUT-OF-SCOPE notes in 202-CONTEXT.md.
 *
 * This tab renders read-only identity info hydrated from `user.isLoggedIn`
 * (returns `{username, role, ...}` for the active JWT session). The Sign
 * out button POSTs `user.logout` and reloads the page.
 *
 * INV-202-05 — English copy only.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

interface AccountInfo {
	username?: string;
	role?: string;
	loggedIn?: boolean;
}

const IS_LOGGED_IN_QS =
	"batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%7D%7D%7D";

async function fetchAccount(): Promise<AccountInfo | null> {
	try {
		const res = await fetch(`/trpc/user.isLoggedIn?${IS_LOGGED_IN_QS}`, {
			credentials: "include",
		});
		if (!res.ok) return null;
		const data = await res.json();
		const direct = data?.[0]?.result?.data;
		if (direct && typeof direct === "object") {
			return direct as AccountInfo;
		}
		const wrapped = data?.[0]?.result?.data?.json;
		if (wrapped && typeof wrapped === "object") {
			return wrapped as AccountInfo;
		}
		return null;
	} catch {
		return null;
	}
}

export function AccountTab() {
	const [info, setInfo] = useState<AccountInfo | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [signOutBusy, setSignOutBusy] = useState<boolean>(false);
	const mountedRef = useRef<boolean>(true);

	useEffect(() => {
		mountedRef.current = true;
		void (async () => {
			const next = await fetchAccount();
			if (!mountedRef.current) return;
			setInfo(next);
			setIsLoading(false);
		})();
		return () => {
			mountedRef.current = false;
		};
	}, []);

	const signOut = useCallback(async () => {
		setSignOutBusy(true);
		try {
			await fetch("/trpc/user.logout?batch=1", {
				method: "POST",
				credentials: "include",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ "0": { json: null } }),
			});
		} finally {
			// Reload to the legacy login flow regardless of error — the cookie
			// may already be cleared.
			window.location.reload();
		}
	}, []);

	return (
		<div className="space-y-6">
			<section className="space-y-3">
				<div>
					<h2 className="text-base font-medium">Signed in as</h2>
					<p className="text-xs text-muted-foreground/80">
						Full account management (invites, password rotation, MFA) lands in
						a later milestone.
					</p>
				</div>

				<div className="rounded-md border border-border/60">
					<dl className="divide-y divide-border/60 text-sm">
						<div className="grid grid-cols-[8rem_1fr] items-center gap-3 px-3 py-2">
							<dt className="text-xs uppercase tracking-wide text-muted-foreground">
								Username
							</dt>
							<dd className="font-mono">
								{isLoading ? "…" : info?.username ?? "—"}
							</dd>
						</div>
						<div className="grid grid-cols-[8rem_1fr] items-center gap-3 px-3 py-2">
							<dt className="text-xs uppercase tracking-wide text-muted-foreground">
								Role
							</dt>
							<dd>
								{isLoading ? "…" : info?.role ?? "admin"}
							</dd>
						</div>
						<div className="grid grid-cols-[8rem_1fr] items-center gap-3 px-3 py-2">
							<dt className="text-xs uppercase tracking-wide text-muted-foreground">
								Session
							</dt>
							<dd className="text-muted-foreground">
								{isLoading
									? "…"
									: info?.loggedIn === false
										? "Not signed in"
										: "Active (cookie + JWT)"}
							</dd>
						</div>
					</dl>
				</div>
			</section>

			<section className="space-y-2">
				<h3 className="text-sm font-medium">Sign out</h3>
				<p className="text-xs text-muted-foreground/80">
					Clears the JWT cookie. You will be sent back to the login screen.
				</p>
				<Button
					type="button"
					variant="outline"
					onClick={signOut}
					disabled={signOutBusy}
				>
					{signOutBusy ? "Signing out…" : "Sign out"}
				</Button>
			</section>
		</div>
	);
}
