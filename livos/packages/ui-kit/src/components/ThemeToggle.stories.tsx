import type { Meta, StoryObj } from "@storybook/react";
import { ThemeToggle } from "./ThemeToggle";

const meta: Meta<typeof ThemeToggle> = {
  title: "Composites/ThemeToggle",
  component: ThemeToggle,
  parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof ThemeToggle>;

export const Default: Story = {};
