/**
 * Phase 203-06 Task 2 — Luse tool proxies registered as openclaw gateway tools.
 *
 * Implements D-203-13: the 9 user-facing `luse_*` tools (from the existing
 * Luse MCP server spawned by livinityd's mcp-bridge — Phase 201 fix) are
 * re-exposed as openclaw gateway tools by registering them via
 * `api.registerTool(factory, {name})` in the plugin. Each tool's `execute`
 * forwards to livinityd's `/openclawos/plugin-rpc` route with
 * `{method: 'luse.invoke', args: {toolName, args}}`.
 *
 * Destructive tools (D-203-14 / INV-203-04) wrap their handler with a
 * preceding `approval.request` RPC call. The openclaw `before_tool_call`
 * hook (registered separately in `index.ts`) is the GLOBAL gate; this wrapper
 * is the per-tool-execution gate. We keep both because the plugin-side gate
 * can short-circuit before the network call (faster operator-decision
 * surface for an offline livinityd).
 *
 * Tool catalog (UI-surfaced; matches Phase 202-06 ToolPicker + 200-C names):
 *   - luse_computer_screenshot      (non-destructive)
 *   - luse_computer_click_mouse     (destructive — approval required)
 *   - luse_computer_type_text       (destructive)
 *   - luse_computer_press_keys      (destructive)
 *   - luse_computer_application     (destructive)
 *   - luse_computer_drag_mouse      (destructive)
 *   - luse_computer_paste_text      (destructive)
 *   - luse_list_windows             (non-destructive)
 *   - luse_get_cursor_position      (non-destructive)
 *
 * 9 total (6 destructive + 3 non-destructive). Names match the canonical
 * mcp-bridge `destructiveToolNames` set verbatim so the parity check works.
 */

import { jsonResult } from "openclaw/plugin-sdk/agent-runtime";
import type {
  OpenClawPluginToolContext,
  OpenClawPluginApi,
} from "openclaw/plugin-sdk/core";

import { callPluginRpc } from "./livinityd-rpc.js";

// Phase 202-02 canonical destructive set (mirrors mcp-bridge.ts
// destructiveToolNames). Keep in lockstep with livinityd source.
export const DESTRUCTIVE_LUSE_TOOLS: ReadonlySet<string> = new Set([
  "luse_computer_click_mouse",
  "luse_computer_type_text",
  "luse_computer_press_keys",
  "luse_computer_application",
  "luse_computer_drag_mouse",
  "luse_computer_paste_text",
]);

// Tool descriptor (display + JSON Schema). 9 entries.
interface LuseToolDef {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
}

const LUSE_TOOL_DEFS: ReadonlyArray<LuseToolDef> = [
  {
    name: "luse_computer_screenshot",
    label: "Screenshot Desktop",
    description:
      "Capture the current LivOS desktop as a PNG screenshot. Returns base64 image inline. Use FIRST when the operator asks for a desktop action — see current state before clicking, typing, or launching anything.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "luse_computer_click_mouse",
    label: "Click Mouse",
    description:
      "Move the cursor to (x, y) on the LivOS desktop and click once. Default button is left. DESTRUCTIVE — operator approval required.",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "X coordinate (integer)" },
        y: { type: "number", description: "Y coordinate (integer)" },
        button: {
          type: "string",
          enum: ["left", "middle", "right"],
          description: "Mouse button (defaults to 'left')",
        },
      },
      required: ["x", "y"],
    },
  },
  {
    name: "luse_computer_type_text",
    label: "Type Text",
    description:
      "Type the given text into the focused window via xdotool. DESTRUCTIVE — operator approval required.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to type" },
      },
      required: ["text"],
    },
  },
  {
    name: "luse_computer_press_keys",
    label: "Press Keys",
    description:
      "Send one or more keys to the focused window via xdotool key syntax (e.g. 'ctrl+c', 'Return', 'alt+F4'). DESTRUCTIVE — operator approval required.",
    parameters: {
      type: "object",
      properties: {
        keys: { type: "string", description: "xdotool key syntax string" },
      },
      required: ["keys"],
    },
  },
  {
    name: "luse_computer_application",
    label: "Launch/Focus/Close App",
    description:
      "Launch, focus, or close an application on the LivOS desktop. DESTRUCTIVE — operator approval required.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["launch", "focus", "close"],
        },
        name: { type: "string", description: "Application or window-title substring" },
      },
      required: ["action", "name"],
    },
  },
  {
    name: "luse_computer_drag_mouse",
    label: "Drag Mouse",
    description:
      "Drag the mouse from (fromX, fromY) to (toX, toY) on the LivOS desktop. DESTRUCTIVE — operator approval required.",
    parameters: {
      type: "object",
      properties: {
        fromX: { type: "number" },
        fromY: { type: "number" },
        toX: { type: "number" },
        toY: { type: "number" },
        button: { type: "string", enum: ["left", "middle", "right"] },
      },
      required: ["fromX", "fromY", "toX", "toY"],
    },
  },
  {
    name: "luse_computer_paste_text",
    label: "Paste Text",
    description:
      "Paste text into the focused window via the X11 clipboard + ctrl+v. Use for long or Unicode-heavy strings. DESTRUCTIVE — operator approval required.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string" },
      },
      required: ["text"],
    },
  },
  {
    name: "luse_list_windows",
    label: "List Open Windows",
    description:
      "List all currently open windows on the LivOS desktop. Returns id + title + pid per window.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "luse_get_cursor_position",
    label: "Get Cursor Position",
    description:
      "Read the current X11 cursor coordinates on the LivOS desktop.",
    parameters: { type: "object", properties: {} },
  },
];

