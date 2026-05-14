import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ThemeToggle } from "./ThemeToggle";
import { LIV_THEME_STORAGE_KEY } from "../lib/theme-classes";

describe("<ThemeToggle />", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.classList.remove("dark", "iridescent");
  });

  it("renders a button with an aria-label naming the next theme", () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toMatch(/Switch to .+ theme/);
  });

  it("initial label reflects readLivTheme() (light → 'Switch to dark theme')", () => {
    window.localStorage.setItem(LIV_THEME_STORAGE_KEY, "light");
    render(<ThemeToggle />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toBe("Switch to dark theme");
  });

  it("clicking cycles light → dark → iridescent → light and persists to localStorage", () => {
    window.localStorage.setItem(LIV_THEME_STORAGE_KEY, "light");
    render(<ThemeToggle />);
    const btn = screen.getByRole("button");

    act(() => {
      btn.click();
    });
    expect(window.localStorage.getItem(LIV_THEME_STORAGE_KEY)).toBe("dark");
    expect(document.body.classList.contains("dark")).toBe(true);
    expect(btn.getAttribute("aria-label")).toBe("Switch to iridescent theme");

    act(() => {
      btn.click();
    });
    expect(window.localStorage.getItem(LIV_THEME_STORAGE_KEY)).toBe(
      "iridescent",
    );
    expect(document.body.classList.contains("iridescent")).toBe(true);
    expect(document.body.classList.contains("dark")).toBe(false);
    expect(btn.getAttribute("aria-label")).toBe("Switch to light theme");

    act(() => {
      btn.click();
    });
    expect(window.localStorage.getItem(LIV_THEME_STORAGE_KEY)).toBe("light");
    expect(document.body.classList.contains("dark")).toBe(false);
    expect(document.body.classList.contains("iridescent")).toBe(false);
    expect(btn.getAttribute("aria-label")).toBe("Switch to dark theme");
  });

  it("button has type='button' and a .theme-toggle class", () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.classList.contains("theme-toggle")).toBe(true);
  });
});
