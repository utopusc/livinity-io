# Phase 130 — Dark-Mode Polish + Top Bar + AI Chat Modernization

> Status: PLANNED (drafted 2026-05-15, awaits user `/clear` then execute)
> Predecessor: v36 milestone (Phases 122-129, CODE-COMPLETE) + commits
> 7defd0bf (dock/window dark chrome) + efff9031 (legacy token theme-aware) +
> fb0188f4 (body inline-color fix).
>
> Sacred SHA invariant: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on
> `liv/packages/core/src/sdk-agent-runner.ts`. Verify before/after every
> commit.

## Why this phase exists

After commit `fb0188f4` text inheritance flips correctly in dark mode, but
the user surfaced a long punch-list of remaining issues plus three new
asks (top bar, profile relocation, AI-Chat modernization). All items are
visible regressions / gaps the user reported in one go — bundling them
keeps the dark-mode story coherent.

The single design reference for everything below is
[`design-system-reference.html`](design-system-reference.html) in this
phase directory (transcribed from `Downloads/design-system.html` shipped
by the user). The previously-loaded Livinity logo page
(`Downloads/logo.html`) already drove the donut mark + favicon work in
commit `e00c6cdb` and is treated as locked. The avatar / topbar
descriptions in this plan are paraphrased from the same reference.

## Scope — every reported issue, in user order

### A. ThemeModeSelector ("Light / Dark / System") — invisible in dark mode

User: "Light Dark System darkdayken buranin icini gormiyorum"

**Where**: `routes/settings/_components/settings-content.tsx` →
`ThemeModeSelector` (~lines 770–800).

**Diagnosis**:
- The wrapper uses `bg-[color:var(--bg)]` which now flips to `#0a0a0c`.
- The non-active button text uses `text-fg-mute` (Tailwind preset, STATIC
  `#6e6e73`) — that's a mid-grey on near-black. Reads as a faint smudge.
- The active button uses `bg-zinc-900 dark:bg-white` hardcoded — works.

**Fix**:
- Non-active state: use a class that flips. Either `text-text-secondary`
  (now theme-aware via efff9031) or arbitrary `text-[color:var(--fg-mute)]`
  paired with a body.dark override that adjusts `--fg-mute` upward in dark
  mode. Prefer the former: switch to `text-text-secondary
  hover:text-text-primary`.
- Wrapper background: flip to `bg-[color:var(--bg-2)] dark:bg-white/[0.05]`
  so the toggle has a visible chip in dark mode. Border stays `border-line`.

### B. Account section card — white-on-white in dark mode

User: "Name Bruce Oz Change Password ●●●●●●●● Change Buranin da icini
goremiyorum. Box full beyaz icindeki yazi da beyaz"

**Where**: `routes/settings/_components/settings-content.tsx` →
`AccountSection` + `<FieldCard>` / `<FieldRow>`.

**Diagnosis**: `FieldCard` uses `bg-[color:var(--bg)]` (now dark in dark
mode = correct) AND `border-line` (theme-aware via preset). But the values
inside `FieldRow` use `text-fg-mute` for labels — that's a static mid-grey,
fine on dark. The big-name "Bruce Oz" text uses `text-fg` for the value —
that's STATIC `#1d1d1f` (dark). So it's dark text on a dark card → invisible.

**Fix**: Wire the v36 preset `fg` family to theme-aware tokens just for the
TEXT case, OR (safer) override `FieldRow` to use `text-[color:var(--fg)]`
arbitrary form. Pick the latter — surgical, no preset sweep.

Same fix shape applies to anywhere else `text-fg`/`text-fg-mute`/`text-fg-
faint` is used inside a dark-flipping container (login pill text already
uses arbitrary `text-[color:var(--bg)]` and is fine).

Audit list (grep `\\btext-fg\\b\\|text-fg-mute\\|text-fg-faint`,
limit to settings + login + window-content files):
- `components/field-card.tsx` (FieldRow label colour)
- `components/settings-page-header.tsx` (eyebrow / titleAccent / sub)
- `routes/login/index.tsx` (form labels, eyebrow)
- `routes/settings/_components/settings-content.tsx` (eyebrows, captions)
- Phase 122+ components: plan-card, stat-tile, app-tile, chat-bubble

