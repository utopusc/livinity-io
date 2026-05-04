# Phase 66: Liv Design System v1 - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Mode:** Autonomous (`--auto`) — decisions locked from `.planning/v31-DRAFT.md` §P66 spec + scout findings

<domain>
## Phase Boundary

Establish v31's visual identity foundation that every subsequent UI phase (P68-P70, P75) consumes:

1. **Color tokens** — `livos/packages/ui/src/styles/liv-tokens.css` with the exact palette from v31-DRAFT lines 198-224 (deep navy + cyan + amber + violet + emerald + rose + motion durations + bespoke easing).
2. **Motion primitives** — five named exports (`FadeIn`, `GlowPulse`, `SlideInPanel`, `TypewriterCaret`, `StaggerList`) under `livos/packages/ui/src/components/motion/` — most are thin wrappers over the existing `motion-primitives/` library (glow-effect, animated-group, transition-panel, in-view, text-effect).
3. **Typography** — Inter Variable (400/600) + JetBrains Mono via Google Fonts CDN (consistent with current `index.css` Space Grotesk pattern); a typography scale (`text-display-1`/`text-display-2`/`text-h1`/`text-body`/`text-caption`/`text-mono-sm`).
4. **Glass + grain + glow** classes — `.liv-glass`, `.liv-grain`, `.liv-glow-amber` per v31-DRAFT 240-243.
5. **shadcn liv-* variants** — `Button` `liv-primary`, `Card` `liv-elevated`, `Badge` `liv-status-running`, `Slider` `liv-slider` extending the existing `shadcn-components/ui/`.
6. **Icon mapping** — `livos/packages/ui/src/icons/liv-icons.ts` mapping every tool-category to a `@tabler/icons-react` icon (replaces ad-hoc imports; sets up the inventory P69 will consume).
7. **Playground demo** — single route `/playground/liv-design-system` (NOT Storybook) that renders every token, motion, variant, and icon mapping side-by-side for visual A/B against current `ai-chat/index.tsx`.

**Out of scope:** Anything that consumes these tokens (chat UI, side panel, tool views, composer) — those are P68-P70. The rename Nexus → Liv (P65) is also separate; this phase uses `livos/packages/ui/...` paths which are already `livos/`-namespaced and don't require P65.

</domain>

<decisions>
## Implementation Decisions

### Color tokens (D-01..D-05)
- **D-01:** Use the EXACT values from v31-DRAFT.md lines 198-224 — no bikeshedding palettes. Surface system (`--liv-bg-deep` `#050b14`, `--liv-bg-elevated` `#0a1525`, `--liv-bg-glass` `rgba(20,30,50,0.6)`, `--liv-border-subtle` `rgba(120,180,255,0.08)`); text trio; accent quintet (cyan `#4dd0e1`, amber `#ffbd38`, violet `#a78bfa`, emerald `#4ade80`, rose `#fb7185`); duration scale (instant 100ms, fast 200ms, normal 350ms, slow 600ms); easing pair (`--liv-ease-out` cubic-bezier(0.16, 1, 0.3, 1), `--liv-ease-spring` cubic-bezier(0.34, 1.56, 0.64, 1)).
- **D-02:** File location `livos/packages/ui/src/styles/liv-tokens.css` — the `styles/` subdirectory does NOT exist yet, create it. Single file, no chunked sub-files.
- **D-03:** Tokens applied via `:root` (light/dark unified — Liv is dark-only at v31 entry). NO light theme variant in this phase.
- **D-04:** Imported once at the top of `livos/packages/ui/src/index.css` immediately after `@tailwind base` and before `@tailwind utilities`. Existing Space Grotesk Google Fonts import stays; Inter Variable + JetBrains Mono imports are added.
- **D-05:** Tailwind config does NOT need to learn these tokens individually — they're CSS variables consumed via `var(--liv-*)` in component classNames or new utility classes (e.g. `.liv-glass`). Keeps Tailwind config small.

### Motion primitives (D-06..D-09)
- **D-06:** Five named exports under `livos/packages/ui/src/components/motion/`:
  - `<FadeIn delay y>` — thin wrapper over existing `motion-primitives/in-view.tsx` (or composes AnimatedGroup) — entrance for cards.
  - `<GlowPulse color>` — wraps the existing `motion-primitives/glow-effect.tsx`, parametrized for amber/cyan/violet, used for reasoning + agent-thinking.
  - `<SlideInPanel from>` — composes existing `motion-primitives/transition-panel.tsx` with directional preset.
  - `<TypewriterCaret>` — NEW component (no existing equivalent). ~30-50 LOC: blinking caret pinned to last text node, anchored via `useRef` + position observation. Reference: Hermes StreamingCaret per v31-DRAFT line 231.
  - `<StaggerList>` — wraps existing `motion-primitives/animated-group.tsx` with 50ms-staggered preset.
- **D-07:** All five accept `framer-motion` standard props (`initial`/`animate`/`exit` overrides) so consumers in P68-P70 can compose freely.
- **D-08:** Index re-export at `livos/packages/ui/src/components/motion/index.ts` so consumers can `import { FadeIn, GlowPulse } from '@livos/ui/components/motion'`.
- **D-09:** **Do NOT touch the existing `motion-primitives/` library.** It's third-party-style code with its own conventions. Wrap, don't rewrite.

