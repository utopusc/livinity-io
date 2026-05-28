---
phase: 240-local-agents-install-from-ui
plan: 02
task: 1
gathered: 2026-05-28
target_host: bruce@10.69.31.68 (Mini PC)
target_path: /opt/liv-assistant/current/static/
bundle_main: assets/index-CaE7eEr9.js (1.6 MB, minified)
locked_option: option-a
locked_strategy: MutationObserver — text-content scan for "Local Agents" → walk up to closest tab-panel container → sibling-mount AFTER container's last child
selector_robustness: text-anchor (i18n "Local Agents" label, present in 5+ language variants in bundle) — survives React re-renders because we re-bind on each observed mutation until SENTINEL_ID exists
auto_decision_basis: full-autonomous mode (workflow.skip_discuss + auto_advance) + DEFAULT clause from 240-02-PLAN.md Task 1
sacred_sha_verified: f3538e1d811992b782a9bb057d1b7f0a0189f95f
---

# Phase 240 Plan 02 — Task 1: AionUi Local Agents tab patch-site investigation

## A. Environment

- **Mini PC** `bruce@10.69.31.68`, AionUi v2.1.4 vendored tarball (SHA pinned `0bb02d00...`)
- Served bundle root: `/opt/liv-assistant/current/static/`
- 1 entry HTML + ~30 chunked JS/CSS files
- Main app bundle: `index-CaE7eEr9.js` (1,642,553 bytes; minified — single-line)
- Vendor chunks: `vendor-react-hyIQBeiQ.js` (297 KB), `vendor-arco-7IYJkUAE.js` (688 KB), `vendor-editor-cC9T3iig.js` (616 KB), `vendor-highlight-7RDUSc9O.js` (916 KB)
- 28 dynamic-import language chunks (`zig-*.js`, `yaml-*.js`, …) — irrelevant; no agent matches

## B. Known agent-term occurrences (file:count)

Single hit in main bundle, zero in vendor + language chunks:

```
/opt/liv-assistant/current/static/assets/index-CaE7eEr9.js : 1  (Local Agents)
```

All other JS files: 0 hits.

## C. Window / global hook surface

```
window.__liv-ai_theme        — localStorage key only (theme bootstrap)
window.__liv-ai_colorScheme  — localStorage key only
```

**No `window.__aionui*` / `globalThis.__aionui*` registration hook.** AionUi does not expose a customisation registry. Bundle is a closed React SPA.

## D. Existing `/api/` fetch shapes (post Phase 235 path rewrite — all `/liv/api/...`)