For each: swap the v36 preset class for the arbitrary `text-[color:var(--*)]`
form. Same colour in light mode (the :root var equals the preset hex 1:1);
flips correctly in dark mode because `body.dark` already redefines `--fg`,
`--fg-mute`, `--fg-faint`.

Wait — `body.dark` in tokens.css (per commit `efff9031`) only defines the
LEGACY semantic vars, NOT `--fg` / `--fg-mute` / `--fg-faint`. To make the
arbitrary forms flip, we must ALSO add the v36 neutrals to `body.dark`.

### C. Liv Agent settings section — REMOVE

User: "07 · Liv Agent ... Bu kismi kaldir settings de bu kisim olmasin."

**Where**:
- `routes/settings/_components/settings-content.tsx` → MENU_ITEMS array
  (the `liv-agent` entry).
- `routes/settings/_components/settings-content.tsx` → SectionContent switch
  case `'liv-agent'`.
- The Liv Agent route page itself (`routes/settings/liv-agent.tsx`) stays
  in source — it's still reachable as a standalone dock window for users
  who want it via Liv-Agent app. Just dropped from the settings sidebar.

**Fix**: Delete the `liv-agent` row from MENU_ITEMS + drop the switch case
(or leave the case in as dead code per the convention used for the six
"merged into tabs" entries — see commit `1dab7029`). Prefer the latter for
consistency.

### D. Troubleshoot "Recent System Logs" preview — invisible

User: "Recent System Logs icerisinde gozukmuyor beyaz box beyaz yazi"

**Where**: `routes/settings/_components/settings-content.tsx` → `LogsPanel`
(extracted from old TroubleshootSection in commit `1dab7029`).

**Diagnosis**: The log viewer is `<pre className='whitespace-pre-wrap
font-mono text-caption-sm text-text-secondary'>` inside a `<div
className='max-h-[200px] overflow-auto rounded-radius-sm bg-neutral-100
p-3'>`. The `bg-neutral-100` is STATIC light grey (Tailwind built-in) — in
dark mode it's bright cream, and the text-text-secondary inside is now
LIGHT (`rgba(245,245,247,0.62)`) → light-on-light = invisible.

**Fix**: Replace `bg-neutral-100` with a theme-aware token (e.g.
`bg-surface-1`) or add an explicit `dark:bg-zinc-900` variant. Either keeps
the log surface dark in dark mode where the light text reads.

### E. Troubleshoot tabs leak — clicking Diagnostics also shows Updates + Advanced

User: "Diagnostics e tikladigimda Updates Advanced de gozukuyor"

**Where**: `TroubleshootSection` in settings-content.tsx (commit `1dab7029`
established four sub-tabs: Logs / Diagnostics / Updates / Advanced).

**Diagnosis**: The user's environment is likely rendering all four
TabsContent simultaneously OR my refactor accidentally lost the
`value=` discriminator on one of them. Needs a code-read to confirm.

**Fix**: Audit the `<Tabs>` JSX — each `<TabsContent value="X">` must have
the correct discriminator + only render under its own value. While at it,
the user explicitly asked: "Updates ve Advanced kismini ayir lutfen bu
sayfadan."

Two interpretations:
1. PROMOTE Updates + Advanced back to top-level sidebar entries (undo part
   of the consolidation in commit `1dab7029`).
2. KEEP them as Troubleshoot sub-tabs but FIX the leak so they only show
   when their tab is active.

Treat the user's word "ayir" (separate) as interpretation 1 — they want
them out of Troubleshoot entirely. Restore the original `software-update`
and `advanced` MENU_ITEMS rows. TroubleshootSection collapses back to 2
tabs (Logs / Diagnostics).

### F. Past Deploys table — overflows infinitely

User: "Past Deploys SHA When Status Duration ... bu kisim sonsuza kadar
assagiya gidiyor burayi bir box icine al"

**Where**: `routes/settings/_components/settings-content.tsx` →
`SoftwareUpdateSection` (renders `<PastDeploysTable />`).

**Fix**: Wrap `<PastDeploysTable />` in a `max-h-[400px] overflow-y-auto`
container, or push it through a v36 FieldCard with internal scroll. Add a
heading line. Stop the page from growing unboundedly.

