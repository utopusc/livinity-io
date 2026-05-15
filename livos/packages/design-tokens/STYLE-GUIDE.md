# LivOS Style Guide

> **Version:** 1.0 (Phase 121-06, v35.0 close-out, 2026-05-14)
> **Owner:** Design system maintainers
> **Audience:** Anyone adding or modifying UI on any LivOS surface
>   — Mini PC livinityd (`livos/packages/ui/`), Server5 Next.js (`/opt/platform/web/`), or landing static HTML (`/opt/landing/livinity.io/`).

This guide tells you how to add or change a UI component without breaking the visual unity that v35.0 establishes. The canonical reference is `/opt/landing/livinity.io/dashboard.html` (see § "Color tokens" in `.planning/v35-DESIGN-SYSTEM-MILESTONE.md`).

---

## 1. How to add a new component to LivOS UI

### Step 0 — Check `@livinity/ui-kit` first

Before writing a single line of JSX, run:

```bash
grep -E "^export \{" livos/packages/ui-kit/src/index.ts
```

The current export set (v0.1.0, locked Phase 119) is:

- **Atoms:** `Button`, `Card`, `Pill`, `Input`, `PasswordInput`
- **Composites:** `Stepper`, `CommandBox`, `Modal`, `ToastProvider` + `useToast`, `NavBar`, `ThemeToggle`

If your need is covered → import from `@livinity/ui-kit` and stop.

### Step 1 — Variant or prop expansion?

If a similar primitive exists but lacks your variant/prop, **propose adding it to ui-kit** (PR against `livos/packages/ui-kit/`, not against the consumer package). Examples:

- Need a button with a loading spinner? → `<Button variant="solid" loading />` prop addition.
- Need a card with a hover-lift animation? → `<Card hover />` prop addition.
- Need a modal with `Modal.Header` / `Modal.Footer` sub-component slots? → tracked as **Modal v2** in [SHADCN-AUDIT.md § v0.2.0 candidates](../../../.planning/phases/121-mini-pc-long-tail-and-audit/SHADCN-AUDIT.md).

PR template: Storybook story added + Vitest test added + dark + iridescent theme verified.

### Step 2 — Prove necessity

A new ui-kit component requires:

- **Used by ≥2 surfaces** (e.g. would ship to both Mini PC AND Server5), OR
- **Fundamentally new pattern** (e.g. `Slider`, `Tooltip`, `DropdownMenu` — none of which v0.1.0 ships)

If neither holds, keep it in your consumer package as a one-off.

### Step 3 — Ship to ui-kit

Atomic PR with:

- `livos/packages/ui-kit/src/components/{Name}/{Name}.tsx` (component)
- `livos/packages/ui-kit/src/components/{Name}/{Name}.types.ts` (prop types)
- `livos/packages/ui-kit/src/components/{Name}/{Name}.stories.tsx` (Storybook story — required for visual regression baseline)
- `livos/packages/ui-kit/src/components/{Name}/{Name}.test.tsx` (Vitest unit test)
- `livos/packages/ui-kit/src/index.ts` (export)
- Playwright snapshot baseline updated (`pnpm --filter ui-kit playwright:update`)

### Step 4 — Consumer-specific only when necessary

A Mini-PC-only `<DockIcon>` or a Server5-only `<DashboardShell>` is fine — keep it in the consumer's local `components/` tree. The rule: **anything reusable across surfaces ships to ui-kit**.

---

## 2. Token usage rules

### Always use canonical tokens

The single source of truth lives in `livos/packages/design-tokens/`:

- `tokens.css` — CSS-var block (`:root` + `body.dark` + `body.iridescent`)
- `tailwind.preset.cjs` — Tailwind preset mapping tokens to utility classes
- `fonts.css` — Geist + Geist Mono + Instrument Serif `@font-face` declarations
- `theme.json` — JSON manifest for Storybook + future Figma tooling

Reference these tokens via:

- **CSS:** `var(--accent-blue)`, `var(--card-bg)`, `var(--dash-radius)`, `var(--dash-pad)`, etc.
- **Tailwind:** `bg-accent-blue`, `bg-card-bg`, `rounded-dash`, `p-dash`, `text-text-primary`, `border-border-default`, `transition-dash`, etc.
- **Landing HTML:** `<link rel="stylesheet" href="/_shared/tokens.css">` (Phase 118-01).

