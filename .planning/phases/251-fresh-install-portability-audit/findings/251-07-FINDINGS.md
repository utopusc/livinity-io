# 251-07 — Terminal Hot-Fixes (Phase 246) Portability Findings

**Dimension:** Does the LivOS desktop terminal panel (the four 246-hotfixes + the 243 base it sits on)
work end-to-end on a **brand-new** install via the real entrypoint — build + runtime + feature-flag + auth?
**Mode:** READ-ONLY audit (D-251-READONLY). Evidence = repo file:line + installer script:line.
**Date:** 2026-05-29

---

## Verdict (TL;DR)

**The terminal panel BUILDS cleanly on a fresh box, the WS route + Caddy matcher are stable, the WS hook
has NO hardcoded host, and the WebGL addon is correctly pinned + lockfile-present. BUT the panel will NOT
actually open a shell on a fresh install for TWO reasons:**

1. **GAP / BLOCKER (NEW-this-session):** the PTY spawns via `sudo --user bruce --login bash`
   (`session.ts:103` + argv `82-89`), and the installer's `sudoers.d/livinityd` grants **no** Cmnd_Alias for
   `bash` / a login shell. Under `livos.service` (`User=bruce`) this is a `bruce → bruce` self-`sudo` that
   will **prompt for a password it can never supply** → PTY spawn throws → `{type:'error'}` → no shell.
2. **GAP (intentional but undocumented for fresh box):** the feature flag `livos:v43:terminal_panel`
   defaults **OFF** (`feature-flag.ts:28-33`, only the literal `'true'` opens it) and is **seeded nowhere**
   in `scripts/install/` — so the dock entry is hidden on a fresh box until the operator manually sets the
   Redis key. The WS route also `ws.close(4403,'feature disabled')` until then.

Everything else (build chain, route, Caddy, WS host, cookie auth) is **COVERED**.

---

## Per-item findings

| # | Item | Status | Evidence | Class |
|---|------|--------|----------|-------|
| a | `@xterm/addon-webgl` install/build | **COVERED** | `ui/package.json:75` exact-pin `"@xterm/addon-webgl": "0.18.0"`; `pnpm-lock.yaml:821-823` importer entry + `:8393` package entry + `:27154` resolution `0.18.0(@xterm/xterm@5.5.0)`. Sibling addons `addon-fit`/`addon-web-links`/`xterm` all in deps (`:73-76`). `pnpm install` during deploy WILL pull it; UI vite build resolves the static `import {WebglAddon} from '@xterm/addon-webgl'` (`PersistentTerminalPanel.tsx:23`). Runtime WebGL2 unavailability is handled (`try/catch` at `:311-323` → DOM-renderer fallback). | COVERED |
| b | WS route path stable + Caddy-served | **COVERED** | livinityd mounts `/livos/terminal/ws` (`server/index.ts:1393`) + a dedicated upgrade branch routes it straight to `handleUpgrade` bypassing the generic `?token=` gate (`index.ts:1099-1110`). Caddy emits `@livos_terminal_ws path /livos/terminal/ws` **unconditionally** in apex + wildcard blocks (`caddy.ts:453`, drift-locked by `caddy.test.ts:1010,1080`), reverse-proxying → `127.0.0.1:8080`. No Referer gate (RFC 6455). Stable on fresh install. | COVERED |
| c | Feature flag default | **GAP (intentional, undocumented for fresh box)** | `feature-flag.ts:28-33` returns enabled ONLY when `livos:v43:terminal_panel === 'true'`; missing key ⇒ OFF. `grep -rl terminal_panel scripts/` ⇒ only `scripts/close-v44-when-uat-green.sh` (a UAT script), **no install-time seed**. So on a fresh box the dock entry is hidden (`config.getTerminalPanelEnabled` returns false) AND the WS closes `4403 'feature disabled'` (`ws-handler.ts:281-284`). Operator must `redis-cli set livos:v43:terminal_panel true` by hand. | GAP |
| d | PTY `username:'bruce'` dependency | **GAP / BLOCKER** | Handler forces `username:'bruce'` (`ws-handler.ts:466`); `session.ts:77-80` throws on non-bruce (D-243-NO-ROOT). Spawn is `sudo --user bruce --login bash -c <motd>` (`session.ts:82-103`). `bruce` user IS created by `bruce-user-bootstrap.sh:34-36` (`useradd -m -s /bin/bash bruce`) ✓. **BUT** `sudoers.d/livinityd` (lines 46/53) grants Runas-bruce NOPASSWD only for `LIVINITYD_LAUNCH_CHROME / GOOGLE_CHROME / XVFB / X11VNC / XDOTOOL` — there is **no Cmnd_Alias for `/bin/bash` / `/usr/bin/sudo --login bash`**. Under `livos.service` `User=bruce` (`test-systemd-user-bruce.sh:28-35` asserts `User=bruce`), the spawn is a `bruce→bruce` self-`sudo` that will **prompt for a password** → fail. This is the terminal-feature manifestation of the 251-04 PTY-user dimension (cross-ref; not duplicating the fix). | GAP |
| e | Hardcoded WS host in `use-terminal-ws.ts` | **COVERED (no hardcode)** | `buildTerminalWsUrl()` (`use-terminal-ws.ts:61-74`) derives protocol from `window.location.protocol`, host from `window.location.hostname`, port from `window.location.port`. **No literal `bruce.livinity.io`, no literal port, no env baked in.** Fully relative — portable to any host/domain. | COVERED |

