import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "./Toast";

afterEach(() => {
  vi.useRealTimers();
});

describe("<ToastProvider /> + useToast()", () => {
  it("ToastProvider wraps children and renders a notifications region", () => {
    render(
      <ToastProvider>
        <p>child content</p>
      </ToastProvider>,
    );
    expect(screen.getByText("child content")).toBeInTheDocument();
    const region = screen.getByRole("region", { name: "Notifications" });
    expect(region).toBeInTheDocument();
  });

  it("useToast() returns an object with success/warn/error/info methods", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ToastProvider>{children}</ToastProvider>
    );
    const { result } = renderHook(() => useToast(), { wrapper });
    expect(typeof result.current.success).toBe("function");
    expect(typeof result.current.warn).toBe("function");
    expect(typeof result.current.error).toBe("function");
    expect(typeof result.current.info).toBe("function");
    expect(typeof result.current.dismiss).toBe("function");
  });

  it("toast.success('hi') renders a node with role='status' containing 'hi'", async () => {
    function Demo() {
      const toast = useToast();
      return (
        <button type="button" onClick={() => toast.success("hi")}>
          fire
        </button>
      );
    }
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "fire" }));
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("hi");
  });

  it("toast.error('oops') renders a node with role='alert'", async () => {
    function Demo() {
      const toast = useToast();
      return (
        <button type="button" onClick={() => toast.error("oops")}>
          fire
        </button>
      );
    }
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "fire" }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("oops");
  });

  it("a toast auto-dismisses after 4000ms", async () => {
    vi.useFakeTimers();
    function Demo() {
      const toast = useToast();
      return (
        <button type="button" onClick={() => toast.success("ttl")}>
          fire
        </button>
      );
    }
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    );

    const btn = screen.getByRole("button", { name: "fire" });
    await act(async () => {
      btn.click();
    });
    expect(screen.getByRole("status").textContent).toBe("ttl");

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("useToast() outside ToastProvider throws a clear error", () => {
    // Suppress React's error boundary log noise for this test.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      renderHook(() => useToast());
    }).toThrow(/useToast must be used within <ToastProvider>/);
    spy.mockRestore();
  });
});
