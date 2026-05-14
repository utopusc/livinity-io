import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

const TokenSwatch: React.FC<{ varName: string; label: string }> = ({ varName, label }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "var(--font-mono)" }}>
    <span
      style={{
        display: "inline-block",
        width: 48,
        height: 48,
        background: `var(${varName})`,
        borderRadius: 8,
        border: "1px solid var(--dash-line)",
      }}
    />
    <span>{label}</span>
    <code>{varName}</code>
  </div>
);

const Scaffold: React.FC = () => (
  <div style={{ display: "grid", gap: 16 }}>
    <h2 style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", margin: 0 }}>
      @livinity/ui-kit scaffold
    </h2>
    <p>Phase 119-01 chassis check. Tokens are wired. Components arrive in 119-02 / 119-03.</p>
    <TokenSwatch varName="--accent-blue" label="Primary action" />
    <TokenSwatch varName="--accent-green" label="Success" />
    <TokenSwatch varName="--accent-amber" label="Warning" />
    <TokenSwatch varName="--accent-red" label="Danger" />
    <div
      style={{
        background: "var(--card-bg)",
        boxShadow: "var(--card-shadow)",
        padding: "var(--dash-pad)",
        borderRadius: "var(--dash-radius)",
      }}
    >
      Canonical card surface.
    </div>
  </div>
);

const meta: Meta<typeof Scaffold> = {
  title: "Scaffold/Design Tokens",
  component: Scaffold,
};

export default meta;
type Story = StoryObj<typeof Scaffold>;

export const Tokens: Story = {};
