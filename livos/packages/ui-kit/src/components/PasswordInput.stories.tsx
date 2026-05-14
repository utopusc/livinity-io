import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { PasswordInput } from "./PasswordInput";

const meta: Meta<typeof PasswordInput> = {
  title: "Atoms/PasswordInput",
  component: PasswordInput,
  args: {
    placeholder: "Enter password",
  },
  argTypes: {
    label: { control: "text" },
    hint: { control: "text" },
    error: { control: "text" },
    disabled: { control: "boolean" },
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof PasswordInput>;

export const Default: Story = {};

export const WithLabel: Story = {
  args: { label: "Password" },
};

export const WithError: Story = {
  args: {
    label: "Password",
    error: "Must be at least 12 characters.",
    defaultValue: "short",
  },
};

export const WithHint: Story = {
  args: {
    label: "Password",
    hint: "Min 12 chars, mixed case, one symbol.",
  },
};
