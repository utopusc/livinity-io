import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { Card } from "./Card";

const meta: Meta<typeof Card> = {
  title: "Atoms/Card",
  component: Card,
  args: {
    padding: "default",
    radius: "default",
    children: "Card body content",
  },
  argTypes: {
    padding: { control: "radio", options: ["default", "tight"] },
    radius: { control: "radio", options: ["default", "tight"] },
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {};

export const TightPadding: Story = {
  args: { padding: "tight" },
};

export const TightRadius: Story = {
  args: { radius: "tight" },
};

export const TightAll: Story = {
  args: { padding: "tight", radius: "tight" },
};

export const WithRichChildren: Story = {
  render: () => (
    <Card>
      <h3 style={{ margin: 0, fontFamily: "var(--font-serif)" }}>Card title</h3>
      <p style={{ marginTop: 12, marginBottom: 0 }}>
        Cards use <code>var(--card-bg)</code>, <code>var(--dash-pad)</code> and
        <code> var(--dash-radius)</code> from <code>@livinity/design-tokens</code>.
      </p>
    </Card>
  ),
};
