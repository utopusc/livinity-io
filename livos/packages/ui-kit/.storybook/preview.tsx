import type { Preview } from "@storybook/react";
import React, { useEffect } from "react";

// Inject canonical design tokens into every story.
// These imports are side-effect: they register CSS variables on :root + body.{dark,iridescent}.
import "@livinity/design-tokens/tokens.css";
import "@livinity/design-tokens/fonts.css";

import { applyLivTheme, type LivTheme } from "../src/lib/theme-classes";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "light",
      values: [
        { name: "light", value: "#ffffff" },
        { name: "dark", value: "#0a0a0a" },
        { name: "iridescent", value: "#1a0a2a" },
      ],
    },
    controls: { expanded: true },
  },
  globalTypes: {
    livTheme: {
      name: "LivOS theme",
      description: "Light / Dark / Iridescent body class",
      defaultValue: "light",
      toolbar: {
        icon: "paintbrush",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
          { value: "iridescent", title: "Iridescent" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = (context.globals.livTheme as LivTheme) ?? "light";
      useEffect(() => {
        applyLivTheme(theme);
      }, [theme]);
      return (
        <div
          style={{
            padding: "var(--dash-pad, 28px)",
            fontFamily:
              'Geist, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            color: "inherit",
          }}
        >
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