### G. Home dashboard CPU / Memory / Storage tiles — white-on-white

User: "CPU 3% 6 threads Memory 2.8 GB 9.7 GB left Storage 32.9 GB 174 GB
left burasi beyaz box icinde beyaz yazilar"

**Where**: `routes/settings/_components/settings-content.tsx` →
`SettingsHomeDashboard` (uses `useCpuForUi` / `useMemoryForUi` /
`useDiskForUi`).

**Diagnosis**: The tiles are likely rendered with `<Card>` or inline
`bg-surface-1` (theme-aware → dark) but contain literal text with
`text-fg` (v36 preset → static dark). Same shape as issue B.

**Fix**: Apply the same arbitrary-form swap once `body.dark` defines
`--fg` / `--fg-mute` / `--fg-faint`. May also need the actual stat-value
text styled with `text-[color:var(--fg)]`.

### H. AI Chat — full rebuild

User: "AI Chat inanilmaz ama inanilmaz kotu Hem Eski UI yenilenmemis. Eski
UI UX bunlari toparla. design-system.html boyle bir sey yapmistik sen
eklemistin. Sol side bar bembeyaz sag dark kalmis input unda degismesi
gerekiyor."

**Where**: `routes/ai-chat/**` (find the route + components).

**Diagnosis**: The chat surface predates v36 — left rail uses light
`bg-white` / `text-text-primary` static, right composer pane uses a
later darker token. Half-and-half look.

**Fix**: Full pass:
1. Left rail / conversation list: dark-mode opt-in. `bg-card-bg` (already
   theme-aware) + `border-line`-style hairline + text-text-primary
   (theme-aware) for the list items.
2. Composer input: replace the legacy field with the v36 input pattern
   from `field-card.tsx` or the design-system reference's "input-pill"
   shape (rounded-full, bg-bg-2, fg text, line border, focus ring).
3. Message bubbles: use the v36 `ChatBubble` primitive shipped in Phase
   129 (`components/chat-bubble.tsx`). Migrate the legacy bubble renderer
   to it.
4. Padding / spacing / typography: align with design-system.html (sans
   stack, -0.01em letter-spacing, 1.5 line-height for body text).

Scope this as its own sub-plan (130-04) — chat is the largest surface in
this phase.

### I. Top Bar + Profile relocation

User: "Top Bar ekleyelim. Dock da olan profil varya onu cikaralim oradan.
Sol en ust kisma Profil i ekleyelim. Top bar icinde livinity.io da
landingpage de Navbar var oradan ilham al ama kculmus hali gibi dusun."

**Design source**: design-system-reference.html → search for `.brand-mark`
(donut, lines 227-228), `.avatar` (peach→pink gradient avatar, lines
223-226). The landing nav at `livinity.io/` is the visual inspiration —
compact horizontal bar across the top of the LivOS desktop with:

  [Avatar (sm, gradient, initial)] [Brand donut + "Livinity" wordmark]
  ····················· spacer ······························
  [search? notifications? — TBD]                    [theme toggle?]

**Sizing**: ~44–48px tall. Glass formula like the dock for visual rhyme
(`bg-card-bg/50 dark:bg-black/55 + backdrop-blur-3xl +
border-line/border-white/10`). Pinned `fixed top-0 inset-x-0 z-50`.

**Profile chip** (left): 30×30 gradient avatar (`linear-gradient(135deg,
#ff8a65, #f06292)`) with initial-on-gradient + `box-shadow: 0 12px 30px
-12px rgba(240,98,146,.5)`. Click → user menu (log out, switch user,
profile). The chip lives in a new `<TopBar />` component.

**Dock cleanup**: remove `<DockProfile />` from `modules/desktop/dock.tsx`
(line 97). The separator line right after it also goes.

**Spec details to lock in 130-02**:
- Should the top bar show the brand donut + wordmark on the left, or just
  the avatar? Design reference shows brand mark + wordmark adjacent on
  livinity.io. Recommend: left = avatar + small wordmark; right = future
  slots (notifications, theme toggle). Settle in plan 130-02.
