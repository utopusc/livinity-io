/**
 * Phase 203-06 Task 3 — Built-in LivOS tool proxies registered as openclaw
 * gateway tools.
 *
 * Implements D-203-14: the 3 unique LivOS built-in tools (weather,
 * get_current_time, ui_render; the 8 luse_* tools are registered
 * exclusively by luse-proxy.ts to avoid intra-plugin name conflicts —
 * Plan 208-08, R1 fix) are re-exposed as openclaw gateway tools by
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
 * All 3 remaining built-ins are non-destructive. The luse_* destructive
 * set is handled by luse-proxy.ts.
 *
 * `ui_render` (Phase 202-08) is a PASSTHROUGH on the server — the actual UI
 * rendering happens client-side via the OpenUI Lang renderer. We still
 * proxy it through livinityd so the SSE chunk emitter fires consistently.
 *
 * Phase 208-09 R9 — `browser` tool added. UNLIKE the other builtins this
 * one is fully resolved INSIDE the plugin: it runs a 2-second probe of
 * Chrome's `/json/version` endpoint on `127.0.0.1:9222` (`preferAttach`
 * mode — never spawns a second headless Chrome) and returns a structured
 * `{running, cdpReady, error?}` shape. The Chrome process is owned by
 * livinityd's `bootstrap.ts` (Phase 101-01) — the browser tool MUST
 * attach to it, never start its own. Probe semantics mirror
 * `ChromeCdpClient.probeAttachTarget` (livos/packages/livinityd/source/
 * modules/chrome-cdp/client.ts) verbatim so behaviour stays in lock-step
 * across the workspace boundary.
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
 * Plugin-owned subset of livinityd's `BUILT_IN_TOOL_CATALOG` (Phase 202-08).
 * Only the 3 unique non-luse tools are registered here — the 8 luse_* tools
 * live in luse-proxy.ts (Plan 208-08, R1). livinityd's full 11-entry catalog
 * is still consumed by the in-app UI tool-picker manifest via the
 * `openclaw.builtins.list` tRPC route (separate consumer, not affected).
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
];

/**
 * Phase 208-09 R9 — Browser-tool descriptor. NOT part of BUILTIN_TOOL_DEFS
 * because its execute path is fully in-plugin (probes
 * http://127.0.0.1:9222/json/version directly) rather than routed through
 * livinityd's `builtin.invoke` RPC. Kept as a separate constant so the
 * BUILTIN_TOOL_COUNT export (consumed by parity checks at boot in
 * `index.ts`) keeps its meaning of "RPC-dispatched builtins".
 */
const BROWSER_TOOL_DEF: BuiltinToolDef = {
  name: "browser",
  label: "Browser Status",
  destructive: false,
  description:
    "Probe the LivOS desktop Chrome process and report whether the CDP socket on " +
    "127.0.0.1:9222 is reachable. Use this BEFORE attempting navigate / act / " +
    "snapshot — if running:false or cdpReady:false, the operator's Chrome is not " +
    "up and any subsequent browser action will fail. Returns " +
    "{running, cdpReady, version?, error?}.",
  parameters: {
    type: "object",
    properties: {},
  },
};

// Probe target — pinned to loopback + the same port `bootstrap.ts` listens
// on. NEVER spawn a second Chrome from the plugin; the only sanctioned way
// to bring Chrome up is livinityd's Phase 101-01 bootstrap. `preferAttach`
// is implicit here (no spawn fallback exists at all).
const BROWSER_CDP_HOST = "127.0.0.1";
const BROWSER_CDP_PORT = 9222;
const BROWSER_PROBE_TIMEOUT_MS = 2_000;

