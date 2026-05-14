import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Stepper } from "./Stepper";

const steps = [
  { id: "a", label: "Account" },
  { id: "b", label: "Domain" },
  { id: "c", label: "Install" },
  { id: "d", label: "Done" },
];

describe("<Stepper />", () => {
  it("renders all step labels in order", () => {
    render(<Stepper steps={steps} current={1} />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "✓Account",
      "Domain",
      "Install",
      "Done",
    ]);
  });

  it("marks indices < current as done, === current as active, > current as idle", () => {
    render(<Stepper steps={steps} current={2} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0].classList.contains("done")).toBe(true);
    expect(items[1].classList.contains("done")).toBe(true);
    expect(items[2].classList.contains("active")).toBe(true);
    expect(items[3].classList.contains("done")).toBe(false);
    expect(items[3].classList.contains("active")).toBe(false);
  });

  it("renders inside an aria-label='Progress' list landmark", () => {
    render(<Stepper steps={steps} current={0} />);
    const list = screen.getByRole("list", { name: "Progress" });
    expect(list).toBeInTheDocument();
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
  });

  it("current step has aria-current='step'", () => {
    render(<Stepper steps={steps} current={2} />);
    const items = screen.getAllByRole("listitem");
    expect(items[2].getAttribute("aria-current")).toBe("step");
    expect(items[0].getAttribute("aria-current")).toBeNull();
  });

  it("done step renders a ✓ prefix", () => {
    render(<Stepper steps={steps} current={2} />);
    const checks = screen.getAllByTestId("stepper-check");
    // Two done steps → two ✓ glyphs.
    expect(checks).toHaveLength(2);
    expect(checks[0].textContent).toBe("✓");
  });
});