- Z-index vs windows: top bar should sit ABOVE windows (z-50, dock is
  z-50) so when a window is dragged to the top edge it tucks under.
- Mobile behaviour: collapse / hide on `useIsMobile()` per existing
  pattern.

### J. Avatar component (new)

**Where**: new file `livos/packages/ui/src/components/avatar-gradient.tsx`.

Spec (transcribed from user message + design-system reference):

```css
/* The avatar is the only color you'll see.
 * Initial-on-gradient (peach → pink) with a soft 12px y-offset shadow
 * tinted from the gradient. */
.avatar {
  border-radius: 50%;
  background: linear-gradient(135deg, #ff8a65, #f06292);
  display: grid; place-items: center;
  color: white; font-weight: 500;
  box-shadow: 0 12px 30px -12px rgba(240,98,146,.5);
}
/* Sizes — never inline color, always the gradient */
.avatar.lg { width: 96px; height: 96px; font-size: 38px; }
.avatar.md { width: 64px; height: 64px; font-size: 24px; }
.avatar.sm { width: 30px; height: 30px; font-size: 12px; font-weight: 600; }
```

TSX shape:

```tsx
export type AvatarSize = 'sm' | 'md' | 'lg'

export function AvatarGradient({
  initials,
  size = 'sm',
  className,
}: {
  initials: string
  size?: AvatarSize
  className?: string
}) {
  // class-based sizing; gradient + shadow in a single inline style for
  // reliability under tailwind purge. Returns a div, not a button — wrap
  // in a button if you want it clickable.
}
```

`initials` is computed by the caller (e.g. `getInitials(user.name)` from
the existing `routes/login/index.tsx` helper — extract it to a shared
util).

## Sub-plans

This phase ships in five plans, in order. Each is its own atomic commit,
type-checked, sacred-SHA preserved.

### 130-01 — Dark-mode token completion

Make `body.dark` define `--fg`, `--fg-mute`, `--fg-faint`, `--bg`, `--bg-2`
in `tokens.css`. Tightens the foundation so every component that uses
the arbitrary `text-[color:var(--fg)]` form flips correctly. v36 preset
classes (`text-fg`, `bg-fg`) stay static per the user's previous
complaint about preset sweeps causing colour collisions.

Audit the v36-component usages and convert their `text-fg` / `text-fg-
mute` / `text-fg-faint` / `bg-fg` to the arbitrary form. Targets (from
issue B above):
- `components/field-card.tsx`
- `components/settings-page-header.tsx`
- `components/plan-card.tsx`
- `components/stat-tile.tsx`
- `components/app-tile.tsx`
- `components/chat-bubble.tsx`
- `routes/login/index.tsx` (eyebrow + form labels + button — button
  already uses arbitrary form, others may not)
- `routes/settings/_components/settings-content.tsx` (eyebrows in
  ThemeModeSelector, WallpaperGroup, etc.)

Verify: snapshot every settings page in both themes; nothing should be
text-on-its-own-colour.

### 130-02 — Top Bar + Profile relocation

Build `modules/desktop/top-bar.tsx`. Pin it to the top of the desktop in
`router.tsx`'s `/` element (next to where `<Wallpaper />` and `<Dock />`
already mount). Drop `<DockProfile />` from `dock.tsx` + remove the
separator line that followed it.

Avatar gradient component (issue J) ships in this plan as a prereq.

Top-bar contents (final spec — adjust during execution if obvious tweaks
emerge):
- Left: AvatarGradient(sm, user initials) + 8px gap + LivinityMark(sm)
  + "Livinity" wordmark (sm). Click on avatar → user menu (Switch user,
  Settings → Account, Log out).
- Right: TopBar slot for future widgets (notifications, search) — empty
  for v36, structured so plans 130-03/04 can plug in.
- Glass shell matching dock + windows (`bg-card-bg/50 dark:bg-black/55
  + backdrop-blur-3xl + border-px border-white/60 dark:border-white/10`).
- Height 48px, full-width, `fixed top-0 inset-x-0 z-50`.

Verify: log in fresh → top bar visible with user initial in gradient
avatar + brand donut + "Livinity" wordmark. Dock no longer has profile
icon. Both themes look intentional.