/**
 * Phase 208-09 R9 — in-plugin probe of Chrome's CDP socket. Mirrors
 * `probeAttachTarget` in `livos/packages/livinityd/source/modules/chrome-cdp/
 * client.ts`. Returns the structured `{running, cdpReady, version?, error?}`
 * shape the browser tool surfaces to the agent. Never throws.
 *
 * `running`   — true iff /json/version returned 200 OK with a parseable body.
 * `cdpReady`  — same semantics as `running` for this probe. (A future
 *               extension may distinguish "process up" from "CDP socket
 *               reachable"; for now they collapse to the same signal.)
 * `version`   — Chrome's reported `Browser` string when reachable.
 * `error`     — short human-readable reason when not reachable (timeout,
 *               connection refused, non-2xx status). Mentions
 *               `--remote-debugging-port=9222` so the operator knows how
 *               to bring Chrome up.
 */
export interface BrowserProbeResult {
  running: boolean;
  cdpReady: boolean;
  version?: string;
  error?: string;
}

export async function probeBrowserAttachTarget(opts: {
  host?: string;
  port?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
} = {}): Promise<BrowserProbeResult> {
  const host = opts.host ?? BROWSER_CDP_HOST;
  const port = opts.port ?? BROWSER_CDP_PORT;
  const timeoutMs = opts.timeoutMs ?? BROWSER_PROBE_TIMEOUT_MS;
  const fetchFn = opts.fetchImpl ?? fetch;
  const url = `http://${host}:${port}/json/version`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) {
      return {
        running: false,
        cdpReady: false,
        error:
          `Chrome not reachable on ${host}:${port}/json/version (HTTP ${res.status}). ` +
          `Ensure Chrome was spawned with --remote-debugging-port=${port}.`,
      };
    }
    const body = (await res.json()) as { Browser?: string };
    return {
      running: true,
      cdpReady: true,
      version: body.Browser ?? "unknown",
    };
  } catch (err) {
    return {
      running: false,
      cdpReady: false,
      error:
        `Chrome not reachable on ${host}:${port}. ` +
        `Ensure bootstrap.ts spawned Chrome with --remote-debugging-port=${port}. ` +
        `Probe error: ${(err as Error).message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

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
 * Phase 208-09 R9 — `browser` tool factory. Does NOT route through
 * `builtin.invoke` (unlike the rest of BUILTIN_TOOL_DEFS) because the
 * probe is pure HTTP + does not need livinityd's tool catalog or
 * approval-manager surface. Runs the probe directly and returns the
 * `{running, cdpReady, version?, error?}` payload via jsonResult.
 */
function buildBrowserToolFactory(opts: {
  probe?: typeof probeBrowserAttachTarget;
} = {}) {
  const probe = opts.probe ?? probeBrowserAttachTarget;
  const def = BROWSER_TOOL_DEF;
  return (_ctx: OpenClawPluginToolContext) => ({
    name: def.name,
    label: def.label,
    description: def.description,
    parameters: def.parameters,
    execute: async (_callId: string, _params: Record<string, unknown>) => {
      const result = await probe();
      return jsonResult(result as unknown as Record<string, unknown>);
    },
  });
}

/**
 * Register the 3 unique LivOS built-in tools (weather, get_current_time,
 * ui_render) as openclaw gateway tools. The 8 luse_* tools are NOT
 * registered here — they live exclusively in luse-proxy.ts to avoid the
 * intra-plugin name conflict spam fixed in Plan 208-08 (R1).
 *
 * Phase 208-09 R9 — also registers the `browser` tool, whose execute path
 * is fully in-plugin (probes Chrome's CDP socket directly; never spawns
 * a second Chrome). Counted separately from BUILTIN_TOOL_COUNT so the
 * existing parity-check at boot stays meaningful.
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
  // Phase 208-09 R9 — browser tool (preferAttach mode, no spawn fallback).
  api.registerTool(buildBrowserToolFactory(), { name: BROWSER_TOOL_DEF.name });
  registered.push(BROWSER_TOOL_DEF.name);

  options.logger?.info?.(
    `[livinityd-tools] registered ${registered.length} built-in LivOS proxy tools (incl. browser preferAttach probe)`,
  );
  return registered;
}

export { BUILTIN_TOOL_DEFS, BROWSER_TOOL_DEF };
