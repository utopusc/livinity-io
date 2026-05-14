import type { Meta, StoryObj } from "@storybook/react";
import { ToastProvider, useToast } from "./Toast";

const meta: Meta = {
  title: "Composites/Toast",
  parameters: { layout: "padded" },
};
export default meta;

function ToastDemo() {
  const toast = useToast();
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" onClick={() => toast.success("Saved successfully")}>
        Success
      </button>
      <button type="button" onClick={() => toast.info("Heads up — info")}>
        Info
      </button>
      <button type="button" onClick={() => toast.warn("Check this out")}>
        Warn
      </button>
      <button type="button" onClick={() => toast.error("Something broke")}>
        Error
      </button>
    </div>
  );
}

type Story = StoryObj;
export const Default: Story = {
  render: () => (
    <ToastProvider>
      <ToastDemo />
    </ToastProvider>
  ),
};
