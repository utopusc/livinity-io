---
phase: 271-liv-ai-agent-polish
verified: 2026-06-15T00:00:00Z
status: human_needed
score: 6/6 code-implementable must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: none
human_verification:
  - test: "Live-TTY auth-command correctness on the Mini PC (`bruce@10.69.31.68`)"
    expected: "For each installed CLI run its auth command in a real Terminal and confirm it STARTS the right flow (do NOT complete auth). Minimum: `claude` (paste-back prompt), `codex login --device-auth` (device code), `gemini auth login` (⚠ LOW-confidence — confirm subcommand exists, else first-run menu), `opencode auth login`, `cursor-agent login`."
    why_human: "Command correctness in a real TTY is the gold standard; auth.ts CLI_AUTH_COMMANDS is verified against upstream docs but the plan gates Task A `autonomous:false` — this requires the operator's live box and was NOT run autonomously."
  - test: "Deploy + UAT on the Mini PC (cut release tag → update.sh → SW-cache-clear)"
    expected: "In the Agents panel: the 9 previously-monogram CLIs render real brand logos (no monograms for the shipped ones); Install/Auth open the real Terminal with the corrected commands; the 3 console-noise lines (googleAuth.status / displays.getVncUrl 404 / favicon CORS) are quiet on a normal Liv AI load."
    why_human: "Requires deploying to the operator's live box, clearing the PWA service-worker cache, and visually/console-inspecting the running UI — none of which can be done autonomously."
  - test: "Live build gate `pnpm --filter @livos/config build && pnpm --filter ui build`"
    expected: "Build succeeds (the deploy gate). Repo-wide `tsc --noEmit` is broken at baseline (~3771 pre-existing errors); the UI edits were verified via stash-diff to introduce ZERO new type errors, but a clean isolated typecheck isn't obtainable — the build is the real gate and runs at deploy time."
    why_human: "Full UI build was not run in this verification env; it is the operator's deploy-time gate."
---

# Phase 271: Liv AI agent polish Verification Report

**Phase Goal:** Close the three post-v44.22 follow-ups for the Liv AI "Agents" surface — (A) a VERIFIED per-CLI Terminal install+auth command matrix (drift-locked UI mirror ↔ server source of truth), (B) real brand logos for the 9 monogram agents, (C) cleanup of the 3 console-noise lines.
**Verified:** 2026-06-15
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (must_haves)

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Every one of the 20 SUPPORTED_CLIS has a documented, source-cited correct install + auth command (or "no standalone auth") in 271-AUTH-MATRIX.md | ✓ VERIFIED | `271-AUTH-MATRIX.md` table has exactly 20 CLI rows (grep count = 20), each with install cmd, auth cmd, auth type, confidence, and an upstream source URL column |
| 2 | `use-cli-auth-bridge.ts` CLI_AUTH_COMMANDS byte-consistent in intent with server `auth.ts` CLI_AUTH_COMMANDS (drift-lock holds) | ✓ VERIFIED | All 16 mirrored keys map identically: claude-code `['claude',[]]`→`'claude'`, codex `['codex',['login','--device-auth']]`→`'codex login --device-auth'`, openclaw `['openclaw',['onboard']]`→`'openclaw onboard'`, +13 others. The 4 null server entries (aion-cli/mistral-vibe/nanobot/snow-cli) correctly have no terminal-fallback string. Triad also agrees with `auth-methods.ts` loginArgv |
| 3 | Binary-name mismatches reconciled so detection + Terminal command agree with installed binary | ✓ VERIFIED | Research found the suspicions unfounded and documented the correct reconciliation: `CLI_BIN_NAMES['cursor-agent']='cursor-agent'` (dual symlink), `CLI_BIN_NAMES['kimi-cli']='kimi'` (kimi-cli = pkg name, kimi = binary). kiro flagged for future reconciliation (installer unverified). Intent met via documented KEEP decision |
| 4 | ≥7 of the 9 monogram CLIs render a real brand SVG (rest documented as monogram-by-choice, no wrong/placeholder) | ✓ VERIFIED (exceeded) | All 9 shipped (auggie, codebuddy, droid, hermes, kiro, nanobot, openclaw, qodercli, snow — dated Jun 15). Directory now has 19 brand SVGs; every CLI_META `logo:` value (19, all but aion-cli) resolves to an existing `<name>.svg` (0 orphaned references) |
| 5 | The 3 console-noise items each fixed OR documented won't-fix-here; googleAuth.status no longer logs on normal load | ✓ VERIFIED | (1) googleAuth.status string ABSENT repo-wide in `livos/packages/` → confirmed vendored-AionUi-internal, won't-fix-here documented. (2) displays.getVncUrl — `isValidDisplayId()` regex guard added in `x11-display-stream-window.tsx` so the mutation never fires malformed on load. (3) favicon CORS — `isNoCorsFaviconSrc()` short-circuits no-ACAO hosts (google.com/antigravity.google/gstatic.com) to 'blocked' without a canvas read in `launcher-icon.tsx` |
| 6 | `node --check scripts/aionui-patches/local-agents-install-section.js` passes | ✓ VERIFIED | Ran it → `NODE_CHECK_PASS` |

