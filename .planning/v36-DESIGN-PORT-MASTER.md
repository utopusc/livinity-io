# v36 LivOS Design Port — Master Plan

**Status:** ACTIVE — written 2026-05-15. Supersedes `.planning/v36-DRAFT.md`.
**Source:** Livinity Design System handoff bundle (`api.anthropic.com/v1/design/h/oUmCwgCAPJ9S_vRk9xAjvg`), user-authored in claude.ai/design.
**Local copies:** `.planning/design-system/{livinity-design-system.html, styles.css, SOURCE-README.md, chat2-port-intent.md}`
**User intent (chat2.md verbatim):** *"livinity.io da yaptigimiz degisiklikleri livos da da yapacagiz componentolarak tek tek ilerleyecegiz"*

**Goal:** Port the livinity.io design language (Apple-restrained, editorial, monochrome) into the LivOS Mini PC UI **component-by-component, additively**. Every phase produces a screenshot-able delta on ONE surface; nothing else changes until that delta is approved.

---

## Locked invariants

- **D-V36-SACRED-SHA** — `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (`liv/packages/core/src/sdk-agent-runner.ts`) preserved every commit (carry from v32–v35)
- **D-V36-MINI-PC-ONLY** — `livos/packages/ui/` only. Server5 + landing untouched (carry from v36-DRAFT; user-confirmed 2026-05-15)
- **D-V36-MINI-PC-OPERATOR-PRIORITY** — bruce's OwnCloud daily-driver never broken; every plan independently revertable with `git revert <sha> && bash /opt/livos/update.sh`
- **D-V36-ADDITIVE-ONLY** — New tokens / new components ship parallel to existing. ZERO renames of existing tokens, ZERO breaking changes to existing component APIs until the legacy consumer is migrated.
- **D-V36-MICRO-COMMITS** — Every visible change ships as the smallest atomic commit. Screenshot + user approval BEFORE stacking the next change. Multiple visual changes in one commit = rejected per `feedback_v36_no_bold_redesigns.md`.
- **D-V36-VISIBLE-DELTA** — Every phase (except 122 which is plumbing) MUST produce a screenshot-able difference. NOOP token additions ship without a delta and that's fine — they unlock Phases 123+.
- **D-V36-NO-FUNCTIONAL-CHANGES** — Visual layer only. `onClick/onSubmit/onKeyDown/onChange` byte-identical pre/post each phase (carry from v35).

---

## Design system summary

**Felsefe** (§00 Foundation): Apple-restrained, editorial, **monochrome by default**. "One accent. One voice. Real whitespace. No gradients, no glow, no emoji."

**Renk** (§01 Colors): `--fg #1d1d1f` + 3 nötr fg tonu (`--fg-dim #424245`, `--fg-mute #6e6e73`, `--fg-faint #a1a1a6`) + 4 yüzey (`--bg #ffffff`, `--bg-2 #f5f5f7`, `--surface #fafafa`, `--surface-2 #ebebed`) + hairlines (`--line rgb(0 0 0 / .08)`, `--line-strong rgb(0 0 0 / .14)`). Accent = pure black (`--accent #1d1d1f`). Mavi (`--blue #0a84ff`) **only sparingly** (focus rings, links).

**Tipografi** (§02 Type): SF Pro Display / Geist (system stack) + Instrument Serif italic for editorial accents ("warmth"). Geist Mono for code/labels. 9-step scale: display-xl 96 / h-1 72 / h-2 32 / h-3 24 / h-4 16 / body-l 19 / body-m 15 / body-s 13 / lbl-mono 11.

**Radii** (§03 Rhythm): xs 6 / sm 8 / DEFAULT 12 / md 14 / lg 18 / xl 22 / 2xl 28 / full 999.

**Gölge:** `--shadow-card` (already byte-identical to existing `--card-shadow`) / `--shadow-window` (NEW — for OS window chrome) / `--shadow-pop` (NEW — for popovers).

**Ease:** Single curve `cubic-bezier(.2, .7, .2, 1)` for everything; `cubic-bezier(.4, 0, .2, 1)` for in-out only.

**Dark mode** (§19): Literal inversion (`--bg → #0a0a0c`, `--fg → #f5f5f7`) + a glow allowance. **Deferred to v37** (D-116-FOLLOW-UP-DARK still open).

---

## The 8 port steps (each a phase)

> **Order is STRICTLY SEQUENTIAL.** Phase N starts only after Phase N-1 ships AND user UAT-approves the visible delta. No parallel work.

### Phase 122 — Design Tokens (Additive) [Step 1 of 8]
- **Source:** §01 Colors + §03 Rhythm + §20 Port guide tailwind.config snippet
- **Files:** `livos/packages/design-tokens/{tokens.css, tailwind.preset.cjs, DESIGN-SYSTEM.md}` (3 files)
- **Visible delta:** **NONE expected** (utilities added, no consumer changes). Smoke test = build green + Storybook unchanged + browser screenshot byte-equal.
- **Acceptance:** New utilities resolve (`bg-fg`, `text-fg-mute`, `border-line`, `rounded-r-lg`, `shadow-window-soft`). Existing `accent-blue` / `dash-line` / `dash-radius` byte-unchanged.
- **Estimated commits:** 3-4
- **Detailed plan:** `.planning/phases/122-design-tokens-additive-port/122-PLAN.md`

