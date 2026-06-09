import { describe, expect, it } from "vitest";

import { extractSlugFromPathname } from "./OpenUiAppView";

describe("extractSlugFromPathname", () => {
  it("extracts slug from a direct claw-client URL", () => {
    expect(extractSlugFromPathname("/apps/calculator")).toBe("calculator");
  });

  it("extracts slug from the Caddy-rewritten /liv-ai-app/apps path", () => {
    expect(extractSlugFromPathname("/liv-ai-app/apps/calculator")).toBe("calculator");
  });

  it("extracts slug from the gateway /plugins/openclawos/apps path", () => {
    expect(extractSlugFromPathname("/plugins/openclawos/apps/calculator")).toBe(
      "calculator",
    );
  });

  it("strips trailing slash", () => {
    expect(extractSlugFromPathname("/apps/calculator/")).toBe("calculator");
  });

  it("strips a trailing .html (defensive)", () => {
    expect(extractSlugFromPathname("/apps/calculator.html")).toBe("calculator");
  });

  it("returns null for the placeholder sentinel", () => {
    expect(extractSlugFromPathname("/apps/__placeholder__")).toBeNull();
    expect(extractSlugFromPathname("/apps/__placeholder__.html")).toBeNull();
  });

  it("returns null when /apps/ is absent", () => {
    expect(extractSlugFromPathname("/setup")).toBeNull();
    expect(extractSlugFromPathname("/")).toBeNull();
  });

  it("returns null when /apps/ has no slug", () => {
    expect(extractSlugFromPathname("/apps/")).toBeNull();
    expect(extractSlugFromPathname("/apps")).toBeNull();
  });

  it("strips query and hash if leaked into pathname", () => {
    expect(extractSlugFromPathname("/apps/calc?x=1")).toBe("calc");
    expect(extractSlugFromPathname("/apps/calc#frag")).toBe("calc");
  });

  it("handles hyphens and underscores per the SlugSchema regex", () => {
    expect(extractSlugFromPathname("/apps/foo-bar_baz")).toBe("foo-bar_baz");
  });
});
