# v33 — Post-Cutover Cleanup + TBD

> **STUB 2026-05-05** — milestone goal TBD. Created by Phase 90 (v32
> cutover) so scheduled cleanup items have a parking lot. User/orchestrator
> sets the actual milestone goal at v33 kickoff.

---

## Scheduled Cleanup (carried from v32 P90)

### CL-01 — Remove `useAgentSocket` and legacy chat consumers
- **What:** Delete `livos/packages/ui/src/hooks/use-agent-socket.ts` and the
  five remaining call sites:
    - `routes/ai-chat/index.tsx` (legacy chat — kept on disk through P90 for
      emergency rollback)
    - `routes/ai-chat/agent-status-overlay.tsx`
    - `routes/ai-chat/agents-panel.tsx`
    - `routes/ai-chat/chat-messages.tsx`
    - `routes/ai-chat/components/liv-agent-status.tsx`
- **Why now:** Only the legacy chat consumed the WebSocket hook. v32 chat
  shipped at v32 P88 with `useLivAgentStream` (SSE). Legacy chat retired at
  v32 P90 (window content imports `routes/ai-chat/v32` directly). Post-
  cutover, the hook has zero functional callers — only dead-code references
  remain in the unmounted legacy module. Safe to delete.
- **Approach:** Delete the hook file + the 5 caller files in one sweep,
  then `pnpm --filter ui build` to confirm zero new errors.

### CL-02 — Delete the entire `routes/ai-chat/` legacy tree
- **What:** Everything in `routes/ai-chat/` EXCEPT `routes/ai-chat/v32/` —
  the legacy chat directory tree (chat-input, chat-messages, liv-composer,
  liv-tool-panel, mcp-panel descendants, etc.). After the v32 cutover, only
  the v32 subdirectory is reachable.
- **Why now:** Same reason as CL-01 — post-cutover dead code. P90 chose to
  keep the file for emergency rollback (D-90-04); v33 retires it once the
  rollback window passes.
- **Approach:** `rm -rf` the legacy files, move `routes/ai-chat/v32/*` up to
  `routes/ai-chat/` (or rewire the window content lazy-import to the new
  flat path). Update `app-contents/ai-chat-content.tsx` accordingly.

### CL-03 — Polish dock icons for Agents + Marketplace
- **What:** Ship dedicated SVG assets for `LIVINITY_agents` and
  `LIVINITY_marketplace` dock entries (P90 used placeholder
  `dock-server.svg` and `dock-app-store.png`).
- **Why now:** UX polish — ship-then-iterate path was right for cutover, but
  the placeholders are visually duplicative.

### CL-04 — Delete `routes/agent-marketplace/` after rollback window
- **What:** Delete the entire `routes/agent-marketplace/` directory — P90
  reduced its `index.tsx` to a tiny client-side `useNavigate('/marketplace')`
  redirector but kept the route entry for emergency rollback. Once the
  rollback window passes, drop the route + directory entirely.
- **Why now:** Server emits HTTP 301 in livinityd `server/index.ts`; client
  fallback covered the SPA push-state path; once nothing depends on the URL
  any more (audit referrer logs), delete.

---

## Milestone goal

TBD — orchestrator sets at v33 kickoff.
