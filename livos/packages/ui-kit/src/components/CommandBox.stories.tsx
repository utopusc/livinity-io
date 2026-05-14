import type { Meta, StoryObj } from "@storybook/react";
import { CommandBox } from "./CommandBox";

const meta: Meta<typeof CommandBox> = {
  title: "Composites/CommandBox",
  component: CommandBox,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof CommandBox>;

export const Default: Story = {
  args: { text: "curl -fsSL https://livinity.io/install | bash" },
};

export const WithCopyButton: Story = {
  args: {
    text: "curl -fsSL https://livinity.io/install | bash",
    copyButton: true,
  },
};

export const LongCommand: Story = {
  args: {
    text: "docker run --rm -it -p 8080:8080 -e LIV_API_KEY=$LIV_API_KEY -v /opt/livos/data:/data ghcr.io/livinity/livinityd:latest start --bootstrap",
    copyButton: true,
  },
};