Selected relevant endpoints (the bundle already uses these for the *built-in* Local Agents tab; we are NOT calling them, we are calling livinityd's `cliInstaller.*` tRPC via Caddy `/liv` proxy):

```
"/liv/api/agents"                          ← getAvailableAgents
"/liv/api/agents/custom"
"/liv/api/agents/custom/try-connect"
"/liv/api/agents/health-check"
"/liv/api/agents/refresh"                  ← refreshCustomAgents
"/liv/api/extensions/agent-activity"
"/liv/api/extensions/agents"
"/liv/api/mcp/agent-configs"
"/liv/api/mcp/remove-from-agents"
"/liv/api/mcp/sync-to-agents"
"/liv/api/remote-agents"
"/liv/api/remote-agents/test-connection"
"/liv/api/skills/materialize-for-agent"
"/settings/agent"                          ← internal route hash
```

**Note:** none of these are our target. The injected JS calls `/liv/trpc/cliInstaller.*` (Phase 240-01 namespace), which Caddy strip-prefixes `/liv` and proxies to **livinityd :8080** — a totally separate process from AionUi's `aioncore` :3020 backend. AionUi's `/liv/api/agents/...` endpoints are served by `aioncore`; they detect AionUi's *own* sense of "agent" (mainly: claude-cli, gemini-cli, opencode, openclaw — bundled via its own logic). The bundle's existing "No local agents detected" message comes from `aioncore`, not from livinityd.

This is meaningful for UX positioning: our injected subsection is the **"livinityd-installable" complement** to AionUi's *detected* list, hence the subsection title `Available to Install`.

## E. "Local Agents" raw text occurrences in bundle

Single tab key, repeated in i18n maps for ~5 languages. English (`qO`) sample:

```js
qO = {
  localAgents: "Local Agents",
  remoteAgents: "Remote Agents",
  localAgentsDescription: "Liv CLI is the built-in agent and ships with the app — no install needed. Other agents are detected only after their CLI is installed locally.",
  localAgentsSetupLink: "Setup guide",
  goToChat: "Start Chat",
  remoteAgentsDescription: "Only remote OpenClaw connections are supported for now. Other agents are in development.",
  …
}
```

Other named maps for the same locale group: `BO` (Remote Agents header), `mK` (zh-CN), Korean + Turkish variants nearby. Strings prove this is **i18n**, not JSX literal text — meaning the runtime DOM will show `qO.localAgents` evaluated to the user's locale ("Local Agents" / "本地 Agents" / "Yerel Ajanlar" / …).

Custom-agents sub-keys in same locale map:

```js
{
  detectCustomAgent: "Detect Custom Agent",
  editCustomAgent: "Edit Custom Agent",
  localAgentsEmpty: "No local agents detected",
  detected: "Detected",
  customAgents: "Custom Agents",
  addCustomAgent: "Add Custom Agent",
  …
}
```

## F. No stable data-testid / data-testname attributes

Bundle-wide scan for `data-[a-z-]+="..."`:

```
data-mention-index="${S}"    — editor mentions (unrelated)
data-theme="dark"             — root attribute
```

→ **No data-testid attributes exist in the SPA.** Selectors must be derived from text content or className signatures.

## G. CLI bin-name occurrences in bundle

```
claude-code: 0
opencode:    0
gemini:      2   (only "Google Gemini AI command-line tool" description string)
openclaw:    0
aion-cli:    0
claude-cli:  0
```

→ The bundle does NOT contain any of the 5 SUPPORTED_CLIS strings. The aioncore backend resolves agents at runtime via process-detection; the SPA only references them by display name. Our injected list (5 hardcoded CLIs) is fully decoupled from AionUi's internal agent registry — **no risk of selector collision with AionUi's own list items.**

## H. Recommendation — locked_option: **option-a**

### Why option-a (sibling-mount via MutationObserver) wins

1. **option-c (replace tab DOM)** — ruled out per plan's "NOT chosen autonomously" clause; would clobber AionUi's existing detected-agents list (the user's claude-code installation would disappear).

2. **option-b (floating overlay)** — viable but loses contextual UX. Operator sits in the Local Agents tab and expects the install list to live *inside* that tab, visually contiguous with the detected list. A `position:fixed` corner panel is bolted-on; CONTEXT.md L-240-D requires "reuse AionUi's existing button styles" + "append BELOW the existing detected-agents list" — option-b fails the second clause structurally.

3. **option-a (sibling-mount)** —
   - **Anchor:** text-content match for the i18n-evaluated `localAgents` label (e.g. element with `textContent === "Local Agents"` after locale resolution). Multi-language fallback list inside the JS: `["Local Agents", "Yerel Ajanlar", "本地 Agents", "ローカルエージェント", "로컬 에이전트"]` — covers the 5 locales the bundle ships.
   - **Walk-up:** from the matched label element, walk to closest `[role="tabpanel"]` OR closest ancestor with className containing `arco-tabs-content`/`arco-tabs-pane` (arco-design's tab DOM, which the bundle relies on per vendor-arco-*.js).
   - **Fallback walk-up:** if neither role/className anchor is found within 6 levels up, mount **as the LAST CHILD** of the closest `div` ancestor whose `clientHeight > 200px` (a "tab content area" heuristic).
   - **Sibling insertion:** `panel.appendChild(section)` — places the install section as the LAST child of the tab panel, naturally below the detected list per CONTEXT.md L-240-D.
   - **Idempotency:** `if (document.getElementById('liv-240-install-section')) return` guard at start of mount + observer disconnects after first successful insertion.
   - **Re-mount on tab change:** if the section is removed from DOM by React reconciliation (tab swap), the MutationObserver continues running on document.body in `{childList:true, subtree:true}` mode and re-mounts when the Local Agents label re-appears.

### Concrete strategy for Task 2

```javascript
const LOCALE_LABELS = [
  'Local Agents',     // en
  'Yerel Ajanlar',    // tr
  '本地 Agents',       // zh-CN
  'ローカルエージェント', // ja
  '로컬 에이전트',      // ko
]

function findTabPanel() {
  // 1. Find a text node matching any locale label
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let node
  while ((node = w.nextNode())) {
    const t = node.textContent && node.textContent.trim()
    if (t && LOCALE_LABELS.includes(t)) {
      // 2. Walk up looking for tab panel
      let el = node.parentElement
      for (let i = 0; i < 8 && el; i++, el = el.parentElement) {
        if (el.getAttribute && (
          el.getAttribute('role') === 'tabpanel' ||
          /arco-tabs-(content|pane)/.test(el.className || '')
        )) return el
      }
      // 3. Heuristic fallback: tall sibling div
      let h = node.parentElement
      while (h && h.parentElement && h.clientHeight < 200) h = h.parentElement
      return h
    }
  }
  return null
}
```

### Risk acceptance for option-a

- **Bundle upgrade drift:** SHA-pinned tarball (`EXPECTED_SHA256=0bb02d00...`) cannot drift without explicit operator action that bumps the pin → triggers a fresh patch-site investigation by-design.
- **Locale not in fallback list:** operator switches Liv AI to a locale we did not list → MutationObserver never fires → subsection invisible (but no error, no breakage). Mitigation: 5 most-common locales of AionUi's i18n table are covered above. Operator can append more locales later by editing `LOCALE_LABELS` const in the JS patch.
- **Arco tabs class drift:** arco-design v2 maintains `arco-tabs-content` + `arco-tabs-pane` API publicly. If arco bumps a major version, the heuristic fallback (`clientHeight > 200px`) still finds a reasonable mount point.

## Final decision

**`locked_option: option-a`** — sibling-mount via MutationObserver with text-content anchor. Proceed to Task 2 with the LOCALE_LABELS + findTabPanel() recipe above.

## Sacred SHA Verify

`git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — **PRESERVED**.
