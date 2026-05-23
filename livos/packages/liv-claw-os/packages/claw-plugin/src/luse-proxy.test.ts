/**
 * Phase 203-06 Task 2 — luse-proxy.ts tests.
 *
 * Coverage (≥4):
 *   1. registerLuseProxyTools registers exactly 9 tools (mock api.registerTool)
 *   2. Destructive tool factory invokes approval.request BEFORE luse.invoke
 *   3. Non-destructive tool factory invokes luse.invoke directly (no approval)
 *   4. Approval rejected → tool returns {rejected:true, reason, decision}
 *   5. Approval timeout → tool returns {rejected:true, decision:'timeout'}
 *   6. luse.invoke RPC failure → tool returns {error, detail}
 *
 * Plugin's own vitest 4.x has a Vite 7+ dependency gap (Plan 203-04 SUMMARY).
 * These tests are TS-clean and ready for execution once the install gap is
 * fixed (Plan 203-02 deviation carry-over).
 */

import { describe, expect, test, vi } from "vitest";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

import type { RpcResponse } from "./livinityd-rpc.js";
import {
  registerLuseProxyTools,
  LUSE_TOOL_COUNT,
  DESTRUCTIVE_LUSE_TOOLS,
} from "./luse-proxy.js";

type ToolFactory = (ctx: unknown) => {
  name: string;
  execute: (id: string, params: Record<string, unknown>) => Promise<unknown>;
};

// Typed RpcResponse helpers — keep mock return-types aligned with the
// generic shape `callPluginRpc<T>` exposes so TS doesn't widen `ok: boolean`.
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