### Supporting runtime/auth notes (COVERED)

- **node-pty build dep present**: `livinityd/package.json:123` `"node-pty": "^1.0.0"` — the prebuilt-binary
  install happens during deploy `pnpm install`; the spawn factory uses it (`session.ts:45`). COVERED for
  build, but its runtime success is gated by item (d)'s sudoers gap.
- **Cookie auth portable**: Gate 1 reads `LIVINITY_PROXY_TOKEN` cookie + `verifyProxyToken`
  (`ws-handler.ts:243-267`); the 2026-05-29 hot-fix correctly resolves the boolean-`true` payload to the
  admin user via `getAdminUser()` (`ws-handler.ts:303-325`) — no hardcoded identity. COVERED.
- **httpOnlyPaths hot-fix portable**: `config.getTerminalPanelEnabled` forced HTTP (`common.ts:732-737`)
  so the dock entry survives WS hang — pure routing config, box-agnostic. COVERED.

---

## Does the terminal panel work on a fresh box?

**No — not without two manual steps**, even though the code + build are correct:

1. **Sudoers gap (BLOCKER):** add a Cmnd_Alias permitting `bruce` to `sudo --user bruce --login bash`
   (NOPASSWD), OR change the PTY spawn to not self-`sudo` when livinityd already runs as bruce. Without
   this the panel renders, connects, then immediately surfaces `{type:'error', message:'spawn failed'}`.
2. **Feature-flag seed (UX BLOCKER):** the dock entry is hidden until `livos:v43:terminal_panel='true'`.
   A fresh box never sets it. Either seed it in `env-seed.sh`/`deploy-livinityd.sh`, or document the
   operator step.

The build chain (WebGL addon pin + lockfile + node-pty), the WS route, the Caddy matcher, the WS-host
derivation, and the cookie auth are all **portable and correct** — the gaps are runtime-privilege +
feature-enablement, not build or hardcode.

---

## Remediation items (for the Wave-2 backlog)

| ID | Item | Fix | File:line | Severity | Effort |
|----|------|-----|-----------|----------|--------|
| R-251-07-A | PTY self-`sudo` to bash has no sudoers grant | Add `Cmnd_Alias LIVINITYD_PTY_BASH = /usr/bin/sudo --user bruce --login bash *` + Runas-bruce NOPASSWD line (or drop the self-`sudo` since livinityd IS bruce) | `sudoers.d/livinityd:46-53` ⇄ `session.ts:103` | **HIGH (blocker)** | S (one sudoers line) or M (refactor spawn) |
| R-251-07-B | `livos:v43:terminal_panel` never seeded on fresh install | Seed `'true'` (or document) at install time | `env-seed.sh` / `deploy-livinityd.sh` ⇄ `feature-flag.ts:22` | MED (feature hidden) | S |

*(R-251-07-A overlaps the 251-04 PTY-user dimension; defer dedup to the synthesis plan.)*