### NEVER inline these literals

| Forbidden | Use instead |
|---|---|
| `#2563eb`, `#16a34a`, `#d97706`, `#dc2626` (hex literals) | `var(--accent-{blue,green,amber,red})` or `bg-accent-{color}` |
| `bg-blue-600`, `bg-green-500`, `bg-amber-500`, `bg-red-500` (Tailwind palette) | `bg-accent-blue` etc. |
| `bg-zinc-50`, `bg-zinc-100`, `bg-zinc-900`, `bg-zinc-950` (card surfaces) | `bg-card-bg`, `bg-card-bg-2` |
| `rounded-2xl` on card shells | `rounded-dash` |
| `p-7` or `p-8` on card shells | `p-dash` |
| `font-sans` default (Tailwind fallback to system) | Ensure `@livinity/design-tokens/fonts.css` is imported — `font-sans` then maps to Geist |
| Inline `transition: 0.2s ease-out` | `transition-dash` (canonical `0.18s ease`) |

### State-bound color exceptions

Some literals are NOT drift — they are state-bound semantics that the token system intentionally doesn't abstract:

- `bg-red-600/80` on `<NotificationBadge count={N}>` — error/count indicator semantic; preserved per 121-04 settings precedent.
- `text-emerald-500` on AI tool-success chip — identity-color (success != accent-green generic).
- `text-amber-100` overlay text on `bg-amber-400/30` tinted mark — text-on-tint paired shade.
- Dark-surface `slate-900` on shadcn `<Button variant="secondary">` — terminal/chrome dark-surface identity.
- Radix-managed dropdown surface neutral-palette (`context-menu`, `shared/menu.ts`) — Radix design contract.

These exceptions are **documented in code comments** + the 121-04 and 121-05 SUMMARYs. New literals must justify themselves the same way (with a comment).

### Typography

| Use case | Token | Tailwind class |
|---|---|---|
| Body text | Geist | `font-sans` (default) |
| Code / data / labels with letter-spacing | Geist Mono | `font-mono` |
| Editorial accent (hero titles, italic flourish) | Instrument Serif | `font-serif` |

Letter-spacing for uppercase mono labels: `tracking-[0.06em]` to `tracking-[0.10em]` (per dashboard.html convention).

### Motion

All transitions: `0.18s ease` canonical. Use `transition-dash` or inline `transition: var(--motion-dash, 0.18s ease)`.

Hover lift on interactive cards/buttons: `hover:-translate-y-px` (1px lift).

---

## 3. PR checklist for UI changes

Copy-paste this into your PR description:

- [ ] **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved**
      `git hash-object liv/packages/core/src/sdk-agent-runner.ts` matches.
- [ ] **D-V35-NO-FUNCTIONAL-REGRESSIONS** — only visual-layer changes (no prop API edits, no handler edits, no API call changes, no auth flow changes).
- [ ] **D-V35-CANONICAL-IS-DASHBOARD-HTML** — visual diff trends toward dashboard.html, never away.
- [ ] **D-V35-LIGHT-DARK-IRIDESCENT-PARITY** — tested manually in `body.light`, `body.dark`, `body.iridescent` (toggle via `localStorage.liv_theme`).
- [ ] **D-V35-INCREMENTAL-COMMITS** — one logical change per commit; partial reverts work cleanly.
- [ ] No raw hex literals (e.g. `#2563eb`); no raw Tailwind palette (e.g. `bg-blue-600` outside the state-bound exception list).
- [ ] If new ui-kit component: Storybook story added + Vitest test added.
- [ ] If existing ui-kit component changed: Playwright snapshot baseline updated (`pnpm --filter ui-kit playwright:update`) and committed.
- [ ] Behavioral-handler regex diff CLEAN:
      ```
      git diff --unified=0 ${BASE}..HEAD -- 'livos/packages/ui/**' \
        | grep -E "^[-+].*(onClick=|onSubmit=|onChange=|useEffect\(|useState\(|trpc\.|fetch\()"
      ```
      If non-empty, justify each line in PR description.
- [ ] `pnpm --filter ui build` PASS (Mini PC).
- [ ] If Server5 / landing changes: documented in handoff log per D-V35-SERVER5-IN-TREE-PATCH-LOG.
- [ ] Operator-walkable UAT block in commit body or SUMMARY (per `feedback_minipc_is_owncloud_primary` — Mini PC never broken mid-flight).

