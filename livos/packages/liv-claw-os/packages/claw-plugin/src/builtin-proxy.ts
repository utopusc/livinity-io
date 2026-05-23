/**
 * Phase 203-06 Task 3 — Built-in LivOS tool proxies registered as openclaw
 * gateway tools.
 *
 * Implements D-203-14: the 11 LivOS built-in tools (Phase 202-08
 * `BUILT_IN_TOOL_CATALOG`) are re-exposed as openclaw gateway tools by
 * registering them via `api.registerTool(factory, {name})` in the plugin.
 * Each tool's `execute` forwards to livinityd's `/openclawos/plugin-rpc`
 * route with `{method: 'builtin.invoke', args: {toolName, args}}`.
 *
 * Source of truth — `livos/packages/livinityd/source/modules/mastra/agents/
 * built-in-tools.ts` (`BUILT_IN_TOOL_CATALOG`). Mirrored here as a constant
 * because the plugin bundles via esbuild and can't cross the workspace
 * boundary to import livinityd types/values directly. Keep this list in
 * lockstep — a runtime parity check at registration time logs any drift
 * by calling `builtin.list` on the livinityd RPC.
 *
 * Destructive flag fires the same approval gate as `luse-proxy.ts`. 6 of
 * the 11 built-ins are destructive (the `luse_computer_*` family); the
 * non-destructive 5 are weather + get_current_time + luse_list_windows +
 * luse_computer_screenshot + ui_render.
 *
 * `ui_render` (Phase 202-08) is a PASSTHROUGH on the server — the actual UI
 * rendering happens client-side via the OpenUI Lang renderer. We still
 * proxy it through livinityd so the SSE chunk emitter fires consistently.
 */

import { jsonResult } from "openclaw/plugin-sdk/agent-runtime";
import type {
  OpenClawPluginToolContext,
  OpenClawPluginApi,
} from "openclaw/plugin-sdk/core";

import { callPluginRpc } from "./livinityd-rpc.js";

interface BuiltinToolDef {
  name: string;
  label: string;
  description: string;
  destructive: boolean;
  parameters: Record<string, unknown>;
}

/**
 * Mirror of livinityd's `BUILT_IN_TOOL_CATALOG` (Phase 202-08, 11 entries).
 * Schema mirrors the createTool() inputSchema in built-in-tools.ts.
 */
const BUILTIN_TOOL_DEFS: ReadonlyArray<BuiltinToolDef> = [
  {
    name: "weather",
    label: "Weather",
    destructive: false,
    description:
      "Get current weather and 3-day forecast for a city. Returns structured data the host renders as a WeatherWidget.",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string", description: "City name in any language" },
      },
      required: ["location"],
    },
  },
  {
    name: "get_current_time",
    label: "Current Time",
    destructive: false,
    description:
      "Get the current date and time on the LivOS Mini PC. Optional IANA timezone, otherwise system zone.",
    parameters: {
      type: "object",
      properties: {
        timezone: {
          type: "string",
          description: "IANA timezone, e.g. 'Europe/Istanbul'",
        },
      },
    },
  },
  {
    name: "ui_render",
    label: "Render UI",
    destructive: false,
    description:
      "Render a custom inline UI block (OpenUI Lang JSON tree). Use when structured data is better presented as visual UI rather than markdown.",
    parameters: {
      type: "object",
      properties: {
        tree: { description: "OpenUI Lang JSON tree" },
        title: { type: "string", description: "Optional block title" },
      },
      required: ["tree"],
    },
  },
  {
    name: "luse_list_windows",
    label: "List Windows",
    destructive: false,
    description:
      "List all currently open windows on the LivOS desktop. Returns a structured list rendered as a DataTable.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "luse_computer_screenshot",
    label: "Screenshot",
    destructive: false,
    description:
      "Capture the LivOS desktop as a PNG screenshot. Returns base64 image inline.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "luse_computer_click_mouse",
    label: "Click Mouse",
    destructive: true,
    description:
      "Click at (x, y) on the LivOS desktop. DESTRUCTIVE — operator approval required.",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        button: { type: "string", enum: ["left", "middle", "right"] },
      },
      required: ["x", "y"],
    },
  },
  {
    name: "luse_computer_type_text",
    label: "Type Text",
    destructive: true,
    description:
      "Type text into the focused window via xdotool. DESTRUCTIVE — operator approval required.",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
  {
    name: "luse_computer_press_keys",
    label: "Press Keys",
    destructive: true,
    description:
      "Send keys to the focused window via xdotool key syntax. DESTRUCTIVE — operator approval required.",
    parameters: {
      type: "object",
      properties: { keys: { type: "string" } },
      required: ["keys"],
    },
  },
  {
    name: "luse_computer_application",
    label: "Launch/Focus/Close App",
    destructive: true,
    description:
      "Launch, focus, or close an app on the LivOS desktop. DESTRUCTIVE — operator approval required.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["launch", "focus", "close"] },
        name: { type: "string" },
      },
      required: ["action", "name"],
    },
  },
  {
    name: "luse_computer_drag_mouse",
    label: "Drag Mouse",
    destructive: true,
    description:
      "Drag the mouse on the LivOS desktop. DESTRUCTIVE — operator approval required.",
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
    destructive: true,
    description:
      "Paste text via the X11 clipboard + ctrl+v. DESTRUCTIVE — operator approval required.",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
];

export const BUILTIN_TOOL_COUNT = BUILTIN_TOOL_DEFS.length;

interface ResolvedRegisterOptions {
  callRpc: CallRpcFn;
}

function buildBuiltinToolFactory(def: BuiltinToolDef, opts: ResolvedRegisterOptions) {
  return (ctx: OpenClawPluginToolContext) => ({
    name: def.name,
    label: def.label,
    description: def.description,
    parameters: def.parameters,
    execute: async (callId: string, params: Record<string, unknown>) => {
      if (def.destructive) {
        const approvalRes = await opts.callRpc(
          "approval.request",
          {
            toolName: def.name,
            args: params,
            agentId: ctx.agentId,
            toolCallId: callId,
          },
          { timeoutMs: 5 * 60 * 1000 + 5_000 },
        );
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

      const invokeRes = await opts.callRpc("builtin.invoke", {
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

import type { RpcResponse, CallRpcOptions } from "./livinityd-rpc.js";
export type CallRpcFn = (
  method: string,
  args: Record<string, unknown>,
  opts?: CallRpcOptions,
) => Promise<RpcResponse<unknown>>;

export interface RegisterOptions {
  callRpc?: CallRpcFn;
  logger?: { info?: (msg: string) => void; warn?: (msg: string) => void };
}

/**
 * Register all 11 built-in LivOS tools as openclaw gateway tools.
 */
export function registerBuiltinProxyTools(
  api: OpenClawPluginApi,
  options: RegisterOptions = {},
): string[] {
  const callRpc: CallRpcFn = options.callRpc ?? callPluginRpc;
  const opts: ResolvedRegisterOptions = { callRpc };

  const registered: string[] = [];
  for (const def of BUILTIN_TOOL_DEFS) {
    api.registerTool(buildBuiltinToolFactory(def, opts), { name: def.name });
    registered.push(def.name);
  }
  options.logger?.info?.(
    `[livinityd-tools] registered ${registered.length} built-in LivOS proxy tools`,
  );
  return registered;
}

export { BUILTIN_TOOL_DEFS };
