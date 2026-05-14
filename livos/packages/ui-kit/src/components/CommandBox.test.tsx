import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { CommandBox } from "./CommandBox";

describe("<CommandBox />", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders the text inside a .cmd-box container with a <pre>", () => {
    render(<CommandBox text="echo hi" />);
    const pre = screen.getByText("echo hi");
    expect(pre.tagName.toLowerCase()).toBe("pre");
    expect(pre.parentElement?.classList.contains("cmd-box")).toBe(true);
  });

  it("renders a copy button when copyButton=true", () => {
    render(<CommandBox text="echo hi" copyButton />);
    const btn = screen.getByRole("button", { name: "Copy to clipboard" });
    expect(btn).toBeInTheDocument();
  });

  it("does NOT render a copy button by default", () => {
    render(<CommandBox text="echo hi" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("clicking the copy button calls navigator.clipboard.writeText with the text", async () => {
    render(<CommandBox text="echo hi" copyButton />);
    const btn = screen.getByRole("button", { name: "Copy to clipboard" });
    await act(async () => {
      btn.click();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("echo hi");
  });

  it("aria-label briefly becomes 'Copied' and reverts after 1500ms", async () => {
    vi.useFakeTimers();
    render(<CommandBox text="echo hi" copyButton />);
    const btn = screen.getByRole("button", { name: "Copy to clipboard" });

    await act(async () => {
      btn.click();
      // flush microtasks from the awaited writeText promise
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(
      screen.getByRole("button", { name: "Copy to clipboard" }),
    ).toBeInTheDocument();
  });
});
