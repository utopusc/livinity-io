import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PasswordInput } from "./PasswordInput";

describe("PasswordInput", () => {
  it("defaults to type='password'", () => {
    render(<PasswordInput label="pw" id="pw" />);
    const input = screen.getByLabelText("pw") as HTMLInputElement;
    expect(input.type).toBe("password");
  });

  it("clicking the visibility toggle flips type to 'text' and back, and toggles aria-pressed", () => {
    render(<PasswordInput label="pw" id="pw" />);
    const input = screen.getByLabelText("pw") as HTMLInputElement;
    const toggle = screen.getByRole("button", { name: /show password/i });

    expect(input.type).toBe("password");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);
    expect(input.type).toBe("text");
    // After click, the toggle should report aria-pressed='true' and the
    // accessible name should flip to "Hide password".
    const hideToggle = screen.getByRole("button", { name: /hide password/i });
    expect(hideToggle.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(hideToggle);
    expect((screen.getByLabelText("pw") as HTMLInputElement).type).toBe(
      "password"
    );
    expect(
      screen
        .getByRole("button", { name: /show password/i })
        .getAttribute("aria-pressed")
    ).toBe("false");
  });

  it("toggle aria-label switches between 'Show password' and 'Hide password'", () => {
    render(<PasswordInput label="pw" id="pw" />);
    const showToggle = screen.getByRole("button");
    expect(showToggle.getAttribute("aria-label")).toBe("Show password");
    fireEvent.click(showToggle);
    const hideToggle = screen.getByRole("button");
    expect(hideToggle.getAttribute("aria-label")).toBe("Hide password");
  });

  it("inherits Input behaviors (label, hint, error, disabled)", () => {
    const { container, rerender } = render(
      <PasswordInput label="pw" id="pw" hint="strong only" />
    );
    let input = screen.getByLabelText("pw");
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
    expect(container.querySelector(".i-text-hint")).not.toBeNull();

    rerender(<PasswordInput label="pw" id="pw" error="too short" />);
    input = screen.getByLabelText("pw");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector(".i-text-error")).not.toBeNull();
    expect(container.querySelector(".i-text-hint")).toBeNull();

    rerender(<PasswordInput label="pw" id="pw" disabled />);
    expect(screen.getByLabelText("pw")).toBeDisabled();
  });
});
