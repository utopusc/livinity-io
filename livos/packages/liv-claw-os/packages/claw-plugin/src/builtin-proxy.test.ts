/**
 * Phase 203-06 Task 3 — builtin-proxy.ts tests.
 *
 * Updated by Plan 208-08 (R1): the 8 luse_* entries were removed from
 * BUILTIN_TOOL_DEFS to silence the intra-plugin name conflict spam
 * (`plugin tool name conflict (openclaw-os-plugin): luse_*`). builtin-proxy
 * now owns only the 3 unique tools (weather, get_current_time, ui_render);
 * luse_* registration is exclusive to luse-proxy.ts.
 *
 * Coverage (≥4):
 *   1. registerBuiltinProxyTools registers exactly 3 tools (post-208-08)
 *   2. ui_render skips approval (non-destructive even though high-impact)
 *   3. weather tool forwards args correctly via builtin.invoke
 *   4. RPC failure → tool returns {error, detail}
 *   5. BUILTIN_TOOL_DEFS contains exactly the 3 unique names
 *   6. ZERO luse_* tools registered here (intra-plugin name conflict guard)
 */

import { describe, expect, test, vi } from "vitest";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

import type { RpcResponse } from "./livinityd-rpc.js";
import {
  registerBuiltinProxyTools,
  BUILTIN_TOOL_COUNT,
  BUILTIN_TOOL_DEFS,
} from "./builtin-proxy.js";

type ToolFactory = (ctx: unknown) => {
  name: string;
  execute: (id: string, params: Record<string, unknown>) => Promise<unknown>;
};

const okR = <T>(result: T): RpcResponse<T> => ({ ok: true, result });
const errR = (error: string, detail?: string): RpcResponse<never> =>
  detail !== undefined ? { ok: false, error, detail } : { ok: false, error };

function makeMockApi(): {
  api: OpenClawPluginApi;
  registered: Array<{ factory: ToolFactory; name: string }>;
} {
  const registered: Array<{ factory: ToolFactory; name: string }> = [];
  const api = {
    registerTool: vi.fn((factory: ToolFactory, opts: { name: string }) => {
      registered.push({ factory, name: opts.name });
    }),
  } as unknown as OpenClawPluginApi;
  return { api, registered };
}

describe("registerBuiltinProxyTools", () => {
  test("registers exactly 3 built-in tools (post Plan 208-08 R1)", () => {
    const { api, registered } = makeMockApi();
    const names = registerBuiltinProxyTools(api, { callRpc: vi.fn() });
    expect(names).toHaveLength(3);
    expect(registered).toHaveLength(3);
    expect(BUILTIN_TOOL_COUNT).toBe(3);
  });

  test("ui_render skips approval (non-destructive)", async () => {
    const { api, registered } = makeMockApi();
    const callRpc = vi.fn(
      async (method: string): Promise<RpcResponse<unknown>> => {
        if (method === "builtin.invoke") return okR({ rendered: true, title: "hi" });
        throw new Error("approval should not be called for ui_render");
      },
    );
    registerBuiltinProxyTools(api, { callRpc });

    const ui = registered.find((r) => r.name === "ui_render")!;
    const tool = ui.factory({ agentId: "agent-1", sessionKey: "s1" });
    await tool.execute("call-x", { tree: { component: "Text", props: { value: "hi" } } });

    expect(callRpc).toHaveBeenCalledTimes(1);
    const c0 = callRpc.mock.calls[0] as [string, ...unknown[]] | undefined;
    expect(c0 && c0[0]).toBe("builtin.invoke");
  });

  test("weather forwards args via builtin.invoke", async () => {
    const { api, registered } = makeMockApi();
    const callRpc = vi.fn(
      async (): Promise<RpcResponse<unknown>> =>
        okR({ temperature: 21, conditions: "Clear sky" }),
    );
    registerBuiltinProxyTools(api, { callRpc });

    const w = registered.find((r) => r.name === "weather")!;
    const tool = w.factory({ agentId: "agent-1", sessionKey: "s1" });
    await tool.execute("call-w", { location: "Istanbul" });

    const invokeCall = callRpc.mock.calls[0] as
      | [string, Record<string, unknown>, ...unknown[]]
      | undefined;
    expect(invokeCall && invokeCall[0]).toBe("builtin.invoke");
    const argsPayload = (invokeCall && invokeCall[1]) as Record<string, unknown>;
    expect(argsPayload["toolName"]).toBe("weather");
    expect((argsPayload["args"] as Record<string, unknown>)["location"]).toBe("Istanbul");
  });

  test("ZERO luse_* tools registered here — plugin tool name conflict guard (Plan 208-08 R1)", () => {
    const { api, registered } = makeMockApi();
    registerBuiltinProxyTools(api, { callRpc: vi.fn() });
    const luseNames = registered.filter((r) => r.name.startsWith("luse_")).map((r) => r.name);
    expect(luseNames).toEqual([]);
    // Plugin tool name conflict mechanism: registerTool in luse-proxy.ts wins
    // the first-registration race; builtin-proxy.ts must NOT re-register the
    // same names or the openclaw gateway emits "plugin tool name conflict
    // (openclaw-os-plugin): luse_*" diagnostics (~152 log lines/boot pre-fix).
    const defNames = BUILTIN_TOOL_DEFS.map((d) => d.name);
    expect(defNames.filter((n) => n.startsWith("luse_"))).toEqual([]);
  });

  test("builtin.invoke RPC failure → tool returns {error, detail}", async () => {
    const { api, registered } = makeMockApi();
    const callRpc = vi.fn(
      async (): Promise<RpcResponse<unknown>> => errR("TOOL_ERROR", "Geocoding failed"),
    );
    registerBuiltinProxyTools(api, { callRpc });

    const w = registered.find((r) => r.name === "weather")!;
    const tool = w.factory({ agentId: "agent-1", sessionKey: "s1" });
    const result = (await tool.execute("call-fail", { location: "?" })) as {
      content: Array<{ text: string }>;
    };
    const first = result.content[0]!;
    const payload = JSON.parse(first.text) as { error: string; detail: string };
    expect(payload.error).toBe("TOOL_ERROR");
    expect(payload.detail).toBe("Geocoding failed");
  });

  test("BUILTIN_TOOL_DEFS contains exactly the 3 unique non-luse names (post Plan 208-08 R1)", () => {
    const names = BUILTIN_TOOL_DEFS.map((d) => d.name).sort();
    expect(names).toEqual(["get_current_time", "ui_render", "weather"]);
  });

  test("destructive flag — zero destructives remain (luse_computer_* moved out)", () => {
    const destructives = BUILTIN_TOOL_DEFS.filter((d) => d.destructive).map((d) => d.name);
    expect(destructives).toEqual([]);
  });
});