### Phase 123 — Button Shadcn Override [Step 2 of 8]
- **Source:** §04 Buttons (lines 583-619 of design-system.html)
- **Files:** `livos/packages/ui/src/shadcn-components/ui/button.tsx` + shadcn-lib variant map
- **Visible delta:** All Buttons sitewide adopt new shape — pill radius (`rounded-r-full`), `fg/bg` invert for primary (black bg, white text), hairline for ghost (`border border-line-strong`), `rgba(220,38,38,0.3)` border for danger.
- **Acceptance:** AT LEAST one screenshot per common pattern (primary action, ghost, danger, icon-only) matches design-system.html demo within 2px tolerance. Old shadcn variant names preserved (backward-compatible).
- **Estimated commits:** 4-5 (one variant per commit so each is independently revertable)
- **Plan:** TBD (write when Phase 122 ships)

### Phase 124 — Section-Head Pattern as `<SettingsPageHeader/>` [Step 3 of 8]
- **Source:** §17 Section heads (lines 1022-1044 of design-system.html)
- **Files:** NEW `livos/packages/ui/src/components/settings-page-header.tsx` + ONE settings page integration as proof
- **Visible delta:** ONE settings page top transforms: `eyebrow (mono uppercase 11px) → italic-serif h2 → 14px body sub`. No other pages change.
- **Acceptance:** Component exported. Used on Settings Home only. Screenshot shows new typography on that page only; other settings panels unchanged.
- **Estimated commits:** 2-3
- **Plan:** TBD

### Phase 125 — Field-Card + List-Row [Step 4 of 8]
- **Source:** §05 Inputs & fields + §06 Avatars & brand (lines 621-697)
- **Files:** `livos/packages/ui/src/routes/settings/_components/settings-content.tsx`
- **Visible delta:** One Settings panel migrates to field-card with `180px / 1fr / auto` grid rows. Avatar uses gradient peach→pink (the only color permitted).
- **Acceptance:** One panel migrated, others untouched.
- **Estimated commits:** 3-4
- **Plan:** TBD

### Phase 126 — Plan Card (3 + Featured) [Step 5 of 8]
- **Source:** §08 Plan cards (lines 741-792)
- **Files:** `livos/packages/ui/src/routes/settings/usage-dashboard.tsx`
- **Visible delta:** Tier section shows 3 plan cards (Starter / **Pro** featured beige wash / Max) per the mockup. Featured card has subtle `bg: #f5e8d8` wash and Recommended pill.
- **Acceptance:** Tier matches §08 demo within 2px tolerance.
- **Estimated commits:** 2-3
- **Plan:** TBD

### Phase 127 — Stat Tile + Hairline Progress [Step 6 of 8]
- **Source:** §11 Stats & progress (lines 851-883)
- **Files:** `livos/packages/ui/src/routes/settings/_components/{cpu-card-content.tsx, memory-card-content.tsx, storage-card-content.tsx}`
- **Visible delta:** CPU/Memory/Storage cards adopt `4px hairline` progress (was gradient bars). Unit text becomes mono `em` (e.g., `42 <em>%</em>`).
- **Acceptance:** All 3 stat tiles match §11 demo. Old gradient bars retired in same phase.
- **Estimated commits:** 3-4
- **Plan:** TBD

### Phase 128 — App Tile (Monogram) [Step 7 of 8]
- **Source:** §09 App tiles (lines 794-816)
- **Files:** `livos/packages/ui/src/modules/app-store/*` (one row component only); dock untouched in this phase
- **Visible delta:** App Store tiles get a `34×34 monogram` variant (initials in a `bg-bg-2` square) for apps without provided icons. Existing icon-bearing apps unchanged.
- **Acceptance:** One App Store row uses new monogram tile; dock untouched.
- **Estimated commits:** 2-3
- **Plan:** TBD

### Phase 129 — Chat Bubble [Step 8 of 8]
- **Source:** §13 Chat bubbles (lines 915-936)
- **Files:** `livos/packages/ui/src/routes/ai-chat/*`
- **Visible delta:** User bubble = `fg` solid (black bg, white text). Liv bubble = `surface` with `border-line-strong` hairline. Asymmetric (user right-aligned, Liv left).
- **Acceptance:** Two-role asymmetric bubble in AI Chat matching §13 demo. Existing emoji/colored ornaments removed per "no emoji" rule.
- **Estimated commits:** 2-3
- **Plan:** TBD

---

## Out of scope for v36 (defer to v37 or later)

- **Replacing `--accent-blue` site-wide** → consumers stay on accent-blue where present; v37 cleanup pass migrates them to `--fg` where the design system demands monochrome.
- **Dark mode token transcription** → D-116-FOLLOW-UP-DARK still PENDING; Server5 SSH dependency.
- **Iridescent theme** → D-116-FOLLOW-UP-IRIDESCENT still PENDING.
- **OS Window Chrome (§14)** + **Terminal (§15)** + **Greeting card (§16)** + **Motion language (§18)** → captured as v37 candidates, NOT this milestone.

---

## Total milestone estimate

22–30 atomic commits across 8 phases. Each phase 30–60 min including HMR + screenshot + user UAT round-trip.

**Deploy path (after each phase ships):**
```bash
git push origin master
ssh bruce@10.69.31.68
sudo bash /opt/livos/update.sh
# Open https://bruce.livinity.io — verify in light theme first, then dark when D-116-FOLLOW-UP lands
```

**Local dev (resume after /clear):**
```bash
cd C:\Users\hello\Desktop\Projects\contabo\livinity-io\livos
VITE_BACKEND_URL=https://test.livinity.live pnpm --filter ui dev
# http://localhost:3000
```

---

## Resume command (after /clear)

> "v36 design port — phase 122'den devam et" → Claude reads this master + `.planning/phases/122-design-tokens-additive-port/122-PLAN.md` and proceeds.

Sacred SHA still preserved (verify with `git hash-object liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f`).
