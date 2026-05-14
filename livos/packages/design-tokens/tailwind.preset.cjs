/**
 * @livinity/design-tokens — Tailwind preset (3.4-compatible)
 *
 * Usage:
 *   // tailwind.config.cjs
 *   module.exports = {
 *     presets: [require("@livinity/design-tokens/tailwind.preset.cjs")],
 *     content: [...],
 *   };
 *
 * Tailwind 4 note: When migrating consumers to Tailwind 4 (CSS-first config),
 * import tokens.css directly and use @theme inline instead of a JS preset.
 * The token values in this preset MUST mirror tokens.css verbatim.
 *
 * D-116-LOCK-CANONICAL: Every value below mirrors `/opt/landing/livinity.io/dashboard.html`
 * `:root` block. Drift between this file and tokens.css is a bug.
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        // Accent tokens — match --accent-* in tokens.css
        "accent-blue":  "#2563eb",
        "accent-green": "#16a34a",
        "accent-amber": "#d97706",
        "accent-red":   "#dc2626",
        // Surface tokens — match --card-bg / --card-bg-2 in tokens.css
        "card-bg":   "#ffffff",
        "card-bg-2": "#fafafa",
        // Line tokens — match --dash-line / --dash-line-strong in tokens.css
        "dash-line":        "rgba(0,0,0,0.07)",
        "dash-line-strong": "rgba(0,0,0,0.12)",
      },
      spacing: {
        // Match --dash-pad in tokens.css
        "dash": "28px",
      },
      borderRadius: {
        // Match --dash-radius in tokens.css
        "dash": "18px",
      },
      boxShadow: {
        // Match --card-shadow in tokens.css
        "card": "0 1px 2px rgba(0,0,0,0.03), 0 24px 60px -34px rgba(0,0,0,0.18)",
      },
      backgroundImage: {
        // Match --hero-grad in tokens.css
        "hero-grad": "linear-gradient(135deg, #fafafa 0%, #f0f0f3 100%)",
      },
      fontFamily: {
        // Match --font-mono / --font-serif in tokens.css
        mono:  ["Geist Mono", "ui-monospace", "monospace"],
        serif: ["Instrument Serif", "serif"],
      },
      transitionDuration: {
        // dashboard.html ships "0.18s ease" for all transitions
        "dash": "180ms",
      },
    },
  },
};