### 130-03 — Settings polish

Hits issues C / D / E / F / G in one commit.

1. Drop `liv-agent` from MENU_ITEMS (issue C). Leave the switch case for
   programmatic compat (dead code, fine).
2. LogsPanel: replace `bg-neutral-100` with `bg-surface-1` (issue D).
3. TroubleshootSection: collapse to 2 tabs (Logs / Diagnostics). Restore
   `software-update` and `advanced` MENU_ITEMS rows + their switch cases
   (issue E).
4. PastDeploys: wrap in `max-h-[400px] overflow-y-auto` + heading line
   (issue F).
5. CPU / Memory / Storage tiles: convert internal text to arbitrary form
   `text-[color:var(--fg)]` etc. so they flip with body.dark vars from
   130-01 (issue G).

Verify: Settings home dashboard readable in both themes. Troubleshoot
shows exactly two sub-tabs. Past Deploys scrolls inside its own box.

### 130-04 — AI Chat modernization

Issue H. Largest plan in the phase, may want to be split if scope balloons.

Steps:
1. Read `routes/ai-chat/**` to map current structure.
2. Left rail: card-bg surface, line border, list rows with text-text-
   primary. Hover state `hover:bg-surface-1`.
3. Composer: rebuild as a `rounded-full bg-[color:var(--bg-2)] border
   border-line focus-within:border-line-strong` pill matching design-
   system reference's input-pill pattern (find via grep `.greet-prompt`
   in design-system-reference.html).
4. Bubble migration: swap legacy bubbles to `<ChatBubble />` from Phase
   129 (`components/chat-bubble.tsx`).
5. Spacing pass: 24px page padding, 1.5 line-height body.

Verify: AI Chat opens in both themes. Composer focuses cleanly. Bubbles
match v36 chat-bubble visuals. Left rail matches design-system reference
section list patterns.

### 130-05 — ThemeModeSelector fix (issue A)

Already small — bundle with 130-01 actually. Move there.

(Net: phase ships in **four** plans: 130-01, 130-02, 130-03, 130-04.)

## Order of execution

1. **130-01 first** — completes the dark-mode foundation. Every other plan
   depends on the v36 neutrals flipping in `body.dark`.
2. **130-03** — quick wins, mostly text/wrapper fixes once 130-01 is in.
3. **130-02** — top bar build. Requires AvatarGradient.
4. **130-04** — AI Chat redesign. Largest scope, lands last so the other
   surfaces are settled.

## Verification protocol (each plan)

1. Before edit: `git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts`
   prints `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.
2. Type-check after edits: `npx tsc --noEmit -p .` in
   `livos/packages/ui/` — no NEW errors vs the baseline (the pre-existing
   ones in `livinityd/*` and `stories/*` are allowed).
3. Sacred SHA after commit: same check.
4. Visual: open the affected surface in BOTH themes; screenshot for the
   user to confirm; iterate.
5. Commit message follows the conventional format used in the v36
   milestone (`feat(v36/theme): …` or `feat(v36/settings): …` etc.) with a
   trailing `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

## Open questions

These should be resolved before plan 130-02 lands (top bar). Defer-then-
ask is acceptable for 130-04 (AI Chat) since the user described intent
qualitatively, not pixel-perfectly.

1. **Top-bar right side contents**: just an empty slot for now, or include
   search field + theme toggle immediately? The user only mentioned the
   profile relocation — recommendation: empty slot in 130-02, fill in a
   follow-up.
2. **Top-bar height**: 44 or 48? Recommendation: 48 (matches the dock's
   visual weight, leaves room for the avatar at 30px + 9px padding each
   side).
3. **AI Chat scope**: full redesign of every panel, or just left rail +
   composer + bubble migration? Recommendation: latter (smaller, ships
   sooner); a "polish pass 2" can follow.

## Resume command after `/clear`

> "v37 phase 130 başla — dark mode polish + top bar + AI chat. Plan
> .planning/phases/130-dark-mode-polish-topbar-ai-chat/130-PLAN.md altında.
> 130-01 ile başla."

Or simply:

> "phase 130 başla"

The new chat session reads STATE.md, then this PLAN.md, then proceeds
plan-by-plan.
