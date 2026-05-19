# Phase 158 — UI Chrome + Dock Iteration — CONTEXT

**Milestone:** v37.0 (post-install-wiring polish)
**Status:** IN-PROGRESS 2026-05-19 — round 14 shipped, more iterations expected
**Depends on:** Phase 157 (install wiring) ✅
**Trigger:** Operator side-by-side localhost dev pass against the claude-design `v37-store-claude-design` mock bundle.

## What this phase is

After Phase 157's install pipeline shipped, the operator started a localhost UI iteration pass with `pnpm --filter ui dev` (port 3000) pointed at the live `bruce.livinity.io` backend. The work is **pure UI polish in `livos/packages/ui/src`** — no livinityd / Vercel changes. Reference mock files live at `.planning/design-system/v37-store-claude-design/*.html`.

## Done in rounds 1-14 (commit `9cc0d398`)

### Dock — `livos/packages/ui/src/modules/desktop/`

- **`dock-glyphs.tsx` (NEW)** — 8 hand-written SVG glyphs ported verbatim from `dock-icons.html`:
  - `IconFiles` (folder w/ tab), `IconSettings` (8-tooth gear), `IconAnalytics` (4 vertical bars), `IconAppStore` (rounded square + plus — hero glyph, stroke 1.8 / 2.4), `IconLiv` (Lucide chat bubble), `IconServer` (2 stacked racks), `IconDevices` (phone outline), `IconTerminal` (`>` chevron + dash).
  - Tabler fallbacks retained for `Home`, `Docker`, `Agents`, `Schedules`, `Chrome`, `Gmail` (no claude-design mocks).
- **`dock-item.tsx`** — squircle tile (`borderRadius = size × 0.28`, iOS Tahoe), frosted white → bg-2 gradient, hairline border, layered shadows. Dark-mode flip via `useTheme()`. Per-app hover halo (radial tint, lower-right). `OpenPill` → `OpenDot` (4px). Hover lift `translateY(-6px)` via Framer `whileHover`. **Liv (AI Chat) is NOT inverted** per operator feedback ("siyah değil beyaz yap").

### Window chrome — `livos/packages/ui/src/modules/window/`

- **`window-chrome.tsx`** — spans full window width, ~42px above the window's top edge. Layout row: `[X close] · [WebApp action area] · [drag bar (title)] · [Skills library]`.
  - Width animation uses **explicit `animate={{width}}`** — NOT `layout="size"` (which used `transform: scale` and stretched icons + teleported the title text per round-13 operator complaint). 0.55s tween, M3 emphasized-decelerate easing `[0.16, 1, 0.3, 1]`.
  - Action area width is fixed per mode: `84px` (icons) / `380px` (chat input or response). Drag bar width derived from `windowWidth - overhead - actionAreaWidth` so both animate in lockstep.
  - No `layout` prop on the outer chrome → window drag stays butter-smooth (60fps position mutations don't trigger FLIP animations).
- **`window.tsx`** — passes optional `webappId` through to the chrome.
- **`webapp-floating-action-bar.tsx`** — new `inline` prop renders just the mode-switched content (IconBar / ChatInputBar / ChatResponseBar) without the fixed-positioned wrapper. Chat-input + chat-response pills restyled to match the chrome drag bar (h-9, same `bg-card-bg/55 backdrop-blur-3xl backdrop-saturate-150` shell). Chat-response single-line truncate.
- **`webapp-floating-skills-button.tsx`** — new `inline` prop for the chrome embed. Fixed-positioned satellite branch retained for back-compat.
- **`windows-container.tsx`** — removed outside-window `WebAppFloatingActionBar` + `WebAppFloatingSkillsButton` renders (both moved into chrome). Pure window mount now.

## Operator's localhost setup (active across sessions)

```bash
cd livos
VITE_BACKEND_URL=https://bruce.livinity.io pnpm --filter ui dev
# → http://localhost:3000
```

The dev server runs against the live Mini PC backend at bruce.livinity.io. HMR auto-reloads on every save. Hard refresh (Ctrl+Shift+R) only needed if Tailwind / CSS tokens change.

## What's open for next iterations

The mock bundle in `.planning/design-system/v37-store-claude-design/` still has surfaces that haven't been ported:

| Mock file | Surface | Notes |
|---|---|---|
| `topbar.html` | Top bar | Date + avatar + workspace switcher. Currently `livos/packages/ui/src/modules/topbar/` |
| `dashboard.html` | LivOS desktop background (?) | May overlap with v36 Phase 122-124 work — check before porting |
| `profile.html` | Profile / settings → User | Likely lives under `routes/settings/_components/` |
| `auth.html` | Login screen | `routes/login/*` |
| `onboarding.html` + `onboarding.css` | Onboarding flow | Phase 36 territory — `routes/onboarding/*` |
| `changelog.html` | Changelog viewer | `routes/changelog/*` (?) |
| `customize.html` | Desktop customization | wallpaper picker / dock toggle |
| `logo.html` | Logo / brand mark | Static asset variants |
| `design-system.html` | Token reference | Already absorbed via Tailwind / CSS vars in v36 phases 122-124 |

Operator-driven priorities are uncertain — wait for the operator to point at the next mock or describe what feels wrong on localhost.

## Hard guardrails carried from earlier rounds

- **No `transform: scale` for chrome width morphing** — round 14 explicitly killed this approach. Use explicit `animate={{width}}`.
- **No `layout` props on the chrome's outer container** — round 11 fix; window drag (60fps position mutations) would otherwise trigger FLIP animations and lag.
- **Liv (AI Chat) icon is NOT inverted** — operator feedback "siyah değil beyaz yap" (round 7-ish). The `DOCK_INVERTED` set is empty by default.
- **Drag bar never collapses to a handle** — round 11 fix; explicit drag-bar width derived from windowWidth keeps it visible at all times.
- **Memory note carried forward:** `feedback_v36_monochrome_dock_rejected` warned against fully-monochrome dock. Current state is monochrome-tile + colorful-hover-halo + colored-icons (Tabler fallbacks keep their default colors). User explicitly approved this hybrid.

## Files to read on resume

1. `.planning/phases/158-ui-chrome-dock-iteration/CONTEXT.md` (this file)
2. `livos/packages/ui/src/modules/desktop/dock-item.tsx`
3. `livos/packages/ui/src/modules/desktop/dock-glyphs.tsx`
4. `livos/packages/ui/src/modules/window/window-chrome.tsx`
5. `livos/packages/ui/src/modules/window/webapp-floating-action-bar.tsx`
6. `.planning/design-system/v37-store-claude-design/dock-icons.html` (reference)
7. Whatever mock file the operator points at next.

## Acceptance (whole phase)

This phase is **open-ended polish**, not a fixed-scope deliverable. Each commit is a self-contained operator-approved iteration. The phase closes when the operator stops pointing at new mocks OR when v37 milestone audit happens.

Current iteration count: 14 (rounds shipped through 2026-05-19).
