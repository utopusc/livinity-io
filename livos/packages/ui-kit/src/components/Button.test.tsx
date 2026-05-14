import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "./Button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Hello</Button>);
    expect(screen.getByRole("button", { name: /hello/i })).toBeInTheDocument();
  });

  it("applies variant classes (solid / ghost / danger)", () => {
    const { rerender } = render(<Button variant="solid">x</Button>);
    let btn = screen.getByRole("button");
    expect(btn.className).toContain("solid");
    expect(btn.className).not.toContain("danger");

    rerender(<Button variant="ghost">x</Button>);
    btn = screen.getByRole("button");
    expect(btn.className).not.toContain("solid");
    expect(btn.className).not.toContain("danger");

    rerender(<Button variant="danger">x</Button>);
    btn = screen.getByRole("button");
    expect(btn.className).toContain("danger");
    expect(btn.className).not.toContain("solid");
  });

  it("applies size classes (sm / md / lg)", () => {
    const { rerender } = render(<Button size="sm">x</Button>);
    expect(screen.getByRole("button").className).toContain("h-btn-sm");

    rerender(<Button size="md">x</Button>);
    expect(screen.getByRole("button").className).toContain("h-btn-md");

    rerender(<Button size="lg">x</Button>);
    expect(screen.getByRole("button").className).toContain("h-btn-lg");
  });

  it("loading=true sets aria-busy and blocks onClick", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>
    );
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("forwardRef gives access to the underlying HTMLButtonElement", () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>x</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("native disabled prop blocks onClick", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        x
      </Button>
    );
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});