---

## 4. Cross-surface compatibility matrix

Which ui-kit primitive is consumed by which surface, and via which import path:

| Primitive | Mini PC (Vite + ESM) | Server5 (Next.js + ESM) | Landing (UMD) | First shipped |
|---|---|---|---|---|
| `Button` | `@livinity/ui-kit` Button | `@livinity/ui-kit` Button | `window.LivKit.Button` | Phase 119-02 |
| `Card` | ui-kit Card | ui-kit Card | `window.LivKit.Card` | Phase 119-02 |
| `Pill` | ui-kit Pill | ui-kit Pill | `window.LivKit.Pill` | Phase 119-02 |
| `Input` | ui-kit Input | ui-kit Input | `window.LivKit.Input` | Phase 119-02 |
| `PasswordInput` | ui-kit PasswordInput | ui-kit PasswordInput | `window.LivKit.PasswordInput` | Phase 119-02 |
| `Stepper` | ui-kit Stepper | ui-kit Stepper | `window.LivKit.Stepper` | Phase 119-03 |
| `CommandBox` | ui-kit CommandBox | ui-kit CommandBox | `window.LivKit.CommandBox` | Phase 119-03 |
| `Modal` | ui-kit Modal | ui-kit Modal | `window.LivKit.Modal` | Phase 119-03 |
| `ToastProvider` + `useToast` | ui-kit | ui-kit | `window.LivKit.ToastProvider` | Phase 119-03 |
| `NavBar` | ui-kit NavBar | ui-kit NavBar | `window.LivKit.NavBar` | Phase 119-03 |
| `ThemeToggle` | ui-kit ThemeToggle | ui-kit ThemeToggle | `window.LivKit.ThemeToggle` | Phase 119-03 |

### Token consumption pattern

| Surface | Mechanism |
|---|---|
| Mini PC (Vite) | `import '@livinity/design-tokens/tokens.css'` in `livos/packages/ui/src/index.css` + Tailwind preset extension (Phase 120-01) |
| Server5 (Next.js) | `import '@livinity/design-tokens/tokens.css'` in `app/layout.tsx` + Tailwind preset extension (Phase 117-01) |
| Landing (HTML) | `<link rel="stylesheet" href="/_shared/tokens.css">` per HTML page (Phase 118-01) |

### Fonts (`fonts.css`)

| Surface | Mechanism |
|---|---|
| Mini PC | `@livinity/design-tokens/fonts.css` imported globally in `index.css` |
| Server5 | Imported in `app/layout.tsx` |
| Landing | Inline Google Fonts `<link>` per HTML + self-hosted fallback from `fonts.css` |

---

## 5. Migration recipe — moving an existing component to canonical tokens + ui-kit

This is the playbook used in Phases 120-02..05 and 121-01..05. Follow it for any future migration.

### When to migrate

A component qualifies for migration if it ships:

- Raw hex / Tailwind palette literals (`#2563eb`, `bg-blue-600`, `bg-zinc-100`, `rounded-2xl` on card shells, `p-7` on cards, `text-zinc-{N}` body text, etc.)
- AND is on a user-visible surface (not a dev-only debug tool)
- AND is not state-bound (per § 2 exceptions).

### Prop API analysis

Compare the existing component's prop API to the ui-kit equivalent (if any):

- If **identical** → straight swap import + commit.
- If **subset** → ui-kit covers all consumer needs → straight swap.
- If **superset** (consumer needs more) → either keep the consumer-local version + token-migrate it, OR propose adding the missing prop to ui-kit as a v0.2.0 candidate (preferred).

### Behavioral-diff requirement

After your migration commit, verify byte-identical handler bodies:

```bash
git diff --unified=0 HEAD~1..HEAD -- 'livos/packages/ui/**' \
  | grep -E "^[-+].*(onClick=|onSubmit=|onChange=|onMouseDown=|onPointerDown=|onFocus=|onBlur=|onKeyDown=|onKeyUp=|useEffect\(|useState\(|useRef\(|useMemo\(|useCallback\(|trpc\.|fetch\(|EventSource|streamManager|webappWindowManager)"
```

Expected output: **empty**. If any line appears, you've changed behavior — REVERT and try again with stricter discipline.

### Sub-batch commit pattern

