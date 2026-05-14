import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Pill } from "./Pill";

describe("Pill", () => {
  it("applies the matching tone class for ok / warn / err / neutral", () => {
    const { rerender, container } = render(<Pill tone="ok">x</Pill>);
    let el = container.firstChild as HTMLElement;
    expect(el.className).toContain("pill");
    expect(el.className).toContain("ok");

    rerender(<Pill tone="warn">x</Pill>);
    el = container.firstChild as HTMLElement;
    expect(el.className).toContain("warn");

    rerender(<Pill tone="err">x</Pill>);
    el = container.firstChild as HTMLElement;
    expect(el.className).toContain("err");

    rerender(<Pill tone="neutral">x</Pill>);
    el = container.firstChild as HTMLElement;
    expect(el.className).toContain("neutral");
  });

  it("renders text content", () => {
    render(<Pill tone="ok">Healthy</Pill>);
    expect(screen.getByText("Healthy")).toBeInTheDocument();
  });

  it("passes through custom aria-label", () => {
    const { container } = render(
      <Pill tone="ok" aria-label="status: healthy">
        OK
      </Pill>
    );
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("aria-label")).toBe("status: healthy");
  });
});
