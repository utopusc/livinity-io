import type { Meta, StoryObj } from "@storybook/react";
import { NavBar } from "./NavBar";
import { ThemeToggle } from "./ThemeToggle";

const meta: Meta<typeof NavBar> = {
  title: "Composites/NavBar",
  component: NavBar,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof NavBar>;

export const BrandOnly: Story = {
  args: {
    brand: "Livinity",
  },
};

export const BrandWithThemeToggle: Story = {
  args: {
    brand: "Livinity",
    actions: <ThemeToggle />,
  },
};

export const BrandWithCustomActions: Story = {
  args: {
    brand: "Livinity",
    actions: (
      <>
        <button type="button">Sign in</button>
        <ThemeToggle />
      </>
    ),
  },
};
