import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchOpenUiApp } from "./fetch-openui-app";

describe("fetchOpenUiApp", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the app on a successful tRPC envelope (bare post-Phase-206 shape)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          result: {
            data: { slug: "calculator", name: "Calculator", content: "<heading>Hi</heading>", version: 1 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const app = await fetchOpenUiApp("calculator", { baseUrl: "http://x" });
    expect(app).toEqual({
      slug: "calculator",
      name: "Calculator",
      content: "<heading>Hi</heading>",
      version: 1,
    });
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const url = firstCall![0] as string;
    // Post-Phase-206: no batch=1, no {0:{json:…}} wrap.
    expect(url).toContain("/trpc/openclawos.apps.get?input=");
    expect(url).toContain(encodeURIComponent(JSON.stringify({ slug: "calculator" })));
    expect(url).not.toContain("batch=1");
  });

  it("returns the app on a legacy batch envelope (defense-in-depth)", async () => {
    // A future server rollback / a different middleware accidentally
    // re-wrapping the response should not crash the page — accept the
    // legacy [{result:{data:{json:…}}}] shape too.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            result: {
              data: { json: { slug: "x", name: "X", content: "x", version: 2 } },
            },
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const app = await fetchOpenUiApp("x", { baseUrl: "http://x" });
    expect(app?.name).toBe("X");
  });

  it("returns null on a tRPC NOT_FOUND envelope inside an HTTP 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            error: {
              data: { code: "NOT_FOUND", httpStatus: 404 },
              message: "OPENUI_APP_NOT_FOUND",
            },
          },
        ]),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const app = await fetchOpenUiApp("ghost", { baseUrl: "http://x" });
    expect(app).toBeNull();
  });

  it("returns null when the body parses to a NOT_FOUND error even on a 200 envelope path", async () => {
    // Some tRPC versions emit a 200 with an error key; guard against both.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            error: {
              data: { code: "NOT_FOUND" },
              message: "OPENUI_APP_NOT_FOUND",
            },
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const app = await fetchOpenUiApp("ghost", { baseUrl: "http://x" });
    expect(app).toBeNull();
  });

  it("throws on a 500 with a non-NOT_FOUND envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("internal", { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchOpenUiApp("x", { baseUrl: "http://x" })).rejects.toThrow(/HTTP 500/);
  });

  it("throws on a malformed envelope (truly non-object body)", async () => {
    // Post-Phase-206 the bare {result:{data}} shape is valid, so the
    // old `{result:"nope"}` test case now means "result exists but data
    // is a string" — which trips the empty-result check, not malformed.
    // Use a truly non-object body instead.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify("not-an-object"), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchOpenUiApp("x", { baseUrl: "http://x" })).rejects.toThrow(/malformed envelope/);
  });

  it("throws when the result is structurally wrong (missing content)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ result: { data: { slug: "x", name: "x" } } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchOpenUiApp("x", { baseUrl: "http://x" })).rejects.toThrow(/invalid shape/);
  });

  it("forwards the abort signal", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return new Response("[]", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      fetchOpenUiApp("x", { baseUrl: "http://x", signal: ctrl.signal }),
    ).rejects.toThrow(/aborted/);
  });
});
