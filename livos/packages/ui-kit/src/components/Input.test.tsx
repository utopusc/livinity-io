import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input } from "./Input";

describe("Input", () => {
  it("renders an <input> associated to its <label> via htmlFor", () => {
    render(<Input label="Email" id="email" />);
    const input = screen.getByLabelText("Email");
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input.getAttribute("id")).toBe("email");
  });

  it("hint renders below input and is linked via aria-describedby", () => {
    const { container } = render(
      <Input id="api" label="API key" hint="Lives in .env" />
    );
    const input = screen.getByLabelText("API key");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const hintNode = container.querySelector(".i-text-hint");
    expect(hintNode).not.toBeNull();
    expect(hintNode!.id).toBe(describedBy);
    expect(hintNode!.textContent).toBe("Lives in .env");
  });

  it("error replaces hint in aria-describedby and sets aria-invalid", () => {
    const { container } = render(
      <Input
        id="port"
        label="Port"
        hint="Must be open"
        error="Invalid port"
      />
    );
    const input = screen.getByLabelText("Port");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby");
    const errorNode = container.querySelector(".i-text-error");
    expect(errorNode).not.toBeNull();
    expect(errorNode!.id).toBe(describedBy);
    // Hint must NOT render when error is present (error precedence).
    expect(container.querySelector(".i-text-hint")).toBeNull();
  });

  it("typing fires onChange with the new value", () => {
    const handleChange = vi.fn();
    render(<Input label="x" id="x" onChange={handleChange} />);
    const input = screen.getByLabelText("x") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hello" } });
    expect(handleChange).toHaveBeenCalled();
    expect(input.value).toBe("hello");
  });

  it("disabled prop disables the input", () => {
    render(<Input label="x" id="x" disabled />);
    const input = screen.getByLabelText("x");
    expect(input).toBeDisabled();
  });

  it("auto-generates an id (via React.useId) when none is provided", () => {
    render(<Input label="No id" />);
    const input = screen.getByLabelText("No id") as HTMLInputElement;
    expect(input.id).toBeTruthy();
    expect(input.id.length).toBeGreaterThan(0);
    // The associated <label> should target the auto-generated id.
    const label = screen.getByText("No id") as HTMLLabelElement;
    expect(label.htmlFor).toBe(input.id);
  });

  it("forwardRef yields HTMLInputElement", () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<Input ref={ref} label="x" id="x" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
