import { describe, expect, it } from "vitest";
import { __ui_kit_version__ } from "../index";
import { cn } from "../lib/cn";
import { applyLivTheme, readLivTheme, LIV_THEMES } from "../lib/theme-classes";

describe("@livinity/ui-kit scaffold", () => {
  it("exposes a version stamp", () => {
    expect(__ui_kit_version__).toBe("0.1.0");
  });

  it("cn() merges classnames via clsx", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
    expect(cn(["x", "y"], { z: true, hidden: false })).toBe("x y z");
  });

  it("applyLivTheme toggles body classes per canonical contract", () => {
    const body = document.createElement("body");
    applyLivTheme("dark", body);
    expect(body.classList.contains("dark")).toBe(true);
    expect(body.classList.contains("iridescent")).toBe(false);
    applyLivTheme("iridescent", body);
    expect(body.classList.contains("dark")).toBe(false);
    expect(body.classList.contains("iridescent")).toBe(true);
    applyLivTheme("light", body);
    expect(body.classList.contains("dark")).toBe(false);
    expect(body.classList.contains("iridescent")).toBe(false);
  });

  it("readLivTheme honors localStorage when set", () => {
    window.localStorage.setItem("liv_theme", "iridescent");
    expect(readLivTheme()).toBe("iridescent");
    window.localStorage.removeItem("liv_theme");
  });

  it("exposes all three canonical theme names", () => {
    expect([...LIV_THEMES]).toEqual(["light", "dark", "iridescent"]);
  });
});