### Typography (D-10..D-12)
- **D-10:** Fonts loaded via Google Fonts CDN URL (consistent with current Space Grotesk pattern in `index.css`). Self-host is deferred to a future BACKLOG item — the user runs LivOS locally so latency is fine. CDN entries:
  - `https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300..700&display=swap`
  - `https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap`
- **D-11:** Type scale defined as Tailwind extension (in `tailwind.config.js`/`.ts`) so `text-display-1`, `text-h1`, etc. are first-class utilities consumable by all subsequent UI phases. Sizes per v31-DRAFT line 238 (48/36/24/15/12/13).
- **D-12:** Inter Variable replaces shadcn default sans-serif. Space Grotesk stays imported (used by existing UI elsewhere); do NOT remove it in this phase. P65 rename + later cleanup phases can consolidate fonts.

### Glass + grain + glow utilities (D-13)
- **D-13:** Three utility classes added to `liv-tokens.css` (NOT to Tailwind config — they're cosmetic one-offs, not utility-pattern friendly):
  - `.liv-glass` — `backdrop-filter: blur(12px) saturate(1.2)` + `background: var(--liv-bg-glass)` + `border: 1px solid var(--liv-border-subtle)`
  - `.liv-grain` — `repeating-conic-gradient(...)` overlay at low opacity (Hermes pattern; if ad-hoc, lock the pattern as `repeating-conic-gradient(from 0deg, rgba(255,255,255,0.012) 0deg 0.5deg, transparent 0.5deg 1deg)` — refine in execute if visually wrong)
  - `.liv-glow-amber` — `box-shadow: 0 0 24px rgba(255,189,56,0.2), inset 0 1px 0 rgba(255,189,56,0.1)`. Mirror as `.liv-glow-cyan`/`.liv-glow-violet` with same shape but different rgba.

### shadcn liv-* variants (D-14..D-16)
- **D-14:** Extend existing `shadcn-components/ui/{button,card,badge,slider}.tsx` files via the standard cva variants pattern — do NOT fork into new files. Each variant references `--liv-*` tokens and uses motion via `framer-motion` only when interaction warrants (e.g. button hover).
- **D-15:** Variant naming exactly matches v31-DRAFT 250-253: `liv-primary` (cyan accent + glow on hover), `liv-elevated` (glass + border-subtle), `liv-status-running` (pulsing dot + cyan), `liv-slider` (cyan track). NO additional liv-* variants in this phase — keep tight.
- **D-16:** Storybook is **NOT added** in this phase. Verification happens via the playground route below (D-19).

### Icon mapping (D-17..D-18)
- **D-17:** Single file `livos/packages/ui/src/icons/liv-icons.ts` exports a typed map: `LivIcons = { browser: IconWorld, terminal: IconTerminal2, ... }`. Categories cover all tool types P69 will need (browser, terminal, file, web-search, web-crawl, web-scrape, mcp, generic). Specific Suna→Tabler mappings per v31-DRAFT line 247.
- **D-18:** Existing ad-hoc icon imports in chat/agent files are NOT migrated in this phase (that's P68-P69 territory). The map exists; consumers adopt incrementally.

### Playground (D-19..D-21)
- **D-19:** New route `/playground/liv-design-system` registered in `livos/packages/ui/src/router.tsx`. Component at `livos/packages/ui/src/routes/playground/liv-design-system.tsx`.
- **D-20:** Layout: single scrolling page with sections (`Color tokens`, `Typography scale`, `Motion primitives` (animated demos that run on mount + replay button), `Glass/grain/glow utilities`, `shadcn liv-* variants` (each rendered inline), `Icon map`). NO interactive controls beyond replay buttons; this is a visual reference, not an editor.
- **D-21:** Access: gated behind logged-in user (existing auth middleware) but NOT admin-only — any user can view it. Hidden from main navigation; only accessible via direct URL.

### Verification approach (D-22)
- **D-22:** Side-by-side screenshot comparison vs current `ai-chat/index.tsx` is documented in SUMMARY.md as a `needs-human-walk` item — Claude can take playground screenshots via Chrome DevTools MCP (already available per memory `MEMORY.md` Common Pitfalls section), but the "WOW differential" judgment is human. NEVER fake this verification (UAT discipline per `feedback_milestone_uat_gate.md`).

### Claude's Discretion
- Exact pixel-level adjustments if v31-DRAFT values produce visually-bad results (e.g. if `--liv-bg-glass` opacity reads too dim against the deep background — lock the spec value first, refine only if user reports).
- Tabler icon picks for tool categories not explicitly named in v31-DRAFT (use sensible defaults; document the picks).
- Whether to add a small `<LivThemeProvider>` wrapper for token application (probably unnecessary — CSS variables on `:root` apply globally).

</decisions>

<specifics>
## Specific Ideas

- **Hermes-inspired**, not Hermes-copy. v31-DRAFT explicitly says "Hermes-inspired but Liv-branded" (line 194). The grain pattern + glow shape comes from Hermes (Mortar.io); the colors are bespoke to Liv (cyan-amber-violet trio).
- **WOW reaction is the success metric.** Per v31-DRAFT line 188-189, every subsequent UI phase consumes these tokens — building tool views, side panel, composer on shadcn-default looks generic. This phase exists to invest once so every later phase looks distinct.
- **No light theme.** v31 entry is dark-only. Light theme is a P75+ idea if it surfaces.
- The user already validated the v31-DRAFT 851-line file-level breakdown today (2026-05-04 per STATE.md). The detailed P66 spec on lines 184-262 IS the design contract. This CONTEXT.md just locks workflow + delegations.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and detailed spec
- `.planning/v31-DRAFT.md` lines 184-262 — full P66 deliverable spec (color tokens, motion primitives, typography, glass/grain, icons, shadcn variants, verification, estimate)
- `.planning/ROADMAP.md` lines 109-121 — Phase 66 goal + 4 success criteria
- `.planning/STATE.md` lines 36-64 — milestone summary, locked decisions

### Existing code to reuse (NOT rebuild)
- `livos/packages/ui/src/components/motion-primitives/` — already-built motion library: glow-effect, animated-group, transition-panel, in-view, text-effect, text-shimmer, glow-effect — wrap these for `FadeIn`/`GlowPulse`/`SlideInPanel`/`StaggerList`
- `livos/packages/ui/src/shadcn-components/ui/{button,card,badge,slider}.tsx` — extend these via cva variants; do NOT fork
- `livos/packages/ui/src/index.css` — root style entry, current Space Grotesk import lives here
- `livos/packages/ui/package.json` — has `@tabler/icons-react ^3.36.1`, `lucide-react 0.288.0`, `framer-motion`-equivalent already wired

### v31 UI scope guard
- `.planning/STATE.md` line 58 — "ONLY Suna UI patterns (NO Hermes UI per user direction 2026-05-04)" — Hermes-style is allowed for grain/glow primitives (visual texture), but the patterns (panels, tool views, composer behavior) are Suna in subsequent phases.

### Hard constraints (carry from v30.0)
- `.planning/STATE.md` lines 65-71 — D-NO-BYOK, BROKER_FORCE_ROOT_HOME, D-NO-SERVER4, side panel auto-open behavior

### UI/visual context
- Memory: `MEMORY.md` §"Common Pitfalls" — pnpm filter pattern for build, CSS Tailwind 3.4

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets
- `motion-primitives/` (32 components) — lock D-09: wrap, don't rewrite. `FadeIn` ≈ wrapper of `in-view.tsx`. `GlowPulse` ≈ wrapper of `glow-effect.tsx`. `StaggerList` ≈ wrapper of `animated-group.tsx`. `SlideInPanel` ≈ wrapper of `transition-panel.tsx`. Only `TypewriterCaret` is genuinely new.
- `shadcn-components/ui/` — has button, card, badge, slider. Extend via cva variants — no new files.
- `@tabler/icons-react ^3.36.1` — already wired. The `liv-icons.ts` map is just a typed export of pre-existing icons.
- `lucide-react 0.288.0` — present but stale. Tabler is primary. Migrate Suna's Lucide refs in P68-P69 (not this phase).

### Established patterns
- Google Fonts via CDN — `livos/packages/ui/src/index.css` line 1 already does `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk...')`. Inter + JetBrains Mono follow same shape.
- Tailwind 3.4 + shadcn — established stack. cva variants pattern.
- Path alias: `@livos/ui` likely; verify in tsconfig.

### Integration points
- `livos/packages/ui/src/index.css` — `@import 'liv-tokens.css'` here.
- `livos/packages/ui/src/router.tsx` — register `/playground/liv-design-system` route.
- `livos/packages/ui/src/components/motion/index.ts` — barrel export for the 5 new motion primitives.
- `livos/packages/ui/src/icons/liv-icons.ts` — barrel export for tool→icon map.

### Build verification
- `pnpm --filter @livos/config build && pnpm --filter ui build` — UI build sequence per `MEMORY.md`. Tokens + variants must compile clean.

</code_context>

<deferred>
## Deferred Ideas

- **Storybook** — explicitly NOT in this phase. Backlog item if it becomes valuable later.
- **Light theme variant** — v31 is dark-only. Backlog.
- **Self-hosted fonts** — fonts via CDN now. If offline-first matters later, swap to vendored woff2 files. Backlog.
- **Migrating ad-hoc icon imports** — P68-P69. The `liv-icons.ts` map exists; consumers adopt incrementally.
- **Liv brand consolidation across `livos/`+`nexus/` paths** — that's P65 (rename). This phase only adds `liv-` prefixed CSS/components within existing namespaces.
- **`liv-status-thinking`/`liv-status-error`/etc. additional Badge variants** — only `liv-status-running` lands now. Add others when consumers ask.
- **Dark/light auto-switching from system preference** — out of scope until light theme exists.

</deferred>

---

*Phase: 66-liv-design-system-v1*
*Context gathered: 2026-05-04*
