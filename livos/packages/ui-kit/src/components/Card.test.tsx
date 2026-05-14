import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "./Card";

describe("Card", () => {
  it("default padding + radius applies b-card-pad-default + b-card-radius-default", () => {
    const { container } = render(<Card>body</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("b-card");
    expect(el.className).toContain("b-card-pad-default");
    expect(el.className).toContain("b-card-radius-default");
  });

  it("padding='tight' swaps to b-card-pad-tight", () => {
    const { container } = render(<Card padding="tight">x</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("b-card-pad-tight");
    expect(el.className).not.toContain("b-card-pad-default");
  });

  it("radius='tight' swaps to b-card-radius-tight", () => {
    const { container } = render(<Card radius="tight">x</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("b-card-radius-tight");
    expect(el.className).not.toContain("b-card-radius-default");
  });

  it("renders arbitrary children", () => {
    render(
      <Card>
        <span>nested</span>
      </Card>
    );
    expect(screen.getByText("nested")).toBeInTheDocument();
  });

  it("forwardRef yields HTMLDivElement", () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<Card ref={ref}>x</Card>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
