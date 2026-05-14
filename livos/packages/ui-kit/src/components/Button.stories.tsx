import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "Atoms/Button",
  component: Button,
  args: { children: "Click me", variant: "solid", size: "md" },
  argTypes: {
    variant: { control: "select", options: ["solid", "ghost", "danger"] },
    size: { control: "select", options: ["sm", "md", "lg"] },
    loading: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Solid: Story = { args: { variant: "solid" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Danger: Story = { args: { variant: "danger" } };
export const Loading: Story = { args: { loading: true, children: "Loading" } };

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Button variant="solid">Solid</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
    </div>
  ),
};
