import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { Pill } from "./Pill";

const meta: Meta<typeof Pill> = {
  title: "Atoms/Pill",
  component: Pill,
  args: { tone: "ok", children: "Active" },
  argTypes: {
    tone: { control: "radio", options: ["ok", "warn", "err", "neutral"] },
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Pill>;

export const Ok: Story = { args: { tone: "ok", children: "Healthy" } };
export const Warn: Story = { args: { tone: "warn", children: "Degraded" } };
export const Err: Story = { args: { tone: "err", children: "Offline" } };
export const Neutral: Story = { args: { tone: "neutral", children: "Idle" } };

export const AllTones: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Pill tone="ok">OK</Pill>
      <Pill tone="warn">Warn</Pill>
      <Pill tone="err">Err</Pill>
      <Pill tone="neutral">Neutral</Pill>
    </div>
  ),
};
