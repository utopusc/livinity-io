/**
 * Phase 202-05 — RunNowButton.
 *
 * Single Button that triggers `agents.runOnce` for a given agentId. On
 * success the response carries `{threadId}` and we navigate the operator to
 * the Liv AI chat root with the new thread param so assistant-ui mounts the
 * live stream.
 *
 * D-202-16 — Any admin can Run now. Enforced server-side by the
 * `adminProcedure` gate on the route; this client surface is unconditional.
 *
 * The button is unmounted from the system-agent detail page only if the
 * agent is disabled (`agent.enabled === false`) — by-product of the
 * `enabled` flag flowing through. System agents can still Run now.
 */

"use client";

import { useCallback, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

interface RunNowButtonProps {
	agentId: string;
	disabled?: boolean;
}

type RunState =
	| { kind: "idle" }
	| { kind: "running" }
	| { kind: "error"; message: string };

export function RunNowButton({ agentId, disabled }: RunNowButtonProps) {
	const router = useRouter();
	const [state, setState] = useState<RunState>({ kind: "idle" });

	const onClick = useCallback(async () => {
		if (state.kind === "running") return;
		setState({ kind: "running" });
		try {
			const res = await fetch("/trpc/agents.runOnce?batch=1", {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					"0": { json: { id: agentId } },
				}),
			});
			if (!res.ok) {
				let msg = `HTTP ${res.status}`;
				try {
					const errData = await res.json();
					const errMsg =
						errData?.[0]?.error?.json?.message ??
						errData?.[0]?.error?.message;
					if (typeof errMsg === "string") {
						if (errMsg === "AGENT_SCHEDULER_UNAVAILABLE") {
							msg = "Scheduler is not available. Try again after restart.";
						} else if (errMsg === "AGENT_NOT_FOUND") {
							msg = "Agent no longer exists.";
						} else {
							msg = errMsg;
						}
					}
				} catch {
					// fall through with generic HTTP msg
				}
				setState({ kind: "error", message: msg });
				return;
			}
			const data = await res.json();
			const v10 = data?.[0]?.result?.data;
			const v11 = data?.[0]?.result?.data?.json;
			const payload = (v11 ?? v10) as { threadId?: string } | undefined;
			const threadId = payload?.threadId;
			if (!threadId) {
				setState({ kind: "error", message: "No threadId returned." });
				return;
			}
			// Navigate to the chat root with the threadId param. The Liv AI
			// assistant runtime picks this up and mounts the live stream.
			router.push(`/?threadId=${encodeURIComponent(threadId)}`);
		} catch (err) {
			setState({
				kind: "error",
				message: err instanceof Error ? err.message : "Network error",
			});
		}
	}, [agentId, router, state.kind]);

	const isRunning = state.kind === "running";

	return (
		<div className="flex flex-col items-end gap-1">
			<Button
				type="button"
				onClick={onClick}
				disabled={isRunning || disabled}
				title={disabled ? "Agent is disabled" : "Trigger a manual run"}
			>
				{isRunning ? (
					<>
						<Loader2 className="size-4 animate-spin" />
						Starting…
					</>
				) : (
					<>
						<Play className="size-4" />
						Run now
					</>
				)}
			</Button>
			{state.kind === "error" ? (
				<span
					className="text-xs text-destructive"
					role="alert"
				>
					{state.message}
				</span>
			) : null}
		</div>
	);
}
