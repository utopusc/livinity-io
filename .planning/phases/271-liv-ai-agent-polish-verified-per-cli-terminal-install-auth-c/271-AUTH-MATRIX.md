---
phase: 271
task: 271-01-A
title: Verified per-CLI install + auth command matrix (drift-locked)
status: code-corrected; live-TTY verification PENDING (operator, Mini PC)
generated: 2026-06-15
sources_of_truth:
  - livos/packages/livinityd/source/modules/cli-installer/auth.ts (CLI_AUTH_COMMANDS — what authCli spawns)
  - livos/packages/livinityd/source/modules/cli-installer/auth-methods.ts (CLI_AUTH_METHODS.loginArgv + branch + apiKeyEnv)
  - livos/packages/livinityd/source/modules/cli-installer/install-scripts.ts (SUPPORTED_CLIS, CLI_BIN_NAMES)
  - scripts/install/cli/<name>.sh (the actual install command per CLI)
ui_mirror: livos/packages/ui/src/hooks/use-cli-auth-bridge.ts (CLI_AUTH_COMMANDS — Terminal fallback strings)
---

# Phase 271 Task A — Per-CLI Install + Auth Command Matrix

Verified against **official upstream docs** (vendor docs / official GitHub README / npm) and the actual repo files. Conservatism rule applied: a shipped command was changed **only** where an authoritative upstream source clearly contradicted it; everything else is KEEP-AS-IS (some marked LOW confidence → needs live TTY verification on the Mini PC).

## Matrix

| CLI key | install (pkg → binary) | detector binary | auth command (post-271) | auth type | conf. | upstream source |
|---|---|---|---|---|---|---|
| claude-code | `curl claude.ai/install.sh` → `claude` | `claude` | `claude` (bare) | paste-back device-code | HIGH | github.com/anthropics/claude-code |
| opencode | `curl opencode.ai/install` → `opencode` | `opencode` | `opencode auth login` | interactive provider login | HIGH | opencode.ai/docs/cli |
| gemini | `npm i -g @google/gemini-cli` → `gemini` | `gemini` | `gemini auth login` | KEEP (first-run menu / API key) | **LOW — live-verify** | google-gemini.github.io/gemini-cli |
| openclaw | `install-openclaw-cli.sh` → `openclaw` | `openclaw` | `openclaw onboard` ⟵ **changed** | onboarding login wizard | MED-HIGH | docs.openclaw.ai/cli/onboard |
| aion-cli | `@aion-ai/cli` (unverified) → `aion` | `aion` | `null` (no standalone login) | n/a (AionUi embedded) | HIGH | repo note |
| codex | `npm i -g @openai/codex` → `codex` | `codex` | `codex login --device-auth` ⟵ **changed** | device-code (headless) | HIGH | developers.openai.com/codex/auth |
| qwen-code | `npm i -g @qwen-code/qwen-code` → `qwen` | `qwen` | `qwen auth` | interactive selector | HIGH | qwenlm.github.io/qwen-code-docs |
| augment | `npm i -g @augmentcode/auggie` → `auggie` | `auggie` | `auggie login` | browser OAuth | HIGH | docs.augmentcode.com/cli |
| github-copilot | `npm i -g @github/copilot` → `copilot` | `copilot` | `copilot` (bare TUI → `/login`) | device | HIGH | github.com/github/copilot-cli |
| codebuddy | `npm i -g @tencent-ai/codebuddy-code` → `codebuddy` | `codebuddy` | `codebuddy` (bare → login) | apikey/login | HIGH | codebuddy.ai/docs/cli |
| qoder-cli | `npm i -g @qoder-ai/qodercli` → `qodercli` | `qodercli` | `qodercli` (bare → `/login`) | device | HIGH | docs.qoder.com/en/cli |
| goose | `download_cli.sh` → `goose` | `goose` | `goose configure` | provider+auth wizard | HIGH | block/goose docs |
| factory-droid | `curl app.factory.ai/cli` → `droid` | `droid` | `droid login` | browser OAuth | HIGH | docs.factory.ai/reference/cli-reference |
| cursor-agent | `curl cursor.com/install` → `agent`+`cursor-agent` (dual) | `cursor-agent` | `cursor-agent login` | apikey/browser | HIGH | cursor.com/docs/cli |
| kimi-cli | `curl code.kimi.com/install.sh` → `kimi` | `kimi` | `kimi login` | device-code (RFC-8628) | HIGH | kimi.com/code/docs |
| mistral-vibe | `curl mistral.ai/vibe/install.sh` → `vibe` | `vibe` | `null` (api-key only → setApiKey) | apikey (MISTRAL_API_KEY) | HIGH | docs.mistral.ai/mistral-vibe |
| hermes-agent | NousResearch `install.sh` → `hermes` | `hermes` | `hermes setup --portal` | device portal (+ api-key) | HIGH | hermes-agent.nousresearch.com/docs |
| nanobot | `pip install --user nanobot-ai` → `nanobot` | `nanobot` | `null` (api-key/config) | apikey | MED | github.com/nanobot-ai/nanobot |
| snow-cli | git clone `MayDay-wpf/snow-cli` → `snow` | `snow` | `null` (TUI first-run config) | apikey | MED | github.com/MayDay-wpf/snow-cli |
| kiro | installer UNVERIFIED → `kiro-cli` | `kiro` | `kiro-cli login` | device (Builder ID/Google/GitHub) | HIGH (cmd) / LOW (detector binary) | kiro.dev/docs/cli |

