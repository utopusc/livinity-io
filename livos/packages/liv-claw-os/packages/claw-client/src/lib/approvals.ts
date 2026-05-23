/**
 * Phase 203-10 — Approvals SSE client + responder.
 *
 * Subscribes to livinityd's /openclawos/approvals/stream SSE endpoint and
 * exposes a React hook that returns the live list of pending approvals plus
 * an `respond` function that POSTs to /openclawos/approvals/respond.
 *
 * Auth — same-origin (the claw-client iframe is mounted at
 * /liv-ai-app/openclawos on the parent host), so the LIVINITY_SESSION cookie
 * auto-flows on both the EventSource connect and the fetch POST. No token
 * plumbing inside the iframe.
 *
 * The endpoints are hosted on livinityd at the PARENT origin (port 8080 via
 * Caddy reverse_proxy), NOT inside the openclaw gateway. That's intentional:
 * the ApprovalManager lives in livinityd, and the destructive-tool gate is a
 * livinityd-owned correctness boundary (INV-203-04). We reach the parent via
 * an absolute parent-origin path; same-origin because Caddy routes both
 * /openclawos/* and /liv-ai-app/openclawos/* to the same vhost.
 */

"use client";

import {useCallback, useEffect, useRef, useState} from "react";

export interface PendingApprovalSummary {
  toolCallId: string;
  toolName: string;
  args?: unknown;
  agentId?: string;
  userId?: string;
  runId: string;
  createdAt: number;
}

export type ApprovalDecision = "approved" | "rejected";

/** SSE endpoint relative path. Resolves against `window.location.origin`. */
export const APPROVALS_STREAM_PATH = "/openclawos/approvals/stream";
export const APPROVALS_RESPOND_PATH = "/openclawos/approvals/respond";

interface UseApprovalsResult {
  pending: PendingApprovalSummary[];
  /** True before the first `bootstrap` frame arrives. */
  loading: boolean;
  /** Network / parse error string when the stream disconnects. */
  error: string | null;
  /** Submit approve/reject for a single pending entry. */
  respond: (toolCallId: string, decision: ApprovalDecision) => Promise<void>;
}

/**
 * React hook — subscribes to the SSE stream once per component mount and
 * keeps `pending` in sync with livinityd's ApprovalManager. Components can
 * also call `respond(...)` to resolve a pending entry; the corresponding
 * 'resolved' event will arrive over SSE and remove the row.
 */
export function useApprovals(): UseApprovalsResult {
  const [pending, setPending] = useState<PendingApprovalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(APPROVALS_STREAM_PATH, window.location.origin).toString();
    const es = new EventSource(url, {withCredentials: true});
    sourceRef.current = es;

    es.addEventListener("bootstrap", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as {
          pending?: PendingApprovalSummary[];
        };
        setPending(data.pending ?? []);
        setLoading(false);
      } catch (parseErr) {
        setError(`bootstrap parse error: ${String(parseErr)}`);
      }
    });

    es.addEventListener("pending", (ev) => {
      try {
        const entry = JSON.parse((ev as MessageEvent).data) as PendingApprovalSummary;
        setPending((curr) => {
          // Idempotent — dedupe on toolCallId
          if (curr.some((p) => p.toolCallId === entry.toolCallId)) return curr;
          return [...curr, entry];
        });
      } catch (parseErr) {
        setError(`pending parse error: ${String(parseErr)}`);
      }
    });

    es.addEventListener("resolved", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as {toolCallId: string};
        setPending((curr) => curr.filter((p) => p.toolCallId !== data.toolCallId));
      } catch (parseErr) {
        setError(`resolved parse error: ${String(parseErr)}`);
      }
    });

    es.onerror = () => {
      setError("approvals stream disconnected");
      // EventSource auto-reconnects; we just surface the transient flag.
    };

    return () => {
      es.close();
      sourceRef.current = null;
    };
  }, []);

  const respond = useCallback(
    async (toolCallId: string, decision: ApprovalDecision): Promise<void> => {
      const url = new URL(APPROVALS_RESPOND_PATH, window.location.origin).toString();
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({toolCallId, decision}),
      });
      if (!res.ok) {
        throw new Error(`approvals respond failed: ${res.status}`);
      }
      // Optimistically remove the row — the 'resolved' SSE event will also
      // arrive and try to remove it; the filter is idempotent.
      setPending((curr) => curr.filter((p) => p.toolCallId !== toolCallId));
    },
    [],
  );

  return {pending, loading, error, respond};
}
