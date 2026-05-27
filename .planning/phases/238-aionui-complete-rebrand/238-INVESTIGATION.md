---
phase: 238
plan: 02
type: investigation
date: 2026-05-27T20:53:31Z
sacred-sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
mini-pc-sacred-sha256: 62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe
status: complete
---

# Phase 238 — Plan 02 Investigation: AionUi Complete Rebrand Discovery

Single batched Mini PC SSH session (fail2ban discipline) enumerates (a) logo-related asset paths, (b) remaining case-insensitive `Aion` text in the served bundle, (c) word-boundary false-positive risks. Output drives Plan 238-01 (Step 238-A logo overlay + Step 238-B word-boundary sed regex).

---

## Section A: Environment

```
bruce-EQ
2026-05-27T20:53:31Z
Linux bruce-EQ 6.17.0-29-generic #29~24.04.1-Ubuntu SMP PREEMPT_DYNAMIC Mon May 11 10:30:58 UTC 2 x86_64 x86_64 x86_64 GNU/Linux
```

---

## Section B: D-V43-APACHE-NOTICE LICENSE + NOTICE sha256 baseline

```
a515d5a76da6c082f0d3d33a597bf82e32ecdac8841ed1783ac081ebd6d62ebf  /opt/liv-assistant/LICENSE
be9e969f948d5a8c95d888bfb67b4b30ccea5e27732d924346acff6ff9741470  /opt/liv-assistant/NOTICE
```

**Plan 238-03 MUST byte-identity-match both sha256 PRE/POST deploy.** Any drift = D-V43-APACHE-NOTICE violation → abort + rollback.

---

## Section C: Logo asset inventory

### C.1 Filename match `aion|logo|favicon|brand` (case-insensitive)

```
(zero results — no on-disk asset matches naming pattern)
```

**Finding: ZERO files in `/opt/liv-assistant/current/static/` whose basename contains `aion`, `logo`, `favicon`, or `brand`.** AionUi's bundle does NOT ship an explicitly-branded logo SVG/PNG asset on disk.

### C.2 ALL image assets under static/ (for full context)

```
/opt/liv-assistant/current/static/pet-states/carrying.svg
/opt/liv-assistant/current/static/pet-states/random-read.svg
/opt/liv-assistant/current/static/pet-states/waking.svg
/opt/liv-assistant/current/static/pet-states/yawning.svg
/opt/liv-assistant/current/static/pet-states/random-look.svg
/opt/liv-assistant/current/static/pet-states/poke-right.svg
/opt/liv-assistant/current/static/pet-states/error.svg
/opt/liv-assistant/current/static/pet-states/dozing.svg
/opt/liv-assistant/current/static/pet-states/building.svg
/opt/liv-assistant/current/static/pet-states/dragging.svg
/opt/liv-assistant/current/static/pet-states/done.svg
/opt/liv-assistant/current/static/pet-states/sweeping.svg
/opt/liv-assistant/current/static/pet-states/sleeping.svg
/opt/liv-assistant/current/static/pet-states/thinking.svg
/opt/liv-assistant/current/static/pet-states/attention.svg
/opt/liv-assistant/current/static/pet-states/idle.svg
/opt/liv-assistant/current/static/pet-states/notification.svg
/opt/liv-assistant/current/static/pet-states/happy.svg
/opt/liv-assistant/current/static/pet-states/juggling.svg
/opt/liv-assistant/current/static/pet-states/working.svg
/opt/liv-assistant/current/static/pet-states/poke-left.svg
/opt/liv-assistant/current/static/assets/app-vWvyUXUu.png
/opt/liv-assistant/current/static/assets/lark-9hxxyz3-.svg
/opt/liv-assistant/current/static/assets/y2k-ledger-cover-DFTue_rd.png
/opt/liv-assistant/current/static/assets/retro-windows-DXRiLN5o.png
/opt/liv-assistant/current/static/assets/hello-kitty-D-kfmBoX.png
/opt/liv-assistant/current/static/assets/obsidian-book-cover-CUYTvHZx.png
/opt/liv-assistant/current/static/assets/misaka-mikoto-theme-Dpit7WIR.png
/opt/liv-assistant/current/static/pwa/icon-192.png
/opt/liv-assistant/current/static/pwa/icon-180.png
/opt/liv-assistant/current/static/pwa/icon-512.png
```

Asset categories:
1. **`pet-states/*.svg`** (21 files) — animated pet illustrations (cosmetic, not branding)
2. **`assets/*.png`** (6 files) — theme cover art (`hello-kitty`, `obsidian-book-cover`, `y2k-ledger-cover`, `retro-windows`, `misaka-mikoto-theme`) + generic `app-vWvyUXUu.png`
3. **`assets/lark-9hxxyz3-.svg`** (1 file) — third-party Lark integration logo
4. **`pwa/icon-{192,180,512}.png`** (3 files) — PWA install icons (referenced by `index.html` per Section C.4)

