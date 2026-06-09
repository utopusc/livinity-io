/**
 * Phase 203-04 — AppStore HTTP-client behaviour (replaces fs-based test).
 *
 * Verifies the redirect to livinityd `openclawos.apps.*` over HTTP:
 *   1. create POSTs to /trpc/openclawos.apps.create with the slug + name + content
 *   2. error envelope from livinityd is mapped to user-readable Error.message
 *   3. get translates NOT_FOUND into null (idempotent for callers)
 *   4. mutate retries once on 5xx
 *   5. plugin-side validateOpenUITree rejects disallowed component BEFORE
 *      any network call
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AppStore } from "./app-store.js";

// `generateSecureUuid` is provided by `openclaw/plugin-sdk/infra-runtime`,
// which is an external in the bundle. Mock it for deterministic slugs.
vi.mock("openclaw/plugin-sdk/infra-runtime", () => ({
  generateSecureUuid: () => "deadbeef-cafe-1234-5678-abcdef012345",
}));

interface FetchCall {
  url: string;
  init: RequestInit;
}

let calls: FetchCall[] = [];
let nextResponses: Array<{ status: number; body: unknown }> = [];

function mockFetchResponse(status: number, body: unknown): void {
  nextResponses.push({ status, body });
}

beforeEach(() => {
  calls = [];
  nextResponses = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    calls.push({ url, init: init ?? {} });
    const next = nextResponses.shift();
    if (!next) {
      throw new TypeError("ECONNREFUSED (test: no queued response)");
    }
    return new Response(
      next.body === undefined ? null : JSON.stringify(next.body),
      {
        status: next.status,
        headers: { "content-type": "application/json" },
      },
    );
  }) as unknown as typeof fetch;
  process.env["LIVINITY_BASE_URL"] = "http://127.0.0.1:8080";
  process.env["LIV_PLUGIN_TOKEN"] = "test-token";
});

afterEach(() => {
  delete process.env["LIVINITY_BASE_URL"];
  delete process.env["LIV_PLUGIN_TOKEN"];
});

describe("AppStore — livinityd HTTP redirect", () => {
  test("create POSTs to openclawos.apps.create with slug + name + content", async () => {
    mockFetchResponse(200, [
      {
        result: {
          data: {
            json: {
              slug: "calculator-abc123",
              name: "Calculator",
              content: "root = Card()",
              version: 1,
              userId: "agent-1",
              createdAt: "2026-05-23T00:00:00Z",
              updatedAt: "2026-05-23T00:00:00Z",
            },
          },
        },
      },
    ]);

    const store = new AppStore("/ignored");
    const app = await store.create({
      title: "Calculator",
      content: "root = Card()",
      agentId: "agent-1",
      sessionKey: "sess-1",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("/trpc/openclawos.apps.create?batch=1");
    expect(calls[0]?.init.method).toBe("POST");
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body["0"].json.name).toBe("Calculator");
    expect(body["0"].json.slug).toMatch(/^calculator-/);
    expect(body["0"].json.content).toBe("root = Card()");
    expect(body["0"].json.userId).toBe("agent-1");

    expect(app.title).toBe("Calculator");
    expect(app.id).toBe("calculator-abc123");
  });

  test("X-Api-Key header sent when LIV_PLUGIN_TOKEN is set", async () => {
    mockFetchResponse(200, [
      {
        result: {
          data: {
            json: {
              slug: "a",
              name: "A",
              content: "",
              version: 1,
              userId: null,
              createdAt: "x",
              updatedAt: "x",
            },
          },
        },
      },
    ]);
    const store = new AppStore("/x");
    await store.create({ title: "A", content: "", agentId: "x", sessionKey: "" });
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["X-Api-Key"]).toBe("test-token");
  });

  test("livinityd error envelope mapped to user-readable Error.message", async () => {
    mockFetchResponse(400, [
      {
        error: {
          json: {
            message: "OPENUI_DISALLOWED_COMPONENT:iframe",
            code: -32600,
            data: { code: "BAD_REQUEST", httpStatus: 400 },
          },
        },
      },
    ]);
    const store = new AppStore("/x");
    await expect(
      store.create({
        title: "bad",
        content: "root = X()",
        agentId: "x",
        sessionKey: "",
      }),
    ).rejects.toThrow(/OPENUI_DISALLOWED_COMPONENT|BAD_REQUEST/);
  });

  test("get translates NOT_FOUND into null", async () => {
    mockFetchResponse(404, [
      {
        error: {
          json: {
            message: "OPENUI_APP_NOT_FOUND",
            code: -32004,
            data: { code: "NOT_FOUND", httpStatus: 404 },
          },
        },
      },
    ]);
    const store = new AppStore("/x");
    const result = await store.get("missing-slug");
    expect(result).toBeNull();
  });

  test("retries once on 5xx", async () => {
    mockFetchResponse(503, [
      {
        error: {
          json: {
            message: "service unavailable",
            code: -32603,
            data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 503 },
          },
        },
      },
    ]);
    mockFetchResponse(200, [
      {
        result: {
          data: {
            json: {
              slug: "retry-test",
              name: "Retry",
              content: "",
              version: 1,
              userId: null,
              createdAt: "x",
              updatedAt: "x",
            },
          },
        },
      },
    ]);

    const store = new AppStore("/x");
    const app = await store.create({
      title: "Retry",
      content: "",
      agentId: "x",
      sessionKey: "",
    });
    expect(app.id).toBe("retry-test");
    expect(calls).toHaveLength(2);
  });

  test("plugin-side validator rejects disallowed component BEFORE network call", async () => {
    const store = new AppStore("/x");
    await expect(
      store.create({
        title: "bad",
        content: JSON.stringify({ type: "iframe", props: {} }),
        agentId: "x",
        sessionKey: "",
      }),
    ).rejects.toThrow(/OPENUI_DISALLOWED_COMPONENT/);
    expect(calls).toHaveLength(0);
  });

  test("delete idempotent on NOT_FOUND", async () => {
    mockFetchResponse(404, [
      {
        error: {
          json: {
            message: "OPENUI_APP_NOT_FOUND",
            code: -32004,
            data: { code: "NOT_FOUND", httpStatus: 404 },
          },
        },
      },
    ]);
    const store = new AppStore("/x");
    await expect(store.delete("nothing")).resolves.toBeUndefined();
  });
});
