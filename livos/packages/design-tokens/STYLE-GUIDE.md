# LivOS Style Guide — How to Add a New Component

> **Status:** Skeleton — full content arrives in Phase 121.
>
> Until then, this file documents the contract every new component must follow.

## The contract

Every LivOS UI component MUST:

1. Consume tokens from `@livinity/design-tokens` — never hard-code color/spacing/radius/shadow values.
2. Use `var(--token-name)` in CSS, or Tailwind classes that map to the preset (e.g. `bg-card-bg`, `rounded-dash`, `shadow-card`).
3. Respect theme switching — never assume `:root` (light); test under `body.dark` and `body.iridescent`.
4. Use the canonical font stack — `font-mono` for code/data, `font-serif` for editorial display, default sans for body.
5. Honor the motion token — transitions are `0.18s ease` (`duration-dash` in Tailwind, or `transition: 0.18s ease`).

## Anti-patterns

- Hard-coded hex values in component source — **drift = bug** per D-116-LOCK-CANONICAL.
- Importing fonts directly from Google Fonts in component code — fonts come from `@livinity/design-tokens/fonts.css` only (single import point, self-host fallback works offline).
- One-off shadow/radius values — if you need a new value, add a token to the package first.

## Workflow

1. Identify the design need.
2. Check `DESIGN-SYSTEM.md` — does a token already cover it?
3. If yes: use the token.
4. If no: propose a new token in `@livinity/design-tokens` first; ship it as a new minor version; then consume in your component.

## To be expanded in Phase 121

- Component naming conventions
- File layout (`src/components/{name}/{name}.tsx + {name}.test.tsx + {name}.stories.tsx`)
- Story authoring guide
- Accessibility checklist
- Cross-theme screenshot policy
