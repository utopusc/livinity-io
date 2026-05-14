import type { Meta, StoryObj } from "@storybook/react";
import { Stepper } from "./Stepper";

const meta: Meta<typeof Stepper> = {
  title: "Composites/Stepper",
  component: Stepper,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof Stepper>;

const steps = [
  { id: "s1", label: "Account" },
  { id: "s2", label: "Domain" },
  { id: "s3", label: "Install" },
  { id: "s4", label: "Done" },
];

export const Default: Story = { args: { steps, current: 1 } };
export const FirstStep: Story = { args: { steps, current: 0 } };
export const LastStep: Story = { args: { steps, current: 3 } };
export const AllDone: Story = { args: { steps, current: 4 } };
