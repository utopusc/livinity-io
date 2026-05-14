import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "./Modal";

describe("<Modal />", () => {
  it("renders nothing when open=false", () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hidden">
        <p>body</p>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("when open=true, renders dialog with aria-modal + aria-labelledby pointing at title", () => {
    render(
      <Modal open onClose={() => {}} title="Confirm">
        <p>body</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const titleId = dialog.getAttribute("aria-labelledby");
    expect(titleId).toBeTruthy();
    const heading = document.getElementById(titleId!);
    expect(heading?.textContent).toBe("Confirm");
  });

  it("Escape key calls onClose", async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="X">
        <button type="button">in-modal</button>
      </Modal>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking the backdrop calls onClose; clicking the panel does NOT", async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="X">
        <button type="button">in-modal</button>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = screen.getByTestId("modal-backdrop");
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking the close X button calls onClose", async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="X">
        <p>body</p>
      </Modal>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("on open, focus moves into modal; on close, focus restores to previous element", async () => {
    const previous = document.createElement("button");
    previous.textContent = "trigger";
    document.body.appendChild(previous);
    previous.focus();
    expect(document.activeElement).toBe(previous);

    const { rerender } = render(
      <Modal open onClose={() => {}} title="X">
        <button type="button">inside-1</button>
        <button type="button">inside-2</button>
      </Modal>,
    );

    // First focusable inside modal = the Close X button, which we expect now focused.
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close");

    rerender(
      <Modal open={false} onClose={() => {}} title="X">
        <button type="button">inside-1</button>
        <button type="button">inside-2</button>
      </Modal>,
    );

    expect(document.activeElement).toBe(previous);
    previous.remove();
  });

  it("Tab cycles focus within the modal (wraps last → first)", async () => {
    const user = userEvent.setup();
    render(
      <Modal open onClose={() => {}} title="X">
        <button type="button">inside-1</button>
        <button type="button">inside-2</button>
      </Modal>,
    );

    // Close X is the first focusable, then inside-1, then inside-2.
    const close = screen.getByRole("button", { name: "Close" });
    const inside1 = screen.getByRole("button", { name: "inside-1" });
    const inside2 = screen.getByRole("button", { name: "inside-2" });
    expect(document.activeElement).toBe(close);

    await user.tab();
    expect(document.activeElement).toBe(inside1);
    await user.tab();
    expect(document.activeElement).toBe(inside2);

    // Now at last — tab again should wrap to first (close X).
    await user.tab();
    expect(document.activeElement).toBe(close);

    // Shift+Tab from first should wrap to last.
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(inside2);
  });
});
