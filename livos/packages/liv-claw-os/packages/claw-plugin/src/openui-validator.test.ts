/**
 * Phase 203-04 — Plugin-side OpenUI validator parity test.
 *
 * Sanity-checks that the plugin's copy of `validateOpenUITree` agrees with
 * livinityd's copy on the load-bearing cases. Both files MUST stay
 * byte-identical (modulo header comments) per Plan 203-04 plan_context.
 *
 * If this file fails after editing the validator, edit BOTH copies in
 * lockstep:
 *   - livos/packages/livinityd/source/modules/openui/validator.ts
 *   - livos/packages/liv-claw-os/packages/claw-plugin/src/openui-validator.ts
 */

import { describe, expect, test } from "vitest";

import { isSafeUrl, OPENUI_ALLOWED_COMPONENTS, validateOpenUITree } from "./openui-validator.js";

describe("plugin-side openui-validator", () => {
  test("14 allowed components", () => {
    expect(OPENUI_ALLOWED_COMPONENTS).toHaveLength(14);
  });

  test("accepts well-formed tree", () => {
    const tree = {
      type: "card",
      props: { title: "T" },
      children: [{ type: "text", props: { text: "x" } }],
    };
    expect(validateOpenUITree(tree).ok).toBe(true);
  });

  test("rejects unknown component", () => {
    const r = validateOpenUITree({ type: "iframe" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("iframe");
  });

  test("rejects javascript: url in image.src", () => {
    const r = validateOpenUITree({ type: "image", props: { src: "javascript:alert(1)" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("OPENUI_UNSAFE_URL:image.src");
  });

  test("rejects dangerouslySetInnerHTML anywhere", () => {
    const r = validateOpenUITree({
      type: "card",
      props: { dangerouslySetInnerHTML: { __html: "<script>x</script>" } },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("OPENUI_RAW_HTML");
  });

  test("isSafeUrl https + root-relative accepted", () => {
    expect(isSafeUrl("https://x")).toBe(true);
    expect(isSafeUrl("/a")).toBe(true);
  });

  test("isSafeUrl rejects http", () => {
    expect(isSafeUrl("http://x")).toBe(false);
  });
});