/**
 * Number of luse tools we expose. Kept as an exported const so the plugin
 * `index.ts` can log the count without re-importing the full def array.
 */
export const LUSE_TOOL_COUNT = LUSE_TOOL_DEFS.length;

/**
 * Build the openclaw tool factory for a single luse tool name.
 *
 * Returns a closure suitable for `api.registerTool(factory, {name})`.
 */
interface ResolvedRegisterOptions {
  callRpc: CallRpcFn;
}

function buildLuseToolFactory(def: LuseToolDef, opts: ResolvedRegisterOptions) {
  return (ctx: OpenClawPluginToolContext) => ({
    name: def.name,
    label: def.label,
    description: def.description,
    parameters: def.parameters,
    execute: async (callId: string, params: Record<string, unknown>) => {
      const isDestructive = DESTRUCTIVE_LUSE_TOOLS.has(def.name);

      if (isDestructive) {
        // Per-tool approval gate (INV-203-04). The plugin's global
        // before_tool_call hook (registered in index.ts) ALSO sees this
        // tool — that's the redundant safety net; this is the
        // synchronous in-execute gate.
        const approvalRes = await opts.callRpc("approval.request", {
          toolName: def.name,
          args: params,
          agentId: ctx.agentId,
          toolCallId: callId,
        }, { timeoutMs: 5 * 60 * 1000 + 5_000 }); // 5-min + 5s slack
        if (!approvalRes.ok) {
          return jsonResult({
            error: "APPROVAL_RPC_FAILED",
            detail: approvalRes.detail ?? approvalRes.error,
          });
        }
        const decision = (approvalRes.result as { decision?: string })?.decision;
        if (decision !== "approved") {
          return jsonResult({
            rejected: true,
            reason:
              decision === "timeout"
                ? "operator did not respond within the 5-minute approval window"
                : "operator rejected this tool call",
            decision,
          });
        }
      }

      const invokeRes = await opts.callRpc("luse.invoke", {
        toolName: def.name,
        args: params,
      });
      if (!invokeRes.ok) {
        return jsonResult({
          error: invokeRes.error,
          detail: invokeRes.detail,
        });
      }
      return jsonResult(invokeRes.result as Record<string, unknown>);
    },
  });
}

// Non-generic call signature so test mocks can be typed with `RpcResponse<unknown>`
// without TS complaining about the generic <T = unknown> shape variance.
import type { RpcResponse, CallRpcOptions } from "./livinityd-rpc.js";
export type CallRpcFn = (
  method: string,
  args: Record<string, unknown>,
  opts?: CallRpcOptions,
) => Promise<RpcResponse<unknown>>;

export interface RegisterOptions {
  /** Test seam — defaults to `callPluginRpc` from `./livinityd-rpc.ts`. */
  callRpc?: CallRpcFn;
  /** Optional logger hook (defaults to console). */
  logger?: { info?: (msg: string) => void };
}

/**
 * Register all 9 luse_* tools with the openclaw gateway via the plugin api.
 *
 * Returns the list of names registered for callers that want to log them.
 */
export function registerLuseProxyTools(
  api: OpenClawPluginApi,
  options: RegisterOptions = {},
): string[] {
  const callRpc: CallRpcFn = options.callRpc ?? callPluginRpc;
  // Pre-bind callRpc into the factory closure dependency object so each
  // tool's execute() captures the same dependency reference.
  const opts: ResolvedRegisterOptions = { callRpc };

  const registered: string[] = [];
  for (const def of LUSE_TOOL_DEFS) {
    api.registerTool(buildLuseToolFactory(def, opts), { name: def.name });
    registered.push(def.name);
  }
  options.logger?.info?.(
    `[livinityd-tools] registered ${registered.length} luse_* proxy tools`,
  );
  return registered;
}

export { LUSE_TOOL_DEFS };
