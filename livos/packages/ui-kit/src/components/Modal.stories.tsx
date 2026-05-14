import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Modal } from "./Modal";

const meta: Meta<typeof Modal> = {
  title: "Composites/Modal",
  component: Modal,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof Modal>;

function TriggerWrap({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open modal
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        {children}
      </Modal>
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <TriggerWrap title="Confirm action">
      <p>Are you sure you want to proceed?</p>
    </TriggerWrap>
  ),
};

export const WithLongContent: Story = {
  render: () => (
    <TriggerWrap title="Terms of service">
      <div>
        {Array.from({ length: 12 }).map((_, i) => (
          <p key={i}>
            Section {i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing
            elit. Pellentesque habitant morbi tristique senectus et netus.
          </p>
        ))}
      </div>
    </TriggerWrap>
  ),
};

export const WithFormInside: Story = {
  render: () => (
    <TriggerWrap title="Rename instance">
      <form
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <label>
          New name
          <input type="text" defaultValue="my-instance" />
        </label>
        <button type="submit">Save</button>
      </form>
    </TriggerWrap>
  ),
};
