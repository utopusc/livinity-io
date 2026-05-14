import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { Input } from "./Input";

const meta: Meta<typeof Input> = {
  title: "Atoms/Input",
  component: Input,
  args: {
    placeholder: "Type something…",
  },
  argTypes: {
    label: { control: "text" },
    hint: { control: "text" },
    error: { control: "text" },
    disabled: { control: "boolean" },
    placeholder: { control: "text" },
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Plain: Story = {};

export const WithLabel: Story = {
  args: { label: "Email address" },
};

export const WithHint: Story = {
  args: {
    label: "API key",
    hint: "Lives in /opt/livos/.env LIV_API_KEY.",
  },
};

export const WithError: Story = {
  args: {
    label: "Subdomain",
    error: "Must be lowercase alphanumeric, 3-32 chars.",
    defaultValue: "BAD value!",
  },
};

export const Disabled: Story = {
  args: {
    label: "Read-only field",
    disabled: true,
    defaultValue: "cannot edit",
  },
};
