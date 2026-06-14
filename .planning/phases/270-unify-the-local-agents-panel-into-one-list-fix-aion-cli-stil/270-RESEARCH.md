# Phase 270: Unify the Local Agents panel into one list + fix Aion CLI still showing — Research

**Researched:** 2026-06-14
**Domain:** Vanilla-DOM AionUi vendor-bundle patch (no React) + livinityd cli-installer overlay + Caddy routing
**Confidence:** HIGH (all claims verified against the live source tree in this session)

---

## Summary

The Phase 270 goal description contains one premise that the code **does not support**: it says "today the panel has TWO separate sections — a top 'Detected' strip … and a separate 'Available to Install' grid." After reading the entire patch (`scripts/aionui-patches/local-agents-install-section.js`, 634 lines) I can state with HIGH confidence that **the patch JS renders only ONE section** — the `#liv-240-install-section` "Available to Install" grid of all 20 `SUPPORTED_CLIS`. It builds **no "Detected" strip of its own**, and it **never fetches `/api/agents`** — its only network calls are tRPC `cliInstaller.*` (`detect`, `install`, `auth`, `hasPendingAgentChanges`, `applyAgentChanges`). Each row's installed/not-installed state comes from a **per-CLI `cliInstaller.detect`** call, not from any agent list. `[VERIFIED: read of local-agents-install-section.js lines 151–190, 278–322, 454–542]`

The "Detected" strip the operator sees is therefore **AionUi's OWN native Local Agents tab content** (the vendored arco-design SPA renders its agent cards; our patch *sibling-appends* the "Available to Install" section *below* that native content — see `findTabPanel()` + `panel.appendChild(section)` at lines 577–611). That native list is fed by AionUi's `/api/agents`, which — inside the `/liv` iframe — resolves to `/liv/api/agents`, and Caddy's `@liv_agents` exact-path carve-out routes it to livinityd's overlay route where `buildAgentsOverlay` **already strips `binary_name 'aion'` unconditionally** (Phase 269.1). `[VERIFIED: caddy.ts LIV_AGENTS_HANDLE line 456; server/index.ts GET /api/agents line 1443; agents-overlay.ts line 113]`

**This reframes the phase:** Part (A) is not "merge two sections in the patch JS" — it is "make the patch's single grid *be* the one unified list the operator wants, and suppress / absorb AionUi's native Detected strip so there is exactly one place." Part (B)'s root cause is almost certainly **stale service-worker / browser cache** (the overlay already hides `aion`), with a secondary suspect being AionUi's **built-in `aionrs` agent** (id `632f31d2`, hidden separately via `agents.hidden` client-settings, *not* via the overlay). The lowest-risk, in-our-control fix is to **make the patch own the entire list** (it already excludes `aion-cli` from interactive affordances and can simply not render it at all) and **hide AionUi's native strip via CSS/DOM** so there is no second source to drift.