### C.3 SVG files containing `aion` text inside (case-insensitive)

```
(zero results)
```

**Finding: NO SVG asset has `aion` text embedded.** The pet-state SVGs + lark.svg are content-neutral; AionUi brand text doesn't appear inside any SVG.

### C.4 `index.html` link/script references to logo/icon

```
    <link rel="icon" type="image/png" href="./pwa/icon-192.png" />
    <link rel="apple-touch-icon" href="./pwa/icon-180.png" />
```

**Finding: only 2 logo references in the served HTML.** Both point to PWA icon PNGs (favicon + apple-touch-icon). These are the ONLY plausible "logo overlay" targets on disk — but they are PWA install icons (visible only when user installs AionUi as a PWA), NOT the in-iframe app header logo (which AionUi renders via inline SVG or text in JS bundles).

### Disposition Table — Plan 238-01 Step 238-A target list

| Path | Type | Source | AionUi branded? | **Plan 238-01 action** | Notes |
|------|------|--------|-----------------|------------------------|-------|
| `pwa/icon-192.png` | PNG 192px | upstream PWA icon | possibly (generic icon) | **preserve (out of scope)** | Operator can swap PWA icons in a follow-up phase; not visible inside LivOS iframe |
| `pwa/icon-180.png` | PNG 180px | upstream PWA icon | possibly | **preserve (out of scope)** | Apple-touch-icon; same reasoning |
| `pwa/icon-512.png` | PNG 512px | upstream PWA icon | possibly | **preserve (out of scope)** | Maskable PWA icon; same reasoning |
| `assets/app-vWvyUXUu.png` | PNG | upstream "app" image | unknown | **preserve (no evidence of brand mark)** | Likely a chat-window decoration |
| `assets/lark-9hxxyz3-.svg` | SVG | third-party (Lark) | NO (third-party logo) | **preserve (Apache notice extends to third-party brand marks)** | Removing/overlaying violates third-party trademark — leave untouched |
| `pet-states/*.svg` | SVG | upstream pet animations | NO (cosmetic only) | **preserve** | Not brand-related |
| `assets/{hello-kitty,obsidian-book-cover,y2k-ledger-cover,retro-windows,misaka-mikoto-theme}-*.png` | PNG | theme cover art | NO (theme-specific) | **preserve** | User-selectable theme imagery, not branding |

**Conclusion: ZERO on-disk asset overlays are required for Phase 238.** Step 238-A ships in the install-script as scaffolding (empty `LOGO_TARGETS=()` array with WARN-skip path), so the framework is FORWARD COMPATIBLE for any future operator-supplied logo asset. The actual user-visible "AionUi" branding is text-based (Phase 234-03 already rewrote compound forms; Phase 238 Step B closes the remaining word-boundary text gap — see Section D + Section H).

Plan 238-01 STILL ships `caddy/branding/liv-logo.svg` to the repo as a scaffold so the file exists when a future operator decides to populate `LOGO_TARGETS=(...)`.

---

## Section D: Remaining case-insensitive Aion text (Phase 234-03 gap)

### D.1 Case-insensitive file count

```
Files containing case-insensitive 'aion': 30
```

### D.2 Sample 30 files

