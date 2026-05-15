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
        // === v36 Design System (additive — Livinity Design Port) ===
        // Match --fg/--surface/--line/etc. in tokens.css. Coexist with the
        // accent-blue / card-bg / dash-line entries above.
        // SKIPPED: "bg" and "bg-2" (semantic clash with bg-{color} pattern),
        // "accent" / "accent-soft" (Radix-token collision risk). Consumers
        // that need them use bg-[var(--bg)] or bg-[var(--accent)] instead.
        "fg":          "#1d1d1f",
        "fg-dim":      "#424245",
        "fg-mute":     "#6e6e73",
        "fg-faint":    "#a1a1a6",
        "surface":     "#fafafa",
        "surface-2":   "#ebebed",
        "line":        "rgb(0 0 0 / .08)",
        "line-strong": "rgb(0 0 0 / .14)",
      },
      spacing: {
        // Match --dash-pad in tokens.css
        "dash": "28px",
      },
      borderRadius: {
        // Match --dash-radius in tokens.css
        "dash": "18px",
        // === v36 Design System (additive) ===
        // SKIPPED: full --r-* scale (xs/sm/md/lg/xl/2xl). Tailwind's
        // rounded-{side}-{size} directional aliases (e.g. rounded-r-lg, which
        // already exists at livos/packages/ui/src/features/files/components/
        // sidebar/sidebar-network-storage.tsx:N as "rounded right side, lg
        // size") would collide and silently re-resolve to the design-system
        // 18px. Consumers needing the v36 scale use the arbitrary form:
        // `rounded-[var(--r-lg)]`. Existing "dash": "18px" is byte-equal to
        // --r-lg so `rounded-dash` already covers the most-used case.
      },
      boxShadow: {
        // Match --card-shadow in tokens.css
        "card": "0 1px 2px rgba(0,0,0,0.03), 0 24px 60px -34px rgba(0,0,0,0.18)",
        // === v36 Design System (additive) ===
        // Match --shadow-window / --shadow-pop in tokens.css. "window-soft"
        // chosen instead of plain "window" to avoid any chance of clashing
        // with future Tailwind window-* utilities.
        "window-soft": "0 1px 2px rgb(0 0 0 / .04), 0 30px 80px -30px rgb(0 0 0 / .22)",
        "pop":         "0 12px 30px -16px rgb(0 0 0 / .18)",
      },
      backgroundImage: {
        // Match --hero-grad in tokens.css
        "hero-grad": "linear-gradient(135deg, #fafafa 0%, #f0f0f3 100%)",
      },
      fontFamily: {
        // Match --font-mono / --font-serif in tokens.css
        mono:  ["Geist Mono", "ui-monospace", "monospace"],
        serif: ["Instrument Serif", "serif"],
        // v36: no new entries — existing "serif" already maps to Instrument
        // Serif which is the design system's editorial accent font.
      },
      transitionDuration: {
        // dashboard.html ships "0.18s ease" for all transitions
        "dash": "180ms",
      },
      transitionTimingFunction: {
        // === v36 Design System (additive) ===
        // Match --ease-out-v36 / --ease-in-out-v36 in tokens.css. Suffixed
        // "-v36" so they don't clash with Tailwind defaults ease-out / ease-in-out.
        "out-v36":    "cubic-bezier(.2, .7, .2, 1)",
        "in-out-v36": "cubic-bezier(.4, 0, .2, 1)",
      },
    },
  },
};
