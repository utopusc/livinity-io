# Phase 220 — Liv AI Design Tokens + MCP Config Editor

**Mode:** AUTONOMOUS (operator: "soru sormadan").
**Triggered by:** 2026-05-26 post-219 — operator wants Liv AI surfaces to match Livinity Design System (landing-page aesthetic) + MCP config file editor.
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — untouched.

## Tasks

### T1 — MCP Config raw editor (feature request)
- New tRPC: `openclawos.gateway.readMcpConfig` (already exists — verify) + `writeMcpConfig` (admin-only, JSON-validate, atomic write via OpenclawConfigStore.patch).
- McpServersTab UI: collapsible "Edit raw config" section under External Servers — textarea (monospace) + Save button + parse-error inline display.
- Idempotent + safe: read shows current `/opt/livos/data/openclaw/openclaw.json`. Save validates JSON shape, calls patch (atomic mv).
- **Commit:** `feat(220-T1): MCP Servers — raw openclaw.json editor`

### T2 — claw-client design token repaint (CSS-only, zero JSX changes)
- Repaint `claw-client/src/app/globals.css` `:root` variables to Livinity values:
  - `--color-text-brand` indigo `#6366f1` → mono `#1d1d1f`
  - `--color-interactive-accent-default` indigo → mono `#1d1d1f`
  - All interactive-accent variants → mono shades
  - `--color-text-neutral-primary` keep (already 26/26/26 ≈ Livinity --fg)
  - Add `--color-chat-user-response-bg` → keep light teal `#14b8a6` per Livinity store aesthetic (the ONE brand pop)
- Add Space Grotesk font @import at top of globals.css.
- Update `font-family` to `'Space Grotesk', system-ui, sans-serif` for body.
- Dark-mode block: mirror Livinity dark tokens (--fg-dim, --bg-2 etc.).
- **Commit:** `feat(220-T2): claw-client — Livinity Design System tokens repaint`

### T3 — Public Access dialog + dialogs polish (token-aware)
- `public-access-section.tsx` already uses `text-text-primary` etc. — verify renders correctly post-T2.
- Update if any hardcoded colors leak. **Commit:** only if changes needed: `polish(220-T3): public-access-section — token cleanup`

### T4 — SUMMARY + ship
- Append SUMMARY-220.md → commit `ship(220): MCP config editor + Livinity Design System tokens`.

## Out of scope
- liv-ai-app/Settings repaint (different package, separate phase later)
- Full A-Z component audit (operator said "yazılardan butonlara" — token-driven re-paint, NOT rewriting each component)
- New dark-mode artwork