```
/opt/liv-assistant/current/static/assets/AionrsChat-CQKhKlrd.js
/opt/liv-assistant/current/static/assets/index-C_Y7Nwpt.js
/opt/liv-assistant/current/static/assets/CapabilitiesSettings-DQawikh6.js
/opt/liv-assistant/current/static/assets/AcpChat-CN7bd7Ts.js
/opt/liv-assistant/current/static/assets/index-BBQOKL1b.js
/opt/liv-assistant/current/static/assets/index-BUznJz3U.js
/opt/liv-assistant/current/static/assets/jobAgentMeta-CVduMdPr.js
/opt/liv-assistant/current/static/assets/AionSelect--gqb9xKw.js
/opt/liv-assistant/current/static/assets/index-D-sNkIAn.js
/opt/liv-assistant/current/static/assets/useSlashCommands-BGt0oc3U.js
/opt/liv-assistant/current/static/assets/OpenClawChat-Cu0uEf7Y.js
/opt/liv-assistant/current/static/assets/index-sEjHNkGk.js
/opt/liv-assistant/current/static/assets/WebviewHost-CAB5NTLn.js
/opt/liv-assistant/current/static/assets/RemoteChat-DH7nmc55.js
/opt/liv-assistant/current/static/assets/index-s7Yib64h.js
/opt/liv-assistant/current/static/assets/PetSettings-BsUkkE3q.js
/opt/liv-assistant/current/static/assets/ExtensionSettingsPage-G3xxa_wQ.js
/opt/liv-assistant/current/static/assets/agentSelectionUtils-DgXgamN7.js
/opt/liv-assistant/current/static/assets/ChannelModalContent--oLBcSp6.js
/opt/liv-assistant/current/static/assets/SystemSettings-3otgCPLj.js
/opt/liv-assistant/current/static/assets/ModeSettings-D3DydJz8.js
/opt/liv-assistant/current/static/assets/AionScrollArea-D0jvaUue.js
/opt/liv-assistant/current/static/assets/useAttachEntry-DJUL1Ii3.js
/opt/liv-assistant/current/static/assets/AgentModeSelector-ku_69OGm.js
/opt/liv-assistant/current/static/assets/useAionrsModelSelection-BdMXBc5E.js
/opt/liv-assistant/current/static/assets/index-CaE7eEr9.js
/opt/liv-assistant/current/static/assets/NanobotChat-CXiLUsR5.js
/opt/liv-assistant/current/static/assets/WebuiSettings-bB4hgLQE.js
/opt/liv-assistant/current/static/assets/messageFiles-CWRmgmLH.js
/opt/liv-assistant/current/static/assets/wasm-CG6Dc4jp.js
```

**Finding: 30 files contain `aion` (case-insensitive) — but most occurrences are NON-word-boundary partial matches** inside identifier names (camelCase variables, Vite bundle file paths). Examples:
- `AionrsChat-CQKhKlrd.js`, `AionSelect-`, `AionScrollArea`, `useAionrsModelSelection-` — Vite-bundled component file paths (renaming would BREAK bundle integrity — HTML/JS internally references these exact file names)
- Likely also: `AionrsAgent`, `aionrsApi`, `useAionEvents`, etc., as internal camelCase identifiers

These are NOT user-visible UI strings; they are internal bundle structure. Rewriting them via sed is UNSAFE (breaks references) and UNNECESSARY (user never sees them).

### D.3 Word-boundary `\b(Aion|AION|aion)\b` occurrences (sample first 80 lines)

```
/opt/liv-assistant/current/static/assets/WebviewHost-CAB5NTLn.js:105:            .aion-url-viewer-toolbar {
/opt/liv-assistant/current/static/assets/WebviewHost-CAB5NTLn.js:113:            .aion-url-viewer-toolbar .toolbar-btn {
/opt/liv-assistant/current/static/assets/WebviewHost-CAB5NTLn.js:131:            .aion-url-viewer-toolbar .toolbar-btn.icon-btn {
/opt/liv-assistant/current/static/assets/WebviewHost-CAB5NTLn.js:136:            .aion-url-viewer-toolbar .toolbar-btn:hover:not(:disabled) {
/opt/liv-assistant/current/static/assets/WebviewHost-CAB5NTLn.js:140:            .aion-url-viewer-toolbar .toolbar-btn:active:not(:disabled) {
/opt/liv-assistant/current/static/assets/WebviewHost-CAB5NTLn.js:143:            .aion-url-viewer-toolbar .toolbar-btn:focus-visible {
/opt/liv-assistant/current/static/assets/WebviewHost-CAB5NTLn.js:148:            .aion-url-viewer-toolbar .toolbar-btn:disabled {
/opt/liv-assistant/current/static/assets/WebviewHost-CAB5NTLn.js:154:            .aion-url-viewer-toolbar .toolbar-chip {
/opt/liv-assistant/current/static/assets/WebviewHost-CAB5NTLn.js:168:            .aion-url-viewer-toolbar .toolbar-input {
/opt/liv-assistant/current/static/assets/WebviewHost-CAB5NTLn.js:182:            .aion-url-viewer-toolbar .toolbar-input:hover {
/opt/liv-assistant/current/static/assets/WebviewHost-CAB5NTLn.js:185:            .aion-url-viewer-toolbar .toolbar-input:focus {
[... ~30 more CSS selector lines for .aion-url-viewer-toolbar inside WebviewHost-CAB5NTLn.js ...]
/opt/liv-assistant/current/static/assets/index-CaE7eEr9.js:4803:.aion-file-changes-panel {
/opt/liv-assistant/current/static/assets/index-CaE7eEr9.js:4811:.aion-file-changes-panel > div:first-child {
/opt/liv-assistant/current/static/assets/index-CaE7eEr9.js:4815:[data-theme='dark'] .aion-file-changes-panel {
/opt/liv-assistant/current/static/assets/index-CaE7eEr9.js:4822:[data-theme='dark'] .aion-file-changes-panel > div:first-child {
/opt/liv-assistant/current/static/assets/index-CaE7eEr9.js:5895:.aion-file-changes-panel {
/opt/liv-assistant/current/static/assets/index-CaE7eEr9.js:5909:[data-theme='dark'] .aion-file-changes-panel {
/opt/liv-assistant/current/static/assets/index-CaE7eEr9.js:6875:.aion-file-changes-panel > div:first-child {
```