describe("registerLuseProxyTools", () => {
  test("registers exactly 9 luse_* tools", () => {
    const { api, registered } = makeMockApi();
    const names = registerLuseProxyTools(api, {
      callRpc: vi.fn(),
    });
    expect(names).toHaveLength(9);
    expect(registered).toHaveLength(9);
    expect(LUSE_TOOL_COUNT).toBe(9);
    // All names start with luse_
    for (const n of names) expect(n.startsWith("luse_")).toBe(true);
  });

  test("destructive tool invokes approval.request BEFORE luse.invoke (approved)", async () => {
    const { api, registered } = makeMockApi();
    const callRpc = vi.fn(
      async (method: string): Promise<RpcResponse<unknown>> => {
        if (method === "approval.request") {
          return okR({ decision: "approved", toolCallId: "tc", runId: "r" });
        }
        if (method === "luse.invoke") {
          return okR({ content: [{ type: "text", text: "ok" }] });
        }
        return errR("UNEXPECTED");
      },
    );
    registerLuseProxyTools(api, { callRpc });

    const clickEntry = registered.find((r) => r.name === "luse_computer_click_mouse")!;
    const tool = clickEntry.factory({ agentId: "agent-1", sessionKey: "s1" });
    const result = await tool.execute("call-1", { x: 100, y: 200 });

    expect(callRpc).toHaveBeenCalledTimes(2);
    const firstCall = callRpc.mock.calls[0] as
      | [string, Record<string, unknown>, ...unknown[]]
      | undefined;
    const secondCall = callRpc.mock.calls[1] as [string, ...unknown[]] | undefined;
    expect(firstCall && firstCall[0]).toBe("approval.request");
    expect(
      ((firstCall && firstCall[1]) as Record<string, unknown>)["toolName"],
    ).toBe("luse_computer_click_mouse");
    expect(secondCall && secondCall[0]).toBe("luse.invoke");
    expect(result).toBeDefined();
  });

  test("non-destructive tool skips approval — direct luse.invoke", async () => {
    const { api, registered } = makeMockApi();
    const callRpc = vi.fn(
      async (method: string): Promise<RpcResponse<unknown>> => {
        if (method === "luse.invoke") {
          return okR({ content: [{ type: "text", text: "shot" }] });
        }
        return errR("UNEXPECTED");
      },
    );
    registerLuseProxyTools(api, { callRpc });

    const shotEntry = registered.find((r) => r.name === "luse_computer_screenshot")!;
    const tool = shotEntry.factory({ agentId: "agent-1", sessionKey: "s1" });
    await tool.execute("call-2", {});

    expect(callRpc).toHaveBeenCalledTimes(1);
    const c0 = callRpc.mock.calls[0] as [string, ...unknown[]] | undefined;
    expect(c0 && c0[0]).toBe("luse.invoke");
    expect(DESTRUCTIVE_LUSE_TOOLS.has("luse_computer_screenshot")).toBe(false);
  });

  test("approval rejected → tool returns rejected payload, does NOT call luse.invoke", async () => {
    const { api, registered } = makeMockApi();
    const callRpc = vi.fn(
      async (method: string): Promise<RpcResponse<unknown>> => {
        if (method === "approval.request") {
          return okR({ decision: "rejected", toolCallId: "tc", runId: "r" });
        }
        throw new Error("luse.invoke must not be called when rejected");
      },
    );
    registerLuseProxyTools(api, { callRpc });

    const typeEntry = registered.find((r) => r.name === "luse_computer_type_text")!;
    const tool = typeEntry.factory({ agentId: "agent-1", sessionKey: "s1" });
    const result = (await tool.execute("call-3", { text: "hello" })) as {
      content: Array<{ text: string }>;
    };

    expect(callRpc).toHaveBeenCalledTimes(1);
    const c0 = callRpc.mock.calls[0];
    expect(c0 && c0[0]).toBe("approval.request");
    const first = result.content[0]!;
    const payload = JSON.parse(first.text) as { rejected: boolean; decision: string };
    expect(payload.rejected).toBe(true);
    expect(payload.decision).toBe("rejected");
  });

  test("approval timeout → tool returns rejected payload with decision:timeout", async () => {
    const { api, registered } = makeMockApi();
    const callRpc = vi.fn(
      async (method: string): Promise<RpcResponse<unknown>> => {
        if (method === "approval.request") {
          return okR({ decision: "timeout", toolCallId: "tc", runId: "r" });
        }
        throw new Error("luse.invoke must not be called when timeout");
      },
    );
    registerLuseProxyTools(api, { callRpc });

    const pressEntry = registered.find((r) => r.name === "luse_computer_press_keys")!;
    const tool = pressEntry.factory({ agentId: "agent-1", sessionKey: "s1" });
    const result = (await tool.execute("call-4", { keys: "ctrl+c" })) as {
      content: Array<{ text: string }>;
    };

    const first = result.content[0]!;
    const payload = JSON.parse(first.text) as { decision: string };
    expect(payload.decision).toBe("timeout");
  });

  test("luse.invoke RPC failure → tool returns {error, detail}", async () => {
    const { api, registered } = makeMockApi();
    const callRpc = vi.fn(
      async (): Promise<RpcResponse<unknown>> => errR("TOOL_ERROR", "wmctrl missing"),
    );
    registerLuseProxyTools(api, { callRpc });

    const listEntry = registered.find((r) => r.name === "luse_list_windows")!;
    const tool = listEntry.factory({ agentId: "agent-1", sessionKey: "s1" });
    const result = (await tool.execute("call-5", {})) as {
      content: Array<{ text: string }>;
    };
    const first = result.content[0]!;
    const payload = JSON.parse(first.text) as { error: string; detail: string };
    expect(payload.error).toBe("TOOL_ERROR");
    expect(payload.detail).toBe("wmctrl missing");
  });

  test("DESTRUCTIVE_LUSE_TOOLS matches mcp-bridge canonical set (6 entries)", () => {
    expect(DESTRUCTIVE_LUSE_TOOLS.size).toBe(6);
    expect(DESTRUCTIVE_LUSE_TOOLS.has("luse_computer_click_mouse")).toBe(true);
    expect(DESTRUCTIVE_LUSE_TOOLS.has("luse_computer_type_text")).toBe(true);
    expect(DESTRUCTIVE_LUSE_TOOLS.has("luse_computer_press_keys")).toBe(true);
    expect(DESTRUCTIVE_LUSE_TOOLS.has("luse_computer_application")).toBe(true);
    expect(DESTRUCTIVE_LUSE_TOOLS.has("luse_computer_drag_mouse")).toBe(true);
    expect(DESTRUCTIVE_LUSE_TOOLS.has("luse_computer_paste_text")).toBe(true);
  });
});