## Changes applied (this phase)

Only **2** commands were upstream-contradicted; both also resolved a latent inconsistency where `auth.ts` (what actually spawns) disagreed with `auth-methods.ts` `loginArgv` (the documented mirror):

1. **codex** — `['codex', ['auth','login']]` → `['codex', ['login','--device-auth']]`. `codex auth login` is not a real subcommand; `codex login` is the verified login, and `--device-auth` is the headless/SSH-correct variant (the LivOS box has no localhost browser callback). Source: developers.openai.com/codex/auth.
2. **openclaw** — `['openclaw', ['auth','login']]` → `['openclaw', ['onboard']]`. No top-level `openclaw auth login` exists (auth subcmds are nested under `openclaw infer auth …`); `openclaw onboard` is the canonical first-run login. Source: docs.openclaw.ai/cli/onboard.

Plus a **UI-mirror drift fix** (no behavior change server-side): `use-cli-auth-bridge.ts` had `claude-code: 'claude auth login'` while the server spawns bare `['claude', []]` (paste-back). The Terminal-fallback string is now `'claude'`, byte-consistent with the server. codex/openclaw mirror strings updated to match the two changes above.

Files touched: `auth.ts` (codex, openclaw + comments), `use-cli-auth-bridge.ts` (claude-code, codex, openclaw mirror strings). No `install-scripts.ts` change (see binary-name notes below).

## Binary-name reconciliation

- **cursor-agent** — NO change. The `cursor.com/install` script creates a dual symlink (`agent` + `cursor-agent`); `CLI_BIN_NAMES['cursor-agent'] = 'cursor-agent'` is correct and `cursor-agent login` is the same binary as `agent login`. The earlier suspicion that the binary is `cursor` was not borne out.
- **kimi-cli** — NO change. The install drops a `kimi` shim; `CLI_BIN_NAMES['kimi-cli'] = 'kimi'` and `kimi login` are both correct. `kimi-cli` is the package name, not the binary.
- **kiro** — FLAGGED (not changed). The detector probes `kiro` while the auth command + upstream docs use `kiro-cli`. The Kiro installer is currently UNVERIFIED/fails-closed, so the real on-disk binary name is unknown. Reconcile to whatever the installer actually drops (likely `kiro-cli`) **once a verified installer exists** — confirm via live TTY.

## Drift-lock status (post-271)

- `auth.ts CLI_AUTH_COMMANDS` ↔ `auth-methods.ts loginArgv`: now agree for claude-code, codex, openclaw (previously codex/openclaw disagreed).
- `use-cli-auth-bridge.ts CLI_AUTH_COMMANDS` (UI Terminal-fallback) ↔ `auth.ts`: byte-consistent for all 16 mirrored keys (claude-code fixed).
- Tests unaffected: `auth.test.ts` Test 14 (20-key shape, null set, cursor-agent pin) and `auth-methods.test.ts` claude-code mirror test all still hold (no test pins codex/openclaw argv).

## LIVE-TTY VERIFICATION — PENDING (operator, `bruce@10.69.31.68`)

Code is corrected against docs, but command correctness in a real TTY is the gold standard and was **not** run autonomously (the plan gates Task A `autonomous:false`). Operator should, on the Mini PC, run each command for the installed CLIs and confirm it starts the right flow (do NOT complete auth):

- **Required minimum (installed CLIs):** `claude` (expect paste-back prompt), `codex login --device-auth` (expect device code), `gemini auth login` (⚠ LOW-confidence — confirm the subcommand exists, else fall back to first-run menu), `opencode auth login`, `cursor-agent login`.
- **If installed:** `openclaw onboard`, `qwen auth`, `auggie login`, `droid login`, `goose configure`, `kimi login`, `copilot` (then `/login`).
- Record ✓/✗ per CLI; any ✗ → open a 271 gap to correct both `auth.ts` and the UI mirror together.
