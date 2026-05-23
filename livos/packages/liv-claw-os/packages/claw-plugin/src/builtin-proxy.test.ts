/**
 * Phase 203-06 Task 3 — builtin-proxy.ts tests.
 *
 * Coverage (≥4):
 *   1. registerBuiltinProxyTools registers exactly 11 tools
 *   2. ui_render skips approval (non-destructive even though high-impact)
 *   3. weather tool forwards args correctly via builtin.invoke
 *   4. Destructive luse_computer_click_mouse routes through approval first
 *   5. RPC failure → tool returns {error, detail}
 *   6. Mirrors livinityd BUILT_IN_TOOL_CATALOG count (11)
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
  test("registers exactly 11 built-in tools", () => {
    const { api, registered } = makeMockApi();
    const names = registerBuiltinProxyTools(api, { callRpc: vi.fn() });
    expect(names).toHaveLength(11);
    expect(registered).toHaveLength(11);
    expect(BUILTIN_TOOL_COUNT).toBe(11);
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

  test("destructive luse_computer_click_mouse routes through approval first", async () => {
    const { api, registered } = makeMockApi();
    const callRpc = vi.fn(
      async (method: string): Promise<RpcResponse<unknown>> => {
        if (method === "approval.request")
          return okR({ decision: "approved", toolCallId: "tc", runId: "r" });
        if (method === "builtin.invoke") return okR({ success: true, x: 100, y: 200 });
        return errR("UNEXPECTED");
      },
    );
    registerBuiltinProxyTools(api, { callRpc });

    const c = registered.find((r) => r.name === "luse_computer_click_mouse")!;
    const tool = c.factory({ agentId: "agent-1", sessionKey: "s1" });
    await tool.execute("call-c", { x: 100, y: 200 });

    expect(callRpc).toHaveBeenCalledTimes(2);
    const c0 = callRpc.mock.calls[0];
    const c1 = callRpc.mock.calls[1];
    expect(c0 && c0[0]).toBe("approval.request");
    expect(c1 && c1[0]).toBe("builtin.invoke");
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

  test("BUILTIN_TOOL_DEFS contains expected 11 names", () => {
    const names = BUILTIN_TOOL_DEFS.map((d) => d.name);
    expect(names).toContain("weather");
    expect(names).toContain("get_current_time");
    expect(names).toContain("ui_render");
    expect(names).toContain("luse_list_windows");
    expect(names).toContain("luse_computer_screenshot");
    expect(names).toContain("luse_computer_click_mouse");
    expect(names).toContain("luse_computer_type_text");
    expect(names).toContain("luse_computer_press_keys");
    expect(names).toContain("luse_computer_application");
    expect(names).toContain("luse_computer_drag_mouse");
    expect(names).toContain("luse_computer_paste_text");
    expect(names).toHaveLength(11);
  });

  test("destructive flag mirrors livinityd built-in-tools.ts (6 destructive)", () => {
    const destructives = BUILTIN_TOOL_DEFS.filter((d) => d.destructive).map((d) => d.name);
    expect(destructives).toHaveLength(6);
    expect(destructives).toEqual(
      expect.arrayContaining([
        "luse_computer_click_mouse",
        "luse_computer_type_text",
        "luse_computer_press_keys",
        "luse_computer_application",
        "luse_computer_drag_mouse",
        "luse_computer_paste_text",
      ]),
    );
  });
});
