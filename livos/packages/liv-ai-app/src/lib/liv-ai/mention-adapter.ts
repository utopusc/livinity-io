/**
 * Phase 200-03 — `@` mention adapter for the Liv AI composer.
 *
 * Wraps `unstable_useMentionAdapter` from `@assistant-ui/react` with the
 * D-200-08 locked static catalog of 7 tool entries (3 built-ins + 4 Luse
 * computer-use tools). Returned shape is the spreadable `{ adapter,
 * directive }` bundle the canonical `<ComposerTriggerPopover char="@" />`
 * primitive (ported in Plan 200-02) expects:
 *
 *   const mention = useLivAiMentionAdapter()
 *   <ComposerTriggerPopover char="@" {...mention} />
 *
 * STATIC CATALOG RATIONALE (RESEARCH §B2.1 Option A + Pitfall 9):
 * Live MCP-bridge discovery (`includeModelContextTools: true`) would
 * require migrating Phase 198's `makeAssistantToolUI` registrations to
 * the canonical `useAssistantTool` form so the assistant-ui runtime
 * actually exposes the tool catalog. That migration is OUT OF SCOPE
 * for Phase 200 (deferred to Phase 201+ per CONTEXT § A). Instead we
 * ship a static list of the 7 user-facing tools — `includeModelContextTools:
 * false` makes the picker authoritative and sidesteps the discovery gap.
 *
 * Adapter is consumed by Plan 200-05 (LivAiComposer rebuild).
 *
 * Phase 201-04 — Ported 1:1 from livos/packages/ui/src/features/liv-ai/
 *   mention-adapter.ts. No path remap required (only @assistant-ui/react).
 */

import {
  unstable_useMentionAdapter,
  type Unstable_Mention,
} from "@assistant-ui/react";

/**
 * Shape of one entry in the static mention catalog. Matches
 * `Unstable_Mention` from `@assistant-ui/core` exactly (id/type/label/
 * description) — re-exported here as a Liv-AI-specific alias for
 * readability at the call site.
 */
export interface LivAiMentionToolItem {
  readonly id: string;
  readonly type: "tool";
  readonly label: string;
  readonly description: string;
}

/**
 * D-200-08 locked catalog of 7 tool entries.
 *
 * ORDER MATTERS — this is the order the picker popover displays.
 */
export const LIV_AI_MENTION_TOOLS: readonly LivAiMentionToolItem[] = [
  { id: "weather", type: "tool", label: "weather", description: "Check weather" },
  { id: "luse_list_windows", type: "tool", label: "List windows", description: "List open windows" },
  { id: "get_current_time", type: "tool", label: "Current time", description: "Get current time" },
  { id: "luse_computer_screenshot", type: "tool", label: "Take screenshot", description: "Capture screen" },
  { id: "luse_computer_click_mouse", type: "tool", label: "Click mouse", description: "Click at coordinates" },
  { id: "luse_computer_type_text", type: "tool", label: "Type text", description: "Type via keyboard" },
  { id: "luse_computer_application", type: "tool", label: "Launch app", description: "Open application" },
] as const;

/**
 * React hook returning the `{ adapter, directive }` spread bundle for
 * the `@` mention picker. Bound to the D-200-08 static catalog;
 * `includeModelContextTools: false` keeps the catalog authoritative
 * (no runtime tool discovery — deferred to Phase 201+).
 */
export function useLivAiMentionAdapter() {
  return unstable_useMentionAdapter({
    items: LIV_AI_MENTION_TOOLS as readonly Unstable_Mention[],
    includeModelContextTools: false,
  });
}