Phase 121-01 through 121-05 shipped each migration as a sub-batch of 1–7 files per commit, with the commit message naming the surface area:

- `feat(121-01a): backups feature canonical tokens — 7 files`
- `feat(121-01b): factory-reset feature canonical tokens — 4 files`
- `feat(121-04-settings-04a): settings/_components — 12 files canonical`

Each sub-batch is independently revertable. Don't ship a 50-file mass-restyle commit.

### Worked example: migrating `update-notification.tsx` (Phase 121-05 commit `ec3155fc`)

**Before** (`livos/packages/ui/src/components/update-notification.tsx`, pre-migration):

```tsx
<div className="fixed bottom-4 right-4 w-96 bg-white border border-zinc-200 rounded-2xl p-6 shadow-lg">
  <h3 className="text-zinc-900 font-semibold">New update available</h3>
  <p className="text-zinc-600 text-sm mt-1">{commit}</p>
  <p className="text-zinc-400 text-xs">{relativeTime}</p>
  <button
    onClick={onUpdate}
    className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
  >
    <DownloadIcon className="text-blue-600 mr-2" />
    Update
  </button>
  <button
    onClick={onDismiss}
    className="ml-2 hover:bg-zinc-50 px-4 py-2 rounded-md"
  >
    Later
  </button>
</div>
```

**After**:

```tsx
<div className="fixed bottom-4 right-4 w-96 bg-card-bg border border-border-default rounded-dash p-dash shadow-card">
  <h3 className="text-text-primary font-semibold">New update available</h3>
  <p className="text-text-secondary text-sm mt-1">{commit}</p>
  <p className="text-text-tertiary text-xs">{relativeTime}</p>
  <button
    onClick={onUpdate}
    className="mt-4 bg-accent-blue hover:bg-accent-blue/90 text-white px-4 py-2 rounded-md"
  >
    <DownloadIcon className="text-accent-blue mr-2" />
    Update
  </button>
  <button
    onClick={onDismiss}
    className="ml-2 hover:bg-card-bg-2 px-4 py-2 rounded-md"
  >
    Later
  </button>
</div>
```

Notice:

- All `bg-zinc-*` → token equivalents (`bg-card-bg`, `bg-card-bg-2`, `border-border-default`).
- All `text-zinc-*` → `text-text-{primary,secondary,tertiary}`.
- `bg-blue-600` / `hover:bg-blue-700` → `bg-accent-blue` / `hover:bg-accent-blue/90`.
- `rounded-2xl` (card shell) → `rounded-dash` (canonical 18px).
- `p-6` (card shell) → `p-dash` (canonical 28px).
- **`onClick` handlers byte-identical** — only visual classes changed.

### Rollback path

Every migration commit is independently revertable:

```bash
git revert <sha>                  # revert the migration commit
bash /opt/livos/update.sh         # redeploy from Mini PC operator side
# OR (Server5):
ssh server5 'cd /opt/platform/web && npm run build && pm2 restart web'
```

If the rollback also touches deps or build config, re-run `pnpm install --frozen-lockfile` in `livos/` first.

### Atomic verification per commit

After each migration commit, three checks must PASS:

1. **Sacred SHA preserved:** `git hash-object liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.
2. **Build PASS:** `pnpm --filter ui build` exits 0.
3. **Behavioral-diff empty:** the regex grep above returns no lines.

If any fails, REVERT and start over with smaller scope.

---

## Reference links

- Canonical visual reference: `/opt/landing/livinity.io/dashboard.html`
- Design system spec: `livos/packages/design-tokens/tokens.css`, `theme.json`, `tailwind.preset.cjs`
- v35.0 acceptance criteria: `.planning/v35-DESIGN-SYSTEM-MILESTONE.md` § "Acceptance criteria"
- Cross-surface consistency report: `.planning/phases/121-mini-pc-long-tail-and-audit/CONSISTENCY-REPORT.md`
- ui-kit shadcn audit + v0.2.0 candidates: `.planning/phases/121-mini-pc-long-tail-and-audit/SHADCN-AUDIT.md`
- ui-kit Storybook (Phase 119): `livos/packages/ui-kit/storybook-static/index.html`
- Visual regression CI: `.github/workflows/visual-regression.yml`
- Playwright suite: `livos/packages/ui-kit/playwright/`

---

**End of Style Guide v1.0.** Updated when a new ui-kit version ships or a new locked invariant is added.