**Score:** 6/6 code-implementable must-haves verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `271-AUTH-MATRIX.md` | 20-CLI verified install+auth matrix | ✓ VERIFIED | 20 rows, per-row source + confidence; changes (codex, openclaw) + drift fix (claude-code) documented; binary-name reconciliation section present |
| `cli-installer/auth.ts` | codex/openclaw corrected, drift-locked | ✓ VERIFIED | codex `['login','--device-auth']`, openclaw `['onboard']`, claude-code `['claude',[]]` — all with 271-A rationale comments |
| `hooks/use-cli-auth-bridge.ts` | UI mirror byte-consistent | ✓ VERIFIED | claude-code/codex/openclaw strings match server; 16 keys consistent |
| `cli-installer/auth-methods.ts` | loginArgv mirrors auth.ts | ✓ VERIFIED | codex/openclaw/claude-code loginArgv agree (triad complete) |
| `public/agent-logos/*.svg` (9 new) | 9 brand SVGs | ✓ VERIFIED | auggie, codebuddy, droid, hermes, kiro, nanobot, openclaw, qodercli, snow all present |
| `scripts/aionui-patches/local-agents-install-section.js` | 9 logo: keys set | ✓ VERIFIED | 19 logo: refs, all resolve; node --check passes |
| `x11-display-stream-window.tsx` | getVncUrl guard | ✓ VERIFIED | isValidDisplayId() gate on triggerResolve |
| `launcher-icon.tsx` | favicon CORS short-circuit | ✓ VERIFIED | NO_CORS_FAVICON_HOSTS + isNoCorsFaviconSrc() pre-analysis skip |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `use-cli-auth-bridge.ts` CLI_AUTH_COMMANDS | `auth.ts` CLI_AUTH_COMMANDS | drift-lock (string ↔ argv) | ✓ WIRED | 16/16 mirrored keys byte-consistent |
| `auth.ts` CLI_AUTH_COMMANDS | `auth-methods.ts` loginArgv | mirror comment | ✓ WIRED | claude-code/codex/openclaw all agree |
| `local-agents-install-section.js` CLI_META `logo:` | `public/agent-logos/<name>.svg` | logoCandidates() → `/agent-logos/` | ✓ WIRED | 19/19 logo refs resolve to real files |
| `x11-display-stream-window.tsx` | `displays.getVncUrl` tRPC route | guarded mutate | ✓ WIRED | route exists/mounted; client guarded so no malformed-on-load 404 |

### Anti-Patterns Found

None blocking. The `null` entries in server CLI_AUTH_COMMANDS (aion-cli, mistral-vibe, nanobot, snow-cli) are EXPLICIT-UNSUPPORTED markers (documented, drift-lock-tested), not stubs. The favicon 'blocked' short-circuit is the intended fix, not a swallowed error.

### Requirements Coverage

Plan declares `requirements: []` — no REQUIREMENTS.md IDs mapped to this phase. N/A.

### Human Verification Required

This phase is `autonomous: false`. The code-implementable work is complete and verified (6/6 must-haves), but three items are inherently operator-gated and were NOT run autonomously:

1. **Live-TTY auth-command correctness** — run each auth command for the installed CLIs on the Mini PC and confirm it starts the right flow (Task A's "LIVE-verified ✓ for the 5 installed CLIs" acceptance criterion). `gemini auth login` is flagged LOW-confidence and most needs the live check.
2. **Deploy + UAT** — cut release tag, deploy via update.sh, SW-cache-clear, confirm 9 logos render + Install/Auth Terminal commands + quiet console in the running Agents panel.
3. **Live build gate** — `pnpm --filter @livos/config build && pnpm --filter ui build` at deploy time (repo-wide tsc is broken at baseline; UI edits add zero new type errors per stash-diff, but the build is the real gate).

### Gaps Summary

No code-implementable gaps. All six code must-haves are met: the 20-row sourced matrix exists, the drift-lock triad is byte-consistent, all 9 brand logos shipped (exceeding the ≥7 floor) with zero orphaned references, the 3 console-noise items are each fixed-or-documented, and `node --check` passes. The only outstanding work is the live-TTY/deploy/build verification, which requires the operator's box — hence `human_needed`, not `gaps_found`. If live-TTY finds a wrong auth command, the closure is to correct BOTH `auth.ts` and the UI mirror together (drift-lock) and re-verify.

---

_Verified: 2026-06-15_
_Verifier: Claude (gsd-verifier)_
