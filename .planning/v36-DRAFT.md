# v36 LivOS Visual Redesign — DRAFT (SUPERSEDED)

> ⚠️ **SUPERSEDED 2026-05-15** by `.planning/v36-DESIGN-PORT-MASTER.md`.
> The phase content below (segment dock, hover lift, accent-blue dot, etc.) was rejected by the user in Phase 122 v1 (commit `3e8734f8` reverted to `bd1adc27`). The replacement direction is an **additive port of the Livinity Design System** (claude.ai/design handoff bundle, 2026-05-15). See the master plan for the new 8-phase structure. This file is kept as historical context — DO NOT execute against it.

**Status:** DRAFT — written 2026-05-15 after v35.0 close.
**Source:** Interactive proposal during local dev session — user reviewed Mini PC UI at `http://localhost:3000` (Vite dev, backend `https://test.livinity.live`) and asked for concrete redesign suggestions across 10 areas.
**Goal:** Visible LivOS visual redesign — pencereler, dock, desktop, motion. NOT a token rename (v35.0 already did that with near-zero visible delta). This milestone aims for *user-visible* polish that makes Mini PC look like a modernized OS.

**Scope guard:** Mini PC livinityd UI ONLY (`livos/packages/ui/`). NO Server5 / landing changes. (v35.0 lesson: user explicitly said `livinity.io` shouldn't be touched.)

---

## Locked invariants (carry from v35)

- **D-V36-SACRED-SHA** — `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (sdk-agent-runner.ts) preserved every commit
- **D-V36-MINI-PC-ONLY** — Server5 + landing untouched. Cross-repo rsync to bruce.livinity.io via `bash /opt/livos/update.sh` for live deploy
- **D-V36-MINI-PC-OPERATOR-PRIORITY** — bruce's OwnCloud daily-driver never broken; each plan independently revertable
- **D-V36-VISIBLE-DELTA-FIRST** — Every plan MUST produce a screenshot-able difference. NOOP audits go to a tech-debt backlog, not this milestone.
- **D-V36-NO-FUNCTIONAL-CHANGES** — visual layer only; preserve onClick/onSubmit/onKeyDown/etc. byte-identical (carry from v35)

---

## Phase plan (1-saatlik chunklar, sıralı + revertable)

### Phase 122 — Dock Redesign (30dk, ⭐⭐⭐⭐⭐)
**File:** `livos/packages/ui/src/modules/desktop/dock.tsx`
- Tek uzun pill → 3 segment (pinned apps · running apps · system tray); aralara separator
- macOS-style magnify-on-hover: Framer `whileHover={{scale:1.15,y:-4}}`, sibling `scale:1.05`
- Glass + accent glow: `bg-card-bg/80 backdrop-blur-2xl border border-dash-line shadow-card`
- Active app indicator: aktif app altında 4px daire `bg-accent-blue`
- İçerideki ikonların etrafına 12px padding, max-height limit
**Visible delta:** Dock görüntüsü tamamen yeni, magnify hover hissi macOS

### Phase 123 — Window Chrome (30dk, ⭐⭐⭐⭐⭐)
**Files:** `livos/packages/ui/src/modules/window/window.tsx` + `window-chrome.tsx` + `windows-container.tsx`
- Multi-layer glass shadow: `shadow-lg` → `var(--card-shadow)` canonical (multi-layer)
- Accent border-glow on focused window: `outline:2px solid var(--accent-blue);outline-offset:-2px` OR `ring-1 ring-accent-blue/40`
- Larger border radius: `rounded-lg` (8px) → `rounded-[18px]` (--dash-radius)
- Glass blur title-bar: `bg-card-bg/95 backdrop-blur-xl`
- Smooth window spawn animation: Framer `scale: 0.95 → 1, opacity: 0 → 1, duration: 0.18s ease`
**Visible delta:** Pencereler "yüzüyor" gibi, focused olan ringli, açılırken pop-in

### Phase 124 — System Top Bar (45dk, ⭐⭐⭐⭐)
**File:** `livos/packages/ui/src/layouts/system-bar.tsx` (NEW)
- Mount: `desktop.tsx` içine `top-0 sticky`
- Content: 🍎 Logo · App menu · search trigger (sağda) · Clock · Theme toggle (3-segment) · User avatar
- Glass blur: `bg-card-bg/70 backdrop-blur-2xl border-b border-dash-line`
- Height: 28px
**Visible delta:** YENİ component, desktop'ın üstünde her zaman görünür — büyük "OS-feel" kazancı

### Phase 125 — Iridescent Theme Unstub (20dk, ⭐⭐⭐⭐)
**Files:** `livos/packages/design-tokens/tokens.css` patch as `v35.0-design-tokens-1.0.1`
- Server5 SSH `cat /opt/landing/livinity.io/dashboard.html`
- `body.iridescent { ... }` block'unu verbatim transcribe
- `theme.json` matching update
- Rebuild design-tokens + Mini PC UI
**Visible delta:** Theme toggle 3 mod cycle eder, iridescent = mor-tonlu yeni tema (gerçekten yeni görsel)

### Phase 126 — Apple Spotlight Redesign (30dk, ⭐⭐⭐)
**File:** `livos/packages/ui/src/components/apple-spotlight.tsx` + `cmdk.tsx`
- Modal arka planı: glass blur (`bg-black/30 backdrop-blur-md`)
- Search input larger: 24px font, Instrument Serif placeholder italic
- Result row hover: `accent-blue` gradient bg
- Cmdk kategori sectionlar: Apps · Files · Actions · AI (Geist Mono uppercase headers, letter-spacing 0.1em)
**Visible delta:** Cmd+Space açıldığında modern command palette

### Phase 127 — AI Chat Polish (40dk, ⭐⭐⭐)
**Files:** `livos/packages/ui/src/routes/ai-chat/{index,chat-input,chat-messages,streaming-message}.tsx`
- User bubble gradient (`from-accent-blue to-accent-blue/80`)
- Assistant bubble shadow + subtle border
- Composer textarea: focus ring 2px accent-blue + lift `translateY(-1px)`
- Send button: solid accent + glow on hover `shadow-[0_0_20px_var(--accent-blue)/30]`
- Streaming indicator: pulse dot accent-green
- Welcome screen: hero `Instrument Serif italic` heading
**Visible delta:** AI chat conversation hissi premium

### Phase 128 — Desktop Wallpaper + Icon Squircle (30dk, ⭐⭐⭐⭐)
**Files:** `livos/packages/ui/src/layouts/desktop.tsx` + `livos/packages/ui/src/components/app-icon.tsx`
- Wallpaper: static color → `bg-[var(--hero-grad)]` (light) + purple variant (iridescent)
- Icon squircle frame: bare SVG → `rounded-[24%]` + inset shadow + drop-shadow
- Icon label: sürekli görünen yerine hover'da fade-in tooltip
**Visible delta:** Desktop first-impression tamamen yenilenir

### Phase 129 — App Store Hero + Bento (45dk, ⭐⭐⭐)
**Files:** `livos/packages/ui/src/modules/app-store/{app-page/app-content,apps-grid-section,app-store-nav}.tsx`
- Featured app hero card: büyük gradient bg, Install button accent-blue solid
- App grid → bento layout: 12-col with `.b-card.span-{4,5,6}` mix
- Category pills (top filter): `.pill.accent-blue` aktif state
- App detail page: sticky install button, screenshots carousel
**Visible delta:** App Store apple-store benzeri modern grid

### Phase 130 — Settings Shell Polish (35dk, ⭐⭐⭐)
**File:** `livos/packages/ui/src/routes/settings/index.tsx` + each panel
- Sidebar section headers: Geist Mono uppercase, letter-spacing 0.1em
- Panel cards: `.b-card` bento style + `--dash-pad` (28px)
- Setting rows: large toggle switches accent-blue track
- Save button: sticky bottom-right accent solid + glow
**Visible delta:** Settings panel'i tamamen daha rafine

### Phase 131 — Motion Language (40dk, ⭐⭐⭐)
**Files:** Multiple
- `GlowPulse` primitive (new): pulsing glow ring for focus/loading
- Hover-lift everywhere: `transition: transform 0.18s ease; hover: translateY(-1px)`
- Window morph: Framer `layout` prop for maximize/minimize smooth size lerp
- Greeting overlay (login sonrası): 0.7s fade-in "Welcome back, bruce" Instrument Serif italic, sonra fade-out
**Visible delta:** Genel etkileşim hissi büyük adım yukarı

---

## v35 carry-over items (NOT blocking v36)

- **v35.0-design-tokens-1.0.1 patch** — body.dark + body.iridescent transcribe (Phase 125 yapar)
- **ui-kit v0.2.0** — 22 shadcn primitives audit (button shim adapter 108 callsites, input 57, dialog 57, badge 14, label 15 + 17 more) — v36'da DEĞIL, ayrı milestone
- **Caddy /dashboard route flip** — operator decision when to flip Caddy to Next.js dashboard
- **Phase 117 + 118 rollback** — DONE 2026-05-15 (Server5 + landing pre-v35 state'e geri yüklendi, kullanıcı talebi)

---

## Local dev setup (resume için)

```bash
cd C:\Users\hello\Desktop\Projects\contabo\livinity-io\livos
VITE_BACKEND_URL=https://test.livinity.live pnpm --filter ui dev
# Open http://localhost:3000
```

**Note:** `livos/packages/ui/vite.config.ts` has the noVNC fix:
- `optimizeDeps.esbuildOptions.target: 'es2022'`
- `optimizeDeps.exclude: ['@novnc/novnc']`

---

## Deploy path (after each phase ships)

```bash
git push origin master
ssh bruce@10.69.31.68
sudo bash /opt/livos/update.sh
# Open https://bruce.livinity.io — verify deploy
```

**Known issue from v35.0 deploy:** update.sh doesn't know about new packages (`design-tokens`, `ui-kit`). v36 should patch update.sh in Phase 122 or earlier to rsync these + add build steps.

---

## Acceptance criteria for v36 milestone

- [ ] AC#1: Dock visually distinct from pre-v36 (magnify hover works, glass blur applied)
- [ ] AC#2: Window chrome shows multi-layer shadow + accent ring on focus
- [ ] AC#3: System top bar exists and shows clock + theme toggle
- [ ] AC#4: Iridescent theme produces purple-tinted output (operator screenshot proof)
- [ ] AC#5: Apple Spotlight (Cmd+Space) opens with glass-blur modal
- [ ] AC#6: AI Chat user bubble has gradient + composer has focus ring
- [ ] AC#7: Desktop wallpaper is gradient (not flat color)
- [ ] AC#8: App icons are squircles (not bare SVG)
- [ ] AC#9: App Store has hero card + bento grid
- [ ] AC#10: Sacred SHA preserved across all v36 commits

---

## Resume command (after /clear)

```bash
/gsd-new-milestone   # opens v36, references this DRAFT
# OR
/gsd-plan-phase 122   # if v36 milestone block already in ROADMAP.md
```

Or just say "v36 phase 122 başla" — Claude reads `.planning/v36-DRAFT.md` and proceeds from there.