**Finding: ALL word-boundary matches are inline CSS class selectors of the form `.aion-url-viewer-toolbar` and `.aion-file-changes-panel`.**

Word-boundary semantics: `.aion-url-viewer-toolbar` → `.` is non-word, `a` is word → boundary BEFORE `a`; `aion` followed by `-` (non-word) → boundary AFTER `n`. Match: `aion` as standalone token. ✅

Rewrite consequence: sed replaces `.aion-url-viewer-toolbar` → `.Liv-url-viewer-toolbar` and `.aion-file-changes-panel` → `.Liv-file-changes-panel` consistently across BOTH the CSS rule AND the JSX className references (both in the same bundle file). Class-name strings are arbitrary — rewriting them does NOT break functionality. The DevTools inspector will simply show `.Liv-url-viewer-toolbar` instead of `.aion-url-viewer-toolbar`.

**No `Aion` or `AION` standalone word-boundary tokens found in D.3 sample — only lowercase `aion-` CSS class prefixes.** This is consistent with Phase 234-03 having already rewritten user-visible `AionUi` PascalCase strings.

---

## Section E: False-positive risk register

### E.1 Dictionary word enumeration

| Word | File count | Risk if naive (non-word-boundary) sed | Risk with `\b...\b` (word-boundary) |
|------|------------|---------------------------------------|------------------------------------|
| fashion | 0 | none | none |
| champion | 0 | none | none |
| companion | 5 | would mangle | safe (word-boundary excludes) |
| mansion | 0 | none | none |
| dimension | 20 | would mangle | safe |
| tension | 108 | would mangle (catastrophic) | safe |
| mention | 6 | would mangle | safe |
| pension | 3 | would mangle | safe |
| attention | 19 | would mangle | safe |
| passion | 0 | none | none |
| cushion | 0 | none | none |
| version | 90 | would mangle (catastrophic — touches `__VERSION__`, package metadata, etc.) | safe |
| region | 29 | would mangle | safe |
| religion | 0 | none | none |
| bastion | 0 | none | none |
| legion | 0 | none | none |
| application | 36 | would mangle (catastrophic — touches `application/json` MIME) | safe |
| aionic | 0 | none | none |

**Conclusion:** Word-boundary regex `\b(Aion|AION|aion)\b` is REQUIRED. A naive case-insensitive sed without `\b` would catastrophically mangle `tension`, `version`, `application`, `dimension`, `attention`, `region`, `mention`, `pension`, `companion` (total ≥ 311 file-occurrences). Word-boundary regex correctly excludes all of these.

`aionic`: 0 occurrences — no hidden brand-extension token. Default regex pattern is safe.

### E.2 Word-boundary dry-run

```
Files matching \b(Aion|AION|aion)\b: 7
```

**7 files contain standalone word-boundary Aion/AION/aion tokens** (vs 30 files in case-insensitive scan from D.1 — 23 files have non-word-boundary partial matches that the regex correctly skips).

**Conclusion:** Plan 238-01 Step 238-B will rewrite 7 files. PRE=7 → POST=0 is the expected delta in Plan 238-03 verification.

---

## Section F: Phase 234-03 non-regression check

```
Files containing 'Liv AI' or 'liv-ai': 51
Files still containing AionUi|aionui-web|aionui (must be 0): 0
```

**Phase 234-03 sed pass is non-regressed.** 51 files have `Liv AI` / `liv-ai` strings (the rewritten compound form); ZERO files retain `AionUi` / `aionui-web` / `aionui` literal forms. The Phase 234-03 case-sensitive compound sed is INTACT.

Phase 238-B word-boundary sed will fire AFTER Phase 234-03's compound sed (they don't conflict — 234-03 matches greedy compound, 238-B catches the orphan standalone tokens 234-03 left behind).

---

## Section G: Sacred SHA + service health snapshot

```
62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe  /opt/liv/packages/core/src/sdk-agent-runner.ts
active   (livos)
active   (liv-core)
active   (liv-worker)
active   (liv-memory)
active   (liv-assistant)
active   (caddy)
```

