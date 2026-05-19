# Resume prompt — paste after /clear

Copy the block below as the first message of a fresh Claude Code session.

---

```
v37 Phase 158 — UI Chrome + Dock Iteration. Localhost dev loop, no
livinityd / Vercel changes — pure UI polish in
`livos/packages/ui/src/`.

Read first:
- .planning/phases/158-ui-chrome-dock-iteration/CONTEXT.md
- livos/packages/ui/src/modules/window/window-chrome.tsx
- livos/packages/ui/src/modules/desktop/dock-item.tsx
- livos/packages/ui/src/modules/desktop/dock-glyphs.tsx

Operator setup (probably already running; restart if not):
  cd livos
  VITE_BACKEND_URL=https://bruce.livinity.io pnpm --filter ui dev
  → http://localhost:3000 (HMR active)

State at session start:
- Phase 157 install wiring SHIPPED.
- Phase 158 rounds 1-14 SHIPPED on master (commit 9cc0d398):
  - Dock: squircle tiles + hand-written claude-design glyphs +
    per-app hover halo + Liv kept white (not inverted).
  - Window chrome: [X] [WebApp action area] [drag bar] [Skills]
    layout. Skills + action bar moved INSIDE chrome. Width
    animation via explicit `animate={{width}}` (NO transform:scale)
    — 0.55s tween, M3 emphasized-decelerate easing.
  - Drag stays butter-smooth (no `layout` prop on outer chrome).
- Memory carry-forward: feedback_v36_monochrome_dock_rejected was
  RESOLVED in this round — the hybrid (monochrome tile + colored
  glyphs + hover halo) is the approved final state.

Hard guardrails carried from rounds 11-14:
1. No `transform: scale` for chrome width morphing.
2. No `layout` props on the chrome's outer container.
3. Liv (AI Chat) icon NOT inverted — operator explicit feedback.
4. Drag bar never collapses to a handle — explicit width.

What's open (queue, operator-prioritized):
- topbar.html mock — top date+avatar+switcher row not yet ported.
- profile.html, auth.html, onboarding.html, changelog.html,
  customize.html — claude-design mocks still in
  .planning/design-system/v37-store-claude-design/.
- Operator may point at something not on this list. Wait for them
  to say what feels wrong on localhost first.

Start by re-reading CONTEXT.md, then ASK the operator which mock
or surface they want to tackle next — DO NOT start porting anything
unprompted. Round-by-round iteration with HMR is the proven loop.

Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

---

## Quick refs after /clear

| Item | Where |
|---|---|
| Phase 158 context | `.planning/phases/158-ui-chrome-dock-iteration/CONTEXT.md` |
| Dock tile + glyphs | `livos/packages/ui/src/modules/desktop/dock-item.tsx`, `dock-glyphs.tsx` |
| Window chrome | `livos/packages/ui/src/modules/window/window-chrome.tsx` |
| WebApp action bar | `livos/packages/ui/src/modules/window/webapp-floating-action-bar.tsx` |
| Design mocks | `.planning/design-system/v37-store-claude-design/*.html` |
| Bruce api-key | `liv_k_rX_G7vqBrT8w_eovQdjf` |
| Last commit | `9cc0d398` feat(ui v37) |
| Sacred SHA | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |

## Pre-/clear master tip

```
9cc0d398 feat(ui v37): dock icons + window chrome redesign per claude-design
5186b97f fix(v37-P157 round 5): native-app desktop click opens stream window
7b44cf01 fix(v37-P157 round 4): React #310 + webapp catalog mapping + stopAllStreams
a5f27274 fix(v37-P157 round 3): webapp Open + MCP feedback + native timing race
3d88d17f fix(v37-P157): manifest in postMessage (CSP fix) + 'desktop' copy
```

## Operator note

Dev server (`pnpm --filter ui dev`) may already be running in the background
under the previous session. If not, restart it with the command above.
HMR-reloaded localhost is the iteration loop — no rebuild needed.
