/**
 * Phase 202-04 — `useAgentStatusSSE` hook.
 *
 * Wraps a single long-lived `new EventSource('/agents/status/stream', {
 * withCredentials: true })` connection. Merges incoming `AgentStatusEvent`
 * payloads into a keyed `Record<agentId, AgentStatus>` map that the
 * AgentCard component reads to render the live status badge.
 *
 * D-202-08 — SSE transport. Frontend uses native EventSource (NOT WebSocket).
 *
 * Reconnect strategy: EventSource auto-reconnects natively on transient
 * network failures. We also wire an explicit `error` listener that resets
 * the EventSource on terminal errors (CLOSED readyState) after a short
 * back-off so manual DevTools "close" of the stream recovers automatically.
 */

"use client";

import { useEffect, useRef, useState } from "react";

import type { AgentStatus, AgentStatusEvent } from "./types";

const SSE_URL = "/agents/status/stream";
const RECONNECT_DELAY_MS = 2_000;

export interface UseAgentStatusSseResult {
	statusByAgentId: Record<string, AgentStatus>;
	lastEventAt: string | null;
}

export function useAgentStatusSSE(): UseAgentStatusSseResult {
	const [statusByAgentId, setStatusByAgentId] = useState<
		Record<string, AgentStatus>
	>({});
	const [lastEventAt, setLastEventAt] = useState<string | null>(null);
	const esRef = useRef<EventSource | null>(null);
	const reconnectTimerRef = useRef<number | null>(null);
	const mountedRef = useRef<boolean>(true);

	useEffect(() => {
		mountedRef.current = true;

		const openConnection = (): void => {
			if (!mountedRef.current) return;
			// Close any prior connection before opening a new one (defensive
			// against a stale reconnect timer firing after unmount).
			if (esRef.current) {
				try {
					esRef.current.close();
				} catch {
					// best-effort
				}
				esRef.current = null;
			}

			let es: EventSource;
			try {
				es = new EventSource(SSE_URL, { withCredentials: true });
			} catch {
				// EventSource constructor throwing means the browser blocked
				// the connection (e.g. mixed-content). Bail; the dashboard
				// still renders agents without live status.
				return;
			}
			esRef.current = es;

			// `event: status\ndata: <json>` payloads. Parsed + merged into
			// statusByAgentId so each card reads a stable per-agent object.
			es.addEventListener("status", (raw: MessageEvent) => {
				if (!mountedRef.current) return;
				try {
					const payload = JSON.parse(raw.data) as AgentStatusEvent;
					if (!payload?.agentId || !payload?.state) return;
					setStatusByAgentId((prev) => ({
						...prev,
						[payload.agentId]: {
							state: payload.state,
							threadId: payload.threadId,
							lastRunAt: payload.lastRunAt ?? prev[payload.agentId]?.lastRunAt,
							nextScheduledAt:
								payload.nextScheduledAt ?? prev[payload.agentId]?.nextScheduledAt,
							error: payload.error,
						},
					}));
					setLastEventAt(payload.at ?? new Date().toISOString());
				} catch {
					// Malformed payload — ignore; the next event will refresh
					// the state.
				}
			});

			// `event: hello` opens the connection with a server-side
			// timestamp so the UI can show a "live" indicator even before
			// the first status flip.
			es.addEventListener("hello", (raw: MessageEvent) => {
				if (!mountedRef.current) return;
				try {
					const payload = JSON.parse(raw.data) as { at?: string };
					setLastEventAt(payload?.at ?? new Date().toISOString());
				} catch {
					setLastEventAt(new Date().toISOString());
				}
			});

			// Terminal error → schedule a reconnect. EventSource will also
			// auto-reconnect on transient errors, but a CLOSED readyState
			// after the server hangs up needs an explicit recycle.
			es.addEventListener("error", () => {
				if (!mountedRef.current) return;
				if (es.readyState === EventSource.CLOSED) {
					if (reconnectTimerRef.current !== null) {
						window.clearTimeout(reconnectTimerRef.current);
					}
					reconnectTimerRef.current = window.setTimeout(() => {
						reconnectTimerRef.current = null;
						openConnection();
					}, RECONNECT_DELAY_MS);
				}
			});
		};

		openConnection();

		return () => {
			mountedRef.current = false;
			if (reconnectTimerRef.current !== null) {
				window.clearTimeout(reconnectTimerRef.current);
				reconnectTimerRef.current = null;
			}
			if (esRef.current) {
				try {
					esRef.current.close();
				} catch {
					// best-effort
				}
				esRef.current = null;
			}
		};
	}, []);

	return { statusByAgentId, lastEventAt };
}