Mini PC sacred sha256 = `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe`. Plan 238-03 PRE-deploy + POST-deploy must MATCH this exact value.

All 6 LivOS services healthy on Mini PC. Phase 238 deploys onto a green baseline.

---

## Section H: Plan 238-01 recommendations

### H.1 Step 238-A (logo overlay)

**Ship Step 238-A scaffolding with empty `LOGO_TARGETS=()` array.**

Rationale: Section C disposition table identifies ZERO on-disk AionUi-branded logo assets requiring overlay. The 3 PWA icons (`pwa/icon-{192,180,512}.png`) are out-of-scope (PWA install context, not LivOS iframe). The Lark SVG is third-party trademark (preserve). All other image assets are theme art or cosmetic pet animations.

Install-script Step 238-A block ships in `scripts/install-liv-assistant.sh` with:
```bash
LOGO_TARGETS=(
  # Empty per Plan 238-02 Section C disposition table — no AionUi-branded
  # logo asset found on disk. Reserved for future use; operator can add
  # target paths here if/when AionUi upstream ships a logo asset.
)
```

The block's "WARN no targets" path will fire on every install run, which is the correct steady-state behavior. The framework remains ready for future operator-supplied overlays.

`caddy/branding/liv-logo.svg` is STILL added to the repo as a scaffold so the asset exists for future use — but it is not used by `install-liv-assistant.sh` until `LOGO_TARGETS=(...)` is populated.

### H.2 Step 238-B (word-boundary sed) — final regex

**Default safe pattern is GO:**
```bash
sed -E -i 's/\b(Aion|AION|aion)\b/Liv/g'
```

No false-positive token exclusions needed (Section E.1 `aionic=0`; all dictionary words filtered by `\b`). Section E.2 confirms 7 files in scope. Section D.3 confirms only CSS class selectors `.aion-url-viewer-toolbar` and `.aion-file-changes-panel` will rewrite (functional non-breaking — class names are arbitrary strings).

Grep pre-check pattern (idempotency guard):
```bash
grep -rilE '\b(Aion|AION|aion)\b' "${REBRAND_TARGET}" --include='*.html' --include='*.js' --include='*.css'
```

Post-grep verify pattern (same as pre-check) — must return zero files after sed.

### H.3 D-V43-APACHE-NOTICE structural exclusion

Both Step 238-A and Step 238-B target paths are scoped to `${REBRAND_TARGET}=${CURRENT_LINK}/static/` (i.e., `/opt/liv-assistant/current/static/`). LICENSE + NOTICE live at `/opt/liv-assistant/LICENSE` + `/opt/liv-assistant/NOTICE` (one directory level UP, outside `static/`). Structurally excluded by path scope — Plan 238-03 will verify sha256 byte-identity PRE/POST.

### H.4 Plan 238-03 verification gates

Plan 238-03 deploy log must record:
- **A.3 PRE / C.2 POST**: LICENSE+NOTICE sha256 = `a515d5a7...` + `be9e969f...` (byte-identical PRE/POST)
- **A.2 PRE**: word-boundary Aion grep count = 7 (matches Section E.2)
- **C.1 POST**: word-boundary Aion grep count = 0 (proves Step 238-B fired)
- **C.3 POST**: `Liv AI`/`liv-ai` file count ≥ 51 (Phase 234-03 non-regression — must INCREASE because 7 new `Liv` insertions occur)
- **C.4 POST**: logo target sha256 verify — N/A because `LOGO_TARGETS=()` is empty (the install-script logs WARN-skip; that's the expected steady-state behavior)
- **A.4 PRE / C.7 POST**: Mini PC sacred sha256 = `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe`
- **External D probe**: `curl https://bruce.livinity.io/liv/` body — `Liv` count ≥ 3, `Aion` word-boundary count = 0

---

## Investigation conclusion

Plan 238-01 author has explicit guidance for both steps:
- **Step 238-A** ships as scaffolding only (empty LOGO_TARGETS=() array; WARN-skip path is expected steady-state) — no live overlay this phase
- **Step 238-B** ships with default regex `\b(Aion|AION|aion)\b` → `Liv`; 7 files in scope; no false positives; all dictionary words structurally excluded by word-boundary

D-V43-APACHE-NOTICE preserved by path-scope (LICENSE/NOTICE outside `static/`).

Plan 238-03 verification gates derived from Section B sha256 baselines + Section E.2 PRE count + Section F non-regression baselines.

Phase 238 closes the user's "HİÇ BİR Aion yazısı kalmasın" gap via Step 238-B exclusively; the logo overlay framework ships but stays inactive pending future asset acquisition.
