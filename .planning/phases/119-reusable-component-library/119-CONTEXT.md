# Phase 119 — Reusable Component Library (`@livinity/ui-kit`) — CONTEXT

**Status:** SKELETON — written 2026-05-14 alongside v35.0 milestone open. Depends on Phase 116 (`@livinity/design-tokens`).

## Phase intent

Single React component library that any LivOS UI surface imports. Mini PC livinityd UI (Vite), Server5 Next.js, and landing static HTML (UMD) all consume the same components. After this phase, new UI work defaults to the library — no more hand-rolled buttons.

## Reference

- Master plan: `.planning/v35-DESIGN-SYSTEM-MILESTONE.md` § Phase 119
- Component-map (Phase 115 output): `.planning/phases/115-ui-component-inventory/COMPONENT-MAP.md` — drives initial export selection
- Token spec (Phase 116 output): `livos/packages/design-tokens/`

## What this phase ships

- New package: `livos/packages/ui-kit/`
- Initial exports (locked to dashboard.html idioms):
  - **Atoms:** `<Button variant="solid|ghost|danger" />`, `<Card padding="default|tight" radius="default|tight" />`, `<Pill tone="ok|warn|err|neutral" />`, `<Input label hint error />`, `<PasswordInput />`
  - **Composites:** `<Stepper steps current />`, `<CommandBox text copyButton />`, `<Modal />`, `<Toast />`, `<NavBar brand user signOut />`, `<ThemeToggle />`
- Three build outputs:
  - **ESM** for Vite + Next.js: `import { Button } from '@livinity/ui-kit'`
  - **CommonJS** for legacy/SSR fallback
  - **UMD** for landing HTML pages: `<script src=".../umd/index.js">` + `window.LivKit.Button`
- Storybook stories per component (visual regression friendly)
- Vitest unit tests per component
- TypeScript types exported

## Locked decisions

| ID | Decision |
|----|----------|
| **D-119-DASHBOARD-HTML-IS-SOURCE** | Component visual idiom matches dashboard.html exactly (via design-tokens). No improvisation. If dashboard.html doesn't have it, design from canonical tokens (Phase 116) but don't invent. |
| **D-119-NO-CONSUMER-CHANGES** | Phase 119 ships the library standalone. Consumer migrations are Phase 120 (Mini PC) + retrofit of Phase 117/118 (Server5/landing). |
| **D-119-3-BUILD-TARGETS** | ESM + CJS + UMD. UMD is non-negotiable — landing HTML pages need it. |
| **D-119-LIGHT-DARK-IRIDESCENT-PARITY** | Every component works in all 3 themes from day one. No "dark mode TODO" |
| **D-119-A11Y-FOCUS-RINGS** | Buttons, Inputs, Modals get visible focus rings + ARIA labels. Don't ship inaccessible components. |

## Plans (4)

- **119-01** — Package scaffolding, build pipeline (ESM/CJS/UMD), tsconfig, design-tokens dep wiring, Storybook setup
- **119-02** — Atom components (Button, Card, Pill, Input, PasswordInput) + Storybook stories + Vitest unit tests
- **119-03** — Composite components (Stepper, CommandBox, Modal, Toast, NavBar, ThemeToggle) + Storybook + tests
- **119-04** — UMD build target + landing HTML integration smoke test (verify `window.LivKit.Button` works in dashboard.html-style page)

## Open questions for discuss-phase

- Storybook version + build tool (Vite vs Webpack)? Likely Vite for consistency with Mini PC UI.
- Publish to private npm registry vs file: dependency? File: dep is simpler for monorepo; switch to npm later if v36 adds external consumers.
- `<Modal />` open/close API — controlled (open + onClose props) or uncontrolled (imperative ref)? Pick one.
- Toast — global provider pattern (single root) or per-call (rendered in place)?

## What this phase does NOT do

- Migrate any consumer (Phase 120 Mini PC, Server5 retrofit done as needed)
- Build Figma mirror (out of v35 scope)
- Build CSS-in-JS — ui-kit uses Tailwind utilities + design-token CSS vars, no styled-components/emotion