**Primary recommendation:** Redesign the patch's single grid into the operator's unified list (it already is a unified list keyed by CLI with per-row Install vs Auth/Remove), **drop `aion-cli` from the rendered set entirely** (one-line change to the iterated list, byte-consistent with 269.1's `binary_name === 'aion'` predicate), and **hide AionUi's native Local Agents agent cards** so the patch grid is the only list. Do NOT route the panel through the overlay — the patch does not read an agent list at all, so there is nothing to re-route; the aion-hide must live in the patch JS (fix ii), and the duplicate native strip must be suppressed in the patch's DOM/CSS.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Render the unified CLI list (rows, Install/Auth/Remove buttons, icons) | Browser / AionUi iframe (patch JS) | — | The patch is vanilla DOM injected into the AionUi SPA; all rendering is client-side |
| Per-CLI installed/not-installed state | API / livinityd (`cliInstaller.detect`) | Browser (patch calls it) | `detect` runs `command -v <bin>` server-side; the panel only displays the result |
| Hide `aion-cli` from the panel list | Browser / patch JS | — | The panel builds its own list from `SUPPORTED_CLIS`; the hide must be a patch-side list edit |
| Hide `aion`/`aionrs` from the chat PICKER | API / livinityd overlay (`buildAgentsOverlay`) | CDN/Caddy (`@liv_agents` routing) | Already done in 269.1/269-03 — the picker reads `/liv/api/agents` which is overlay-routed |
| Suppress AionUi's NATIVE "Detected" strip | Browser / patch JS + CSS | Deploy-time (`agents.hidden` for built-in) | The native cards are AionUi-rendered DOM; only the patch (same DOM) can hide them client-side |
| Apply bar / restart batching | API / livinityd (`applyAgentChanges`) | Browser (patch's Apply button) | 269-01 server flag + debounced restart; patch only triggers + reflects it |

---

## Phase boundary

**In scope (CODE ONLY):**
- `scripts/aionui-patches/local-agents-install-section.js` — the redesign target (unified list; drop `aion-cli`; suppress/absorb AionUi's native strip)
- `scripts/aionui-patches/local-agents-install-section.css` — companion styling for any new "one list" layout / native-strip hide
- Possibly a CSS rule (or a small DOM hide) to suppress AionUi's native Local Agents agent cards

**Out of scope (do NOT touch — would regress prior phases):**
- `agents-overlay.ts` / the `/api/agents` overlay route / `@liv_agents` Caddy carve-out (the picker fix is DONE and correct — 269.1/269-03)
- `cli-installer-router.ts`, `auth.ts`, `cli-uninstall.ts`, `agent-refresh.ts` (backend untouched)
- `use-cli-auth-bridge.ts`, `cli-auth-dialog.tsx` (the shell-side dialog/bridge — preserved as-is)
- The 20-CLI drift-lock (`SUPPORTED_CLIS` count must stay 20 across `install-scripts.ts`, `types.ts`, the patch, the bridge)

**Deploy:** release-based. CODE ONLY this run. Cut a tag → `release.yml` publishes → `bash /opt/livos/update.sh` deploys the release; `install-liv-assistant.sh` re-copies the patch JS/CSS into the AionUi bundle and re-stamps the `?v=<sha>` cache-bust. SW self-destruct stub already in place but operator must still hard-refresh / clear site data to evict the *browser HTTP cache* + activate the new SW.

---

## Q1 — Panel agent data source (the crux of fix B): DEFINITIVE ANSWER

**The patch does NOT fetch any agent list. It has no "Detected" strip of its own.** `[VERIFIED]`

The only `fetch()` calls in the entire patch are the two tRPC wire helpers:

```js
// local-agents-install-section.js:121
var TRPC_BASE = '/liv/trpc/cliInstaller';
// :151–160  trpcQuery → GET  /liv/trpc/cliInstaller.<proc>?input=...
// :162–172  trpcMutate → POST /liv/trpc/cliInstaller.<proc>
// :180–190  the ONLY procedures called:
function detectCli(name)  { return trpcQuery('detect',   { name: name }); }
function installCli(name) { return trpcMutate('install', { name: name }); }
function authCli(name)    { return trpcMutate('auth',    { name: name }); }
function hasPendingAgentChanges() { return trpcQuery('hasPendingAgentChanges', {}); }
function applyAgentChanges()      { return trpcMutate('applyAgentChanges', {}); }
```

Each row's "Installed ✓ / Not installed" state is computed per-CLI by `cliInstaller.detect`:

```js
// :466–474  reDetect()
detectCli(name).then(function (out) {
  setRowState(row, out && out.detected ? 'detected' : 'undetected');
})
```

There is **no `/api/agents`, no `/liv/api/agents`, no AionUi list fetch anywhere in the patch.** `[VERIFIED: grep of patch JS for 'api/agents','/agents','fetch(' → only the two tRPC fetches at lines 153,163]`

**So where does the operator's "Detected" strip come from?** It is **AionUi's native Local Agents tab UI**. The patch *sibling-mounts* its single section *below* AionUi's existing tab content:

```js
// :603–611  mount()
var panel = findTabPanel();        // finds AionUi's "Local Agents" tabpanel
var section = renderSection();     // builds OUR #liv-240-install-section
panel.appendChild(section);        // appends BELOW AionUi's native cards
```

`renderSection()` (lines 547–575) heading is literally `'Available to Install'`. The CSS comment even calls this out: *"Card grid — responsive, mirrors the native 'detected agents' cards"* (`local-agents-install-section.css:37`). So AionUi renders the native "detected agents" cards (the strip), and we append our grid beneath them.

**That native AionUi list is fed by `/api/agents`** — the only AionUi agent-list endpoint that exists anywhere in the codebase (`[VERIFIED: the sole references are agents-overlay/agent-refresh/the overlay route, all `/api/agents`]`). Inside the `/liv` iframe AionUi requests resolve under the `/liv` prefix, so the SPA's `/api/agents` becomes `/liv/api/agents` at the edge, which Caddy routes through the overlay (see Q4). **The overlay already strips `aion` (269.1).**

**Therefore the "Aion still shows in the panel" symptom is one of:**
1. **Stale SW / HTTP cache** (HIGH likelihood) — the browser is serving a pre-269.1 cached `/liv/api/agents` response, or AionUi's own in-memory agent list was hydrated before the overlay change deployed. The 269-03 overlay + 269.1 hide are server-side; a cached agent list bypasses them.
2. **The built-in `aionrs` agent (id `632f31d2`)** (MEDIUM likelihood) — AionUi ships a built-in agent labelled "Aion CLI" / "Liv CLI" whose `binary_name` is `None`/`aion`. It is hidden via `agents.hidden` in AionUi *client settings* (`scripts/set-default-liv-agent.sh:88–99`), NOT via the overlay. If `agents.hidden` got reset out-of-band (the script's own comment warns this has happened before), the built-in re-appears in the native strip independent of the overlay. `[VERIFIED: set-default-liv-agent.sh BUILTIN_AGENT_ID="632f31d2", agents.hidden PUT]`
3. **The npm `aion` CLI row in OUR grid** (CERTAIN, if present) — our patch *does* render an `aion-cli` row (it's in `SUPPORTED_CLIS`), shown as install-only with `authHidden:true`. If the operator installed the aion npm CLI, `cliInstaller.detect` returns `detected:true` and our row shows "Installed ✓". **This is a separate, patch-owned appearance of Aion that we fully control and must drop.** `[VERIFIED: SUPPORTED_CLIS includes 'aion-cli' at patch line 29; CLI_META 'aion-cli' authHidden:true at line 72]`

**Recommended fix (definitive):** The aion fix is **NOT "route the panel through the overlay"** — the panel reads no agent list, so there is nothing to route. The fixes are:
- **(ii) Filter `aion` in the patch JS** — drop `aion-cli` from the rendered grid (one-line list edit). Cause #3, fully in our control.
- **Suppress AionUi's native strip** (or at least its aion card) via CSS/DOM in the patch — addresses causes #1/#2 by removing the *second* list entirely, so there is one source of truth (our grid).
- **Re-assert `agents.hidden` for `632f31d2`** is already handled by `set-default-liv-agent.sh` on every deploy; no change needed, but live-verify it ran.

This is lowest-risk because it touches only the patch (no backend, no Caddy, no overlay regression risk to the picker).

---

## Q2 — Current two-section structure (mapped)

There is **one** section in the patch, plus AionUi's native (un-owned) cards above it.

**OUR section (`#liv-240-install-section`)** — built by `renderSection()` (lines 547–575):

| DOM piece | Builder fn | Lines | Data source |
|-----------|-----------|-------|-------------|
| `<section id="liv-240-install-section">` | `renderSection` | 547–575 | static |
| `<h3>Available to Install</h3>` | `renderSection` | 549 | static |
| hint `<p>` | `renderSection` | 550–552 | static |
| Apply bar `#liv-269-apply-bar` | `renderSection` | 559–570 | server `hasPendingAgentChanges` |
| one `.liv-240-row` per CLI | `renderRow(name)` | 278–322, called 571–573 | `SUPPORTED_CLIS` tuple (NOT an agent list) |
| per-row icon | `renderIcon(meta)` | 250–276 | `CLI_META[name].aionuiLogo`/`.logo` |
| per-row status pill | `setRowState` | 324–376 | `cliInstaller.detect` result |

The grid is iterated straight off the static `SUPPORTED_CLIS` array:

```js
// :571–573
for (var i = 0; i < SUPPORTED_CLIS.length; i++) {
  section.appendChild(renderRow(SUPPORTED_CLIS[i]));
}
```

**AionUi's native "Detected" strip** — NOT in this codebase. It is rendered by the vendored AionUi SPA (arco-design tabs) in the Local Agents tabpanel that `findTabPanel()` locates (lines 577–601, matched by the locale label text "Local Agents" / "Yerel Ajanlar" / etc.). We have no builder for it; we only `appendChild` beneath it.

**De-dup status:** Because OUR grid is keyed off `SUPPORTED_CLIS` (every one of the 20 CLIs always rendered, regardless of installed state) and AionUi's native strip lists only *installed/registered* agents, **a CLI that is installed appears TWICE today** — once in AionUi's native strip (as a detected agent) and once in our grid (as an "Installed ✓" row). This duplication is exactly what the operator is complaining about ("Burada gözüksün her şey … aynı yerde olsun" = "show everything here, in the same place"). Our grid is already the superset "one place"; the native strip is the redundant duplicate.

---

## Q3 — Unification design

**Good news: our grid is already a unified, CLI-keyed list** with the exact per-row model the operator asked for. The redesign is mostly *removing the duplicate native strip* and polishing copy, not building a new join.

**Per-CLI row model (already implemented in `setRowState`, lines 324–376):**

| Row state | Trigger | Buttons shown | Source |
|-----------|---------|---------------|--------|
| `detected` / `installed` | `detect().detected === true` | Auth (`''`), Remove (`''`), Install hidden | lines 336–343 |
| `undetected` | `detect().detected === false` | Install (`''`), Auth/Remove hidden | lines 344–350 |
| `installing` / `authing` / `authed` / `failed` / `terminal` | user action | transient | lines 351–409 |

The operator's requirement — "installed → Auth/Remove, not-installed → Install, all in one place" — **is already the behavior of our single grid.** `[VERIFIED: setRowState lines 336–350]`

**Join key:** There is **no join to build** for our grid, because it does not consume an agent list — it iterates `SUPPORTED_CLIS` and asks `cliInstaller.detect(name)` per row. The "installed" signal is purely `detect.detected` (server-side `command -v <bin>` via `CLI_BIN_NAMES[name]`). `[VERIFIED: detector.ts lines 100–160]`

**The only join that matters is conceptual — reconciling "our grid" vs "AionUi's native strip":**
- AionUi's native agent → `binary_name` (e.g. `claude`, `gemini`, `aion`) — same key the overlay uses.
- Our CLI → `CliName` (e.g. `claude-code`, `aion-cli`).
- The drift-locked bridge between them is `CLI_BIN_NAMES` (`CliName → bin`) and its inverse `BIN_TO_CLI_NAME` (`bin → CliName`) in `agents-overlay.ts`. `[VERIFIED: install-scripts.ts CLI_BIN_NAMES lines 67–91; agents-overlay.ts BIN_TO_CLI_NAME line 42]`

**Mismatch risks when suppressing the native strip:**
1. **A non-LivOS agent the operator added manually** — AionUi's native strip may list an agent whose `binary_name` is NOT in `BIN_TO_CLI_NAME` (assumption A3 in the overlay). If we *hide AionUi's entire native strip*, we'd hide that foreign agent too — but it would still be reachable in the chat picker (overlay keeps unmanaged agents). Acceptable: the Local Agents *install* panel is about the 20 managed CLIs; a foreign agent doesn't belong in the install grid anyway. **Document this as an accepted trade-off, not a regression.**
2. **The built-in `aionrs` agent (632f31d2)** — has `binary_name: None`. Our grid never renders it (it's not a `SUPPORTED_CLIS` entry; `aion-cli` is the *npm* CLI, a different thing). Hidden via `agents.hidden`. If we hide AionUi's native strip wholesale, this disappears from the strip regardless of `agents.hidden` state — a bonus robustness win.
3. **Two "Aion" identities collapse** — the npm `aion` CLI (`aion-cli`, our grid) and the built-in `aionrs` ("Aion CLI" label, native strip) both read as "Aion". Dropping `aion-cli` from our grid + hiding the native strip removes BOTH. This is what the operator wants.

**Recommended unification approach (lowest-risk, preserves everything):**
- Keep our single `#liv-240-install-section` grid as THE unified list.
- **Drop `aion-cli`** from the rendered set (see Q4 for the exact predicate).
- **Hide AionUi's native Local Agents agent cards** so our grid is the only list (CSS rule scoped inside the located tabpanel, or a targeted DOM removal in `mount()` after `findTabPanel()`). This eliminates the duplicate and the stale-cache aion-in-native-strip symptom in one move.
- Update the heading/copy from "Available to Install" to something like "Local Agents" / "Agents" since it's now the whole list, not just the install subset (operator-facing label — confirm with operator per the aesthetics rule, see Risks).

**Alternative (heavier, NOT recommended):** Have the patch fetch `/liv/api/agents` (overlay-filtered) to drive a real join and render AionUi's detected agents + the installable remainder. This re-introduces an agent-list dependency the patch deliberately avoided, adds a fetch that can fail, and risks divergence from `cliInstaller.detect`. The `detect`-per-row model is already authoritative and simpler. Avoid.

---

## Q4 — Aion identity across the layers (byte-exact predicate)

| Layer | Identifier for Aion | Value |
|-------|--------------------|-------|
| `CliName` (types.ts) | union member | `'aion-cli'` `[VERIFIED: types.ts:18]` |
| `CLI_BIN_NAMES` (install-scripts.ts) | bin on PATH | `'aion-cli': 'aion'` `[VERIFIED: install-scripts.ts:72]` |
| Overlay (agents-overlay.ts) | `binary_name` const | `const AION_BINARY_NAME = 'aion'` `[VERIFIED: agents-overlay.ts:47]` |
| AionUi native agent | `agent_source_info.binary_name` / `backend` | `'aion'` (npm CLI) / `'aionrs'`→None (built-in) |
| Built-in agent (set-default script) | AionUi agent id | `632f31d2` `[VERIFIED: set-default-liv-agent.sh:60]` |
| Patch grid (local-agents-install-section.js) | `SUPPORTED_CLIS` entry + `CLI_META` key | `'aion-cli'` `[VERIFIED: patch lines 29, 72]` |

**The exact 269.1 filter predicate to match byte-for-byte** (from `agents-overlay.ts:113`, the operator-locked hide):

```ts
const visible = aionuiAgents.filter((a) => binaryNameOf(a) !== AION_BINARY_NAME)
// where AION_BINARY_NAME = 'aion'  (agents-overlay.ts:47)
// and   binaryNameOf(a) = a.agent_source_info?.binary_name ?? a.backend ?? ''  (agents-overlay.ts:67–69)
```

**For the patch grid, the equivalent (the patch keys by `CliName`, not `binary_name`):** drop the CLI whose `CLI_BIN_NAMES` bin is `'aion'`, i.e. **`aion-cli`**. The drift-lock guarantees `CLI_BIN_NAMES['aion-cli'] === 'aion'`, so excluding `'aion-cli'` from the patch's iterated list is the byte-consistent counterpart of the overlay's `binaryNameOf(a) !== 'aion'`. Recommended patch-side constant for clarity:

```js
// mirror agents-overlay.ts AION_BINARY_NAME / Phase 269.1
var HIDDEN_CLIS = { 'aion-cli': true };   // bin 'aion' — operator 269.1, hidden everywhere
```

…and skip it in BOTH the render loop (line 571) and the hydrate loop (line 461). (Two loops iterate `SUPPORTED_CLIS` — `renderSection` to build rows, `hydrate` to wire them; both must skip the hidden CLI, or simply build a `VISIBLE_CLIS` array once and iterate that in both places.)

---

## Q5 — What MUST be preserved & exactly where it lives

| Feature (phase) | File | Function / lines | What not to break |
|-----------------|------|------------------|-------------------|
| **Apply bar** (269-01) | local-agents-install-section.js | `renderSection` builds `#liv-269-apply-bar` (559–570); `wireApplyBar` (425–452); `refreshApplyBar` (417–423); `hasPendingAgentChanges`/`applyAgentChanges` (189–190) | Keep the bar element id `liv-269-apply-bar`, the `#liv-269-apply-btn`/`#liv-269-apply-status` ids, the `focus`-listener re-check (460), and the 4s `setTimeout` re-checks after each action (491, 511, 528) |
| **Install handler** (267-02) | same | `hydrate` install click → `postToShell('cli-install', name)` (483–496) | Posts NAME only; opens dialog; sets terminal-pending; re-checks Apply bar |
| **Auth handler** (267-02) | same | `hydrate` auth click → `postToShell('cli-auth', name)` (503–516) | Skipped when `meta.authHidden` (no Auth button rendered for aion) |
| **Remove handler** (268-04) | same | `hydrate` uninstall click → `postToShell('cli-uninstall', name)` (522–533) | Gated `!authHidden`; posts NAME only |
| **Re-detect** (GC-B) | same | `reDetect()` (466–474); redetect button (297–302); handler (536–539) | Refreshes row after dialog flow |
| **postMessage bridge → shell** | same | `postToShell(type, name)` (384–394): `{source:'liv-240-local-agents', type, cli}` to `window.parent`, targetOrigin `window.location.origin` | The shell listener `use-cli-auth-bridge.ts` validates `source==='liv-240-local-agents'` + origin + `INSTALLABLE_CLIS` whitelist + `/^[a-z0-9-]+$/`; message types `cli-install`/`cli-auth`/`cli-uninstall` |
| **Bridge (shell side)** (267-02/268-04) | livos/packages/ui/src/hooks/use-cli-auth-bridge.ts | `useCliAuthBridge` (152–194); `INSTALLABLE_CLIS` set (78–83, still lists `aion-cli`) | Do NOT remove `aion-cli` from `INSTALLABLE_CLIS` unless you also stop posting it — but since the patch will no longer render an aion row, no aion message is ever posted; leaving the whitelist entry is harmless and keeps the drift-lock count |
| **Icon cascade** (269-04) | same | `renderIcon(meta)` (250–276); `logoCandidates(meta)` (237–242); `monogramIcon(meta)` (222–229); bases `LOGO_BASE='/agent-logos/'` (100), `AIONUI_LOGO_BASE='/liv/api/assets/logos/'` (108); `CLI_META[*].aionuiLogo`/`.logo` (67–93) | 3-tier: AionUi asset → static `/agent-logos/<logo>.svg` → monogram; `onerror` advances; never a broken image |
| **setRowState state machine** (240/267/268) | same | `setRowState(row, state, message)` (324–376) | The detected/undetected → Auth/Remove/Install visibility logic IS the unified-list row model — reuse verbatim |
| **Self-healing mount** (253 W5) | same | `observe()` (621–627); `mount()` idempotent via `SENTINEL_ID` (603–611) | MutationObserver re-mounts when AionUi re-renders the tab; keep it |
| **Aion hidden in PICKER** (269.1/269-03) | livos/.../cli-installer/agents-overlay.ts | `buildAgentsOverlay` line 113 | DO NOT TOUCH — the picker fix is correct and locked by `agents-overlay.test.ts` |
| **Caddy `@liv_agents` overlay route** (269-03) | livos/.../domain/caddy.ts | `LIV_AGENTS_HANDLE` (456–463), emitted before `@liv_api_subresource` (708–709,745–746,797–798) | DO NOT TOUCH — locked by `caddy.test.ts` (exact path, no wildcard, gate, :8080) |
| **Built-in aionrs hide** (253 GC-C) | scripts/set-default-liv-agent.sh | `agents.hidden:[632f31d2]` PUT (88–99) | Runs on every deploy; live-verify it executed |

---

## Q6 — Tests & deploy

### Tests that cover the touched surface

| Test | What it locks | Relevance to 270 |
|------|---------------|-------------------|
| `cli-installer/__tests__/agents-overlay.test.ts` (12 tests) | `buildAgentsOverlay` strips `aion` always + fail-open; `BIN_TO_CLI_NAME` is exact inverse | The picker contract — must stay GREEN (we don't touch the overlay, but the aion predicate is the reference) `[VERIFIED: read in full]` |
| `domain/caddy.test.ts` (`@liv_agents` block, lines 1801–1861) | exact path `/liv/api/agents`, no wildcard, gated, :8080, emits before `@liv_api_subresource` | Routing contract — stays GREEN (untouched) |
| `domain/caddy.test.ts` (cliInstaller carve-out, lines 1738–1746) | EXACT 5 tRPC paths, no wildcard | The panel's tRPC surface — unchanged |
| **`node --check` on the patch JS** | syntax-valid vanilla JS (the patch has no test harness — it's a standalone asset) | **PRIMARY gate for the patch** — `node --check scripts/aionui-patches/local-agents-install-section.js` |
| `pnpm --filter ui build` (vite) | UI bundle compiles (if any React/agent-logos touched) | Only if `agent-logos.tsx` changes (likely NOT needed for 270) |

There is **no unit test for the patch JS itself** — it ships as a standalone browser asset (header line 11–12: "no build step, no React import, no module loader"). The drift-lock between the patch's `SUPPORTED_CLIS` and `install-scripts.ts` is maintained by hand + the patch's own DRIFT-LOCK comment (lines 22–36). Verification is `node --check` + the acceptance greps + live UAT.

### Build / verify command set

```bash
# 1. Syntax-check the patch (primary gate — no test harness exists)
node --check scripts/aionui-patches/local-agents-install-section.js

# 2. Only if agent-logos.tsx or any React surface changed (likely NOT needed):
pnpm --filter @livos/config build && pnpm --filter ui build   # vite DEPLOY GATE

# 3. Keep the overlay/caddy contracts green (regression guard — they're untouched):
#    (run from livos/ with the livinityd test runner — vitest)
#    agents-overlay.test.ts (12) + caddy.test.ts (@liv_agents + carve-out blocks)

# 4. Acceptance greps (mirror the 268-04 SUMMARY pattern):
#    - aion-cli NOT in the rendered loop / present only in a HIDDEN_CLIS exclusion
#    - #liv-269-apply-bar present; renderIcon 3-tier present; postToShell present
```

### Deploy path

1. Patch source lives at `scripts/aionui-patches/local-agents-install-section.{js,css}`.
2. `install-liv-assistant.sh` (lines 366–399) copies them into the AionUi bundle as `liv-240-install-section.{js,css}` under `${REBRAND_TARGET}/assets/`, and **always refreshes on every deploy** (the G17 fix — line 374–375 `install -m 0644`), then re-stamps `?v=<sha256-first-12>` in `index.html` (lines 377–393) so the browser HTTP cache busts.
3. AionUi's caching `sw.js` is replaced with a **self-destruct stub** (lines 412–431) that unregisters + clears all caches on next load.
4. Release-based: cut a tag (`gh release create vX.Y --target master --generate-notes --latest` or push a `vX.Y` tag → `release.yml`), then on the Mini PC `bash /opt/livos/update.sh` deploys the release tag and re-runs `install-liv-assistant.sh`.

### SW-cache + Re-detect caveat for live verification (CRITICAL)

Even with the `?v=` bust + SW self-destruct stub, the operator must, on the live box:
- **Hard-refresh** (the SW stub activates on *next* load — close all `/liv` tabs or DevTools → Application → Unregister SW + Clear site data), then reload.
- Click **Re-detect** on any row whose state looks stale.
- This is the #1 reason "the fix doesn't show" in this codebase (see MEMORY: *feedback_update_failed_but_version_stays_old* and the PWA-SW stale-bundle note). **Phase 270's "Aion still shows" is very likely this exact caching, since the overlay already hides aion.**

---

## Q7 — Risks & landmines

| # | Risk | Mitigation |
|---|------|-----------|
| R1 | **Stale SW/HTTP cache masks the fix** — the overlay already strips aion; if the live test still shows it, it's cache, not code. | Live-verify with full SW clear + hard-refresh + Re-detect BEFORE concluding the code is wrong. The fix is provably correct server-side. |
| R2 | **Double-render when a CLI is both in AionUi's native strip AND our grid** — this is the *current* duplication the operator dislikes. If we drop aion from our grid but DON'T hide the native strip, aion can still appear in AionUi's native cards (from a cached/un-hidden built-in). | Hide AionUi's native Local Agents agent cards in the patch so our grid is the SOLE list. This is the real "one place" fix. |
| R3 | **Hiding AionUi's native strip is brittle** — it's vendored arco-design DOM with no stable id; a future AionUi version could change the markup. | Scope the hide to the located tabpanel (reuse `findTabPanel()`), target the native cards by structure relative to OUR `#liv-240-install-section` sentinel, and keep the MutationObserver self-heal (253 W5) so a re-render re-applies the hide. Fail-safe: if the native cards can't be found, our grid still renders correctly (degrades to "duplicate strip", not "broken panel"). |
| R4 | **Routing the panel through the overlay would regress the picker** — if someone "fixes" aion by making the patch fetch `/liv/api/agents` and that fetch is wrong (e.g. hits `/api/agents` apex, or batches), it could break or it adds a failure mode. | DON'T re-route. The patch reads no agent list; fix aion by list-exclusion + native-strip hide. Leave the overlay/Caddy untouched. |
| R5 | **Drift-lock (20-CLI count)** — `SUPPORTED_CLIS` must stay 20 across `install-scripts.ts`, `types.ts` (`CliName`), the patch, and `use-cli-auth-bridge.ts` `INSTALLABLE_CLIS`. | Do NOT remove `aion-cli` from the canonical `SUPPORTED_CLIS` arrays. *Exclude it at render time* via a `HIDDEN_CLIS`/`VISIBLE_CLIS` filter in the patch, keeping the 20-tuple intact. `aion-cli` stays installable via tRPC (just not shown). |
| R6 | **Removing `aion-cli` from `INSTALLABLE_CLIS` in the bridge** would break the drift-lock and the NAME-only RCE whitelist symmetry. | Leave `INSTALLABLE_CLIS` as-is (20 names). Since the patch never posts an aion message (no aion row), the whitelist entry is simply never exercised. |
| R7 | **`authHidden` already half-hides aion** — aion-cli renders with no Auth and no Remove button (correct), but DOES render an Install button + a row. The operator wants it GONE, not install-only. | The current `authHidden:true` is not enough — it only suppresses Auth/Remove. Fix B requires dropping the entire row. |
| R8 | **Operator-facing label/aesthetic change** — renaming the heading from "Available to Install" to "Local Agents"/"Agents" is a visual change. | Per MEMORY hard rule (*feedback_adaptive_icon_tiles_rejected*): "never ship icon/visual redesigns without operator mockup approval; 'bana sormadan devam et' covers features, NOT aesthetics." The list-unification is a *feature* (operator explicitly requested it), but the exact heading text / layout polish is *aesthetic* — confirm copy with the operator or keep changes minimal/functional. |
| R9 | **`findTabPanel()` heuristic fragility** — it walks text nodes for locale labels then up to a `tabpanel`/`arco-tabs-*` ancestor, with a "tall ancestor" fallback (lines 577–601). Hiding native cards relative to this could over- or under-match. | Reuse the SAME `findTabPanel()` result the mount already uses; apply the native-card hide within that container only; never hide our own sentinel section. |
| R10 | **Built-in `aionrs` (632f31d2) re-appears if `agents.hidden` resets** — independent of the overlay and of our grid. | `set-default-liv-agent.sh` re-asserts `agents.hidden` on every deploy; hiding AionUi's native strip wholesale (R2) also covers this. Live-verify the script ran post-deploy. |

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Aion hide identity | A new "is this aion?" check by label/id | The `bin === 'aion'` predicate (overlay) ⇒ exclude `aion-cli` (CliName) in the patch | Byte-consistency with 269.1; the drift-lock guarantees `CLI_BIN_NAMES['aion-cli']==='aion'` |
| Installed-state per row | A fetch of `/liv/api/agents` + a join | `cliInstaller.detect(name)` per row (already wired) | `detect` is authoritative (`command -v <bin>` with the right PATH); no agent-list dependency or failure mode |
| Unified row model | A new component | The existing `renderRow` + `setRowState` | Already implements installed→Auth/Remove, not-installed→Install |
| Icon rendering | A new logo map | `renderIcon`/`logoCandidates`/`CLI_META.aionuiLogo` (269-04) | 3-tier cascade already handles 404s/offline |
| Cache busting | A manual version query | `install-liv-assistant.sh` `?v=<sha>` stamp + SW self-destruct | Already in the deploy script |

**Key insight:** Nearly everything Phase 270 needs already exists in the patch. The work is **subtractive** (drop aion-cli, hide the duplicate native strip) plus light copy/layout, NOT a rewrite. Resist the urge to re-architect the panel around an agent-list fetch.

---

## Recommended implementation approach

**Data model (already present — reuse):**
- One list keyed by `CliName`, iterated from a `VISIBLE_CLIS` = `SUPPORTED_CLIS.filter(c => !HIDDEN_CLIS[c])` array (excludes `aion-cli`).
- Per-row state from `cliInstaller.detect`: `detected` → Auth + Remove; `undetected` → Install. (Unchanged `setRowState`.)
- `HIDDEN_CLIS = { 'aion-cli': true }` — the patch-side mirror of the overlay's `AION_BINARY_NAME='aion'` hide (269.1), with a comment cross-referencing `agents-overlay.ts:47,113`.

**Chosen Aion fix (rationale): FIX (ii) — filter in the patch JS + hide AionUi's native strip.**
- The panel reads NO agent list, so "route through the overlay" (fix i) is inapplicable — there is nothing to route.
- The overlay already hides aion in the PICKER; the panel's aion appearances are (a) our own `aion-cli` row and (b) AionUi's native strip (cached/built-in). Both are addressed only in the patch DOM.
- Lowest blast radius: no backend, no Caddy, no overlay, no picker-regression risk; locked tests stay green.

**Concrete file-change list:**

1. `scripts/aionui-patches/local-agents-install-section.js`
   - Add `HIDDEN_CLIS` constant (mirror 269.1; comment-link to `agents-overlay.ts`).
   - Compute `VISIBLE_CLIS = SUPPORTED_CLIS.filter(c => !HIDDEN_CLIS[c])` once.
   - Use `VISIBLE_CLIS` in BOTH the render loop (`renderSection`, ~line 571) and the hydrate loop (`hydrate`, ~line 461) so `aion-cli` is neither rendered nor wired.
   - In `mount()` (after `findTabPanel()`), hide AionUi's native Local Agents agent cards within the located tabpanel (DOM hide or add a class our CSS hides), scoped to NOT touch `#liv-240-install-section`. Make it idempotent + observer-safe (re-applied on AionUi re-render via the existing `observe()`).
   - Keep the heading minimal; if changing "Available to Install" → "Local Agents"/"Agents", flag for operator copy-approval (R8).
2. `scripts/aionui-patches/local-agents-install-section.css`
   - Add the scoped rule that hides AionUi's native agent cards (if using a class-based hide), and any layout tweak so the single grid reads as the whole list.
3. (No backend/Caddy/overlay/dialog/bridge changes.)

**Verify:** `node --check` the patch JS; run `agents-overlay.test.ts` + the `@liv_agents` caddy tests (regression guard, untouched); acceptance greps for `HIDDEN_CLIS`, the Apply bar id, `renderIcon`, `postToShell`. Then cut a release tag → `update.sh` on Mini PC → **full SW clear + hard-refresh + Re-detect** → confirm Aion gone from BOTH the picker AND the panel, and that exactly one list shows.

---

## Code Examples (verified anchors the planner can reference)

### The overlay's aion predicate (the byte-exact reference for the patch)
```ts
// agents-overlay.ts:47, 67–69, 113  [VERIFIED]
const AION_BINARY_NAME = 'aion'
function binaryNameOf(a) { return a.agent_source_info?.binary_name ?? a.backend ?? '' }
const visible = aionuiAgents.filter((a) => binaryNameOf(a) !== AION_BINARY_NAME)
```

### The patch's render + hydrate loops (both iterate SUPPORTED_CLIS — both must skip aion)
```js
// local-agents-install-section.js:571–573 (render)  [VERIFIED]
for (var i = 0; i < SUPPORTED_CLIS.length; i++)
  section.appendChild(renderRow(SUPPORTED_CLIS[i]));
// :461–540 (hydrate) — IIFE per SUPPORTED_CLIS[i] wiring detect/install/auth/remove
```

### The sibling-mount that proves the native strip is AionUi-owned
```js
// local-agents-install-section.js:603–611  [VERIFIED]
var panel = findTabPanel();        // AionUi's Local Agents tabpanel
var section = renderSection();     // OUR grid
panel.appendChild(section);        // appended BELOW AionUi's native cards
```

### The Caddy routing that already overlay-filters the picker
```
// caddy.ts:456–463  LIV_AGENTS_HANDLE  [VERIFIED]
@liv_agents path /liv/api/agents
handle @liv_agents { <gate> ; uri strip_prefix /liv ; reverse_proxy 127.0.0.1:8080 }
// emitted BEFORE @liv_api_subresource path /liv/api/*  (exact path wins)  [VERIFIED caddy.test.ts:1836–1842]
```

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | AionUi's native Local Agents tab feeds its agent cards from `/api/agents` (the only agent-list endpoint in the codebase), which inside the iframe resolves to `/liv/api/agents` and is overlay-routed. | Q1 | LOW — even if AionUi uses a settings-backed list for the *management* view, hiding the native strip in the patch DOM (the recommended fix) is endpoint-agnostic and still works. The "route through overlay" alternative would be the only thing affected, and it's already rejected. |
| A2 | The operator's "Aion in the Detected strip" is AionUi's native cards (npm `aion` and/or built-in `aionrs`), not anything our patch renders besides our own `aion-cli` row. | Q1, Q3 | LOW — both possibilities are covered by (drop `aion-cli` row) + (hide native strip). |
| A3 | A wholesale hide of AionUi's native Local Agents cards is acceptable to the operator (they asked for ONE list = our grid). | Q3, R2 | MEDIUM — if the operator actually wants AionUi's native detected agents *kept* and merely de-duplicated, the design shifts. The verbatim quote ("show everything here, in the same place") supports collapsing to one list. Confirm in discuss-phase. |
| A4 | Changing the heading text is aesthetic and needs operator sign-off; the list-unification itself is an approved feature. | R8 | LOW — keeping the change functional/minimal avoids the rejection risk. |

---

## Open Questions

1. **Does AionUi's *Local Agents management* view use `/api/agents` or a settings endpoint?**
   - What we know: `/api/agents` is the only agent-list endpoint referenced in our code; `/api/settings/client` carries `agents.hidden`/`guid.lastSelectedAgent`. The native *picker* uses `/api/agents` (overlay-covered). The native *Local Agents tab* (where our patch mounts) likely renders from the same `/api/agents` but this is inside the vendored bundle and not directly readable here.
   - Why it matters: only matters for the rejected "route through overlay" path; the recommended DOM-hide fix is endpoint-agnostic.
   - Recommendation: don't depend on it. Hide the native strip in the DOM; live-verify.

2. **Is the live "Aion still shows" purely SW cache?**
   - What we know: the overlay strips aion server-side (269.1, proven by `agents-overlay.test.ts`). The most common stale-fix cause in this repo is the PWA/AionUi SW.
   - Recommendation: the FIRST live step after deploy is a full SW clear + hard-refresh + Re-detect, BEFORE any further code change. The phase may be "mostly already fixed; just hide our own row + the native strip + bust cache."

3. **Should `aion-cli` remain installable via tRPC (just hidden in the UI)?**
   - What we know: dropping it from `SUPPORTED_CLIS` would break the 20-CLI drift-lock and the RCE whitelist. Excluding it only at render time keeps it installable but invisible.
   - Recommendation: keep it in the canonical tuples; exclude at render via `HIDDEN_CLIS`. Confirm the operator never needs to install the npm aion CLI from the UI (they don't — they want it gone).

---

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node` (for `node --check` patch syntax gate) | patch verify | ✓ (dev box) | — | — |
| `pnpm` + vite (only if a React surface changes) | UI build gate | ✓ | — | likely not needed for 270 |
| Mini PC (`bruce@10.69.31.68`) | live UAT | operator-side | — | — |
| GitHub release tag → `update.sh` | deploy | ✓ (266 release-based) | — | — |

No new external dependency. CODE ONLY; deploy is the established release flow.

---

## Project Constraints (from CLAUDE.md / MEMORY)

- **Release-based deploy** (Phase 266): push to master does NOT deploy; cut a `vX.Y` tag (or `gh release create … --latest`). `update.sh` deploys the latest *release tag*. `[VERIFIED: MEMORY Deployment section]`
- **PWA / AionUi SW cache** aggressively serves stale bundles; the #1 cause of "fix doesn't show." Always SW-clear + hard-refresh for live verification. `[MEMORY: PWA service worker + feedback_update_failed_but_version_stays_old]`
- **Aesthetics need operator approval** — "'bana sormadan devam et' covers features, NOT aesthetics." Heading/layout copy changes → confirm. The list-unification feature is operator-requested (OK). `[MEMORY: feedback_adaptive_icon_tiles_rejected]`
- **D-239-07 name-only RCE boundary** — the iframe posts only a CLI NAME; never a raw command. Preserved (we touch only rendering, not the postMessage payload). `[VERIFIED: postToShell line 384; use-cli-auth-bridge.ts whitelist]`
- **20-CLI drift-lock** — `SUPPORTED_CLIS` count fixed at 20 across `install-scripts.ts`, `types.ts`, the patch, `use-cli-auth-bridge.ts`. Exclude aion at render, do not delete it from the tuple. `[VERIFIED: all four locations]`
- **Server 4 / Server 5 off-limits / retired** — only Mini PC matters for this code/UI work. (Not relevant to this CODE-ONLY phase beyond the deploy target.)

---

## Sources

### Primary (HIGH confidence — read in full this session)
- `scripts/aionui-patches/local-agents-install-section.js` (634 lines) — the panel; no Detected strip, no agent-list fetch, single grid keyed by `SUPPORTED_CLIS`
- `scripts/aionui-patches/local-agents-install-section.css` — companion styles ("mirrors the native 'detected agents' cards" comment)
- `livos/packages/livinityd/source/modules/cli-installer/agents-overlay.ts` — `buildAgentsOverlay`, `AION_BINARY_NAME='aion'`, `binaryNameOf`, 269.1 unconditional strip (line 113)
- `livos/packages/livinityd/source/modules/cli-installer/__tests__/agents-overlay.test.ts` — overlay contract (aion always hidden, fail-open)
- `livos/packages/livinityd/source/modules/cli-installer/types.ts` — `CliName` union (20)
- `livos/packages/livinityd/source/modules/cli-installer/install-scripts.ts` — `SUPPORTED_CLIS`, `CLI_BIN_NAMES['aion-cli']='aion'`
- `livos/packages/livinityd/source/modules/cli-installer/detector.ts` — `detectCli` (`command -v <bin>` + PATH handling)
- `livos/packages/livinityd/source/modules/cli-installer/index.ts` — barrel (exported surface)
- `livos/packages/livinityd/source/modules/server/index.ts:1443–1521` — `GET /api/agents` overlay route
- `livos/packages/livinityd/source/modules/domain/caddy.ts:418–463, 601–626` — `LIV_CLI_INSTALLER_HANDLE`, `LIV_AGENTS_HANDLE`, `@liv_api_subresource`
- `livos/packages/livinityd/source/modules/domain/caddy.test.ts:1724–1861` — carve-out + `@liv_agents` shape/order locks
- `livos/packages/ui/src/hooks/use-cli-auth-bridge.ts` — shell-side postMessage listener, `INSTALLABLE_CLIS`, RCE boundary
- `livos/packages/ui/src/features/liv-ai/agent-logos.tsx` — `<AgentLogo>` 3-tier cascade (269-04 mirror of the patch's `renderIcon`)
- `scripts/install-liv-assistant.sh:355–431` — patch copy + `?v=` cache-bust + SW self-destruct stub
- `scripts/set-default-liv-agent.sh` — `agents.hidden:[632f31d2]` built-in aionrs hide
- `git show f3ae3ccf` — the 269.1 commit (exact predicate + test flips)
- `.planning/ROADMAP.md` Phase 267/268/269/270 entries — full lineage

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` accumulated context (phase history)
- MEMORY topic files (release-based deploy, SW cache, aesthetics approval, RCE boundary)

### Tertiary (LOW confidence — needs live confirmation)
- AionUi vendored SPA's exact native Local Agents tab data source (assumed `/api/agents`; not readable in this tree) — see A1/OQ1

---

## Metadata

**Confidence breakdown:**
- Panel has no Detected strip / fetches no agent list: **HIGH** — read every line; only two `fetch()` calls, both tRPC.
- Picker already hides aion via overlay; panel aion = our row + AionUi native strip: **HIGH** for our row, **MEDIUM** for the native strip's exact endpoint (vendored, A1).
- Chosen fix (drop `aion-cli` at render + hide native strip + cache-bust): **HIGH** — subtractive, no backend/Caddy/overlay risk.
- Preserve list (Apply bar / handlers / icons / bridge): **HIGH** — exact file:line anchors.
- Drift-lock + RCE boundary respected: **HIGH**.

**Research date:** 2026-06-14
**Valid until:** ~2026-07-14 (stable; the only volatile input is the vendored AionUi bundle's native markup, which a version bump could change — re-confirm `findTabPanel()` selectors if AionUi is upgraded).

## RESEARCH COMPLETE
