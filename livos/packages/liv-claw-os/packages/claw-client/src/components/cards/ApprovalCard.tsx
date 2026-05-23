/**
 * Phase 203-10 — ApprovalCard (rebuilt for claw-client).
 *
 * Renders one pending destructive-tool approval as a card with Approve /
 * Reject buttons. Replaces the assistant-ui ApprovalCard deleted in
 * Plan 203-09.
 *
 * Data source — `useApprovals()` (lib/approvals.ts) subscribes to
 * livinityd's /openclawos/approvals/stream SSE endpoint. Clicking a button
 * POSTs to /openclawos/approvals/respond which calls
 * ApprovalManager.resolve(toolCallId, approved), unblocking the openclaw
 * `before_tool_call` hook on the gateway side (INV-203-04).
 *
 * Visual shape — minimal: tool name + a collapsed JSON args preview +
 * two buttons. Intentionally avoids dependence on the claw-client's
 * shadcn-style chrome so it can render in any layout (inbox, toast,
 * floating banner). The container component is responsible for placement.
 */

"use client";

import {AlertTriangle, Check, X} from "lucide-react";
import {useState} from "react";

import {
  useApprovals,
  type ApprovalDecision,
  type PendingApprovalSummary,
} from "@/lib/approvals";

interface ApprovalCardProps {
  entry: PendingApprovalSummary;
  onRespond: (
    toolCallId: string,
    decision: ApprovalDecision,
  ) => Promise<void>;
}

function ApprovalCard({entry, onRespond}: ApprovalCardProps) {
  const [submitting, setSubmitting] = useState<ApprovalDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = async (decision: ApprovalDecision): Promise<void> => {
    setSubmitting(decision);
    setError(null);
    try {
      await onRespond(entry.toolCallId, decision);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(null);
    }
  };

  const argsPreview =
    entry.args === undefined
      ? null
      : JSON.stringify(entry.args, null, 2).slice(0, 400);

  return (
    <div className="rounded-lg border border-border-alert bg-alert-background p-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle size={16} className="text-text-alert-primary" />
        <span className="font-semibold text-text-alert-primary">
          Approval required: {entry.toolName}
        </span>
      </div>
      {entry.agentId ? (
        <div className="mb-1 text-xs text-text-secondary">
          Agent: <code>{entry.agentId}</code>
        </div>
      ) : null}
      {argsPreview ? (
        <pre className="mb-2 max-h-40 overflow-auto rounded bg-background p-2 text-xs">
          {argsPreview}
        </pre>
      ) : null}
      {error ? (
        <div className="mb-2 text-xs text-text-danger-primary">{error}</div>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handle("approved")}
          disabled={submitting !== null}
          className="inline-flex items-center gap-1 rounded-md bg-fg px-3 py-1.5 text-xs font-medium text-bg disabled:opacity-50"
        >
          <Check size={14} />
          {submitting === "approved" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => void handle("rejected")}
          disabled={submitting !== null}
          className="inline-flex items-center gap-1 rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-fg disabled:opacity-50"
        >
          <X size={14} />
          {submitting === "rejected" ? "Rejecting…" : "Reject"}
        </button>
      </div>
    </div>
  );
}

/**
 * Container component — subscribes to the SSE stream and renders one
 * ApprovalCard per pending entry. Returns null when no approvals are
 * pending (so the parent layout collapses cleanly).
 *
 * Place this anywhere in the claw-client app shell where pending
 * approvals should surface — e.g. inside ThreadArea above the composer,
 * or as a floating banner at the bottom of MainContent.
 */
export function ApprovalCardStack() {
  const {pending, loading, error, respond} = useApprovals();

  if (loading) return null;
  if (error && pending.length === 0) {
    return (
      <div className="text-xs text-text-secondary opacity-60">
        approvals: {error}
      </div>
    );
  }
  if (pending.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {pending.map((entry) => (
        <ApprovalCard key={entry.toolCallId} entry={entry} onRespond={respond} />
      ))}
    </div>
  );
}

export default ApprovalCardStack;
