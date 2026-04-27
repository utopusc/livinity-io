# Backlog

Captured ideas that aren't yet scheduled into a milestone. Promote with `/gsd-review-backlog` (or by hand) when ready.

> **Phase 30 status note (2026-04-26 round 10):** Phase 30 closed via 10 hot-patch
> rounds. r9 added in-memory cache for GitHub rate limit (60/hr unauth → ~2/hr
> actual). r10 added graceful empty-stub fallback for cold-start cache misses
> during rate-limit windows. Future hot-patches should NOT re-introduce throws
> on cache miss — silent fallback is the contract.

---

## 999.5 — `update.sh` build-step silent failure (CRITICAL — recurring)

**Captured:** 2026-04-26 (Phase 30 round 10 + post-30 round 11 UI deploy)
**Source:** Multiple deploys produced `[OK]    @livos/config built` and
`[OK]    Nexus core built` log lines but the actual `dist/` directories
were empty afterward. Symptoms cascade:
- livinityd boots → `Cannot find module @livos/config/dist/index.js` → crash
- livinityd boots → `Cannot find module @nexus/core/dist/lib.js` → crash
- Service stays in activating loop, user sees blank UI

Workaround (verified working): SSH to Mini PC and manually re-run
the same builds:
```
cd /opt/livos && sudo pnpm --filter @livos/config build
cd /opt/livos && sudo pnpm --filter ui build
cd /opt/nexus && sudo npm run build --workspace=packages/core
```
Then sync the nexus dist into pnpm-store and restart livos. After the
manual builds, `dist/` directories are populated correctly.

This means the update.sh build step exits with success markers but the
underlying `tsc` either skips emit or writes to a different location.
Possible causes:
- `tsc --noEmit` somewhere in the pipeline (unlikely — package.json
  scripts look correct)
- Cwd or ENV difference between update.sh's invocation and an interactive
  shell
- Race with a previous still-running update.sh leaving a lock file
- pnpm-lock.yaml drift causing dependencies-not-resolved silent skip

**Where to investigate:** /opt/livos/update.sh "Building packages" section.
Add `set -euo pipefail` at script top + verify each `dist/` exists after
its build step. Bail loudly if any expected output is missing.

**Severity:** CRITICAL — every UI-only deploy currently requires manual
SSH intervention. This is what's been causing the "still missing" state
across multiple Phase 30 rounds.

---

## 999.5b — (former) `update.sh` pnpm-store dist-copy idempotency

**Captured:** 2026-04-26 (during Phase 30 round 10 deploy)
**Source:** Mini PC livinityd crash post-deploy: `Cannot find module @nexus/core/dist/lib.js`
**Why:** `update.sh` builds nexus core but the pnpm-store dist-copy step
sometimes leaves the symlinked `@nexus/core/dist/` empty. livinityd then
fails to import on next start.

**Workaround:** SSH to Mini PC, manually `cp -r /opt/nexus/packages/core/dist /opt/livos/node_modules/.pnpm/@nexus+core*/node_modules/@nexus/core/dist` then restart livos.service.

**Where:** `update.sh` "Building Nexus core" + "Nexus dist linked to pnpm store" sections — make the copy step:
- detect missing dist target after copy and fail loudly
- be idempotent (force-overwrite)
- handle multi-version pnpm store (loop over all `@nexus+core*` dirs, not just first)

---

## 999.6 — `system.update` mutation: UI click → backend silent failure

**Captured:** 2026-04-26 (during Phase 30 UAT)
**Source:** User clicked "Install Update" in modal. UpdatingCover appeared briefly. Backend logs show ZERO `system.update` mutation entries. `.deployed-sha` was not advanced. Update.sh never spawned.
**Why:** Likely tunnel WS instability ("socket hang up" errors after restart) blocking the HTTP-path mutation, OR client-side `update()` silently dropped (mutation `onError` not surfaced). The user sees the modal flicker close, the UpdatingCover disappear within seconds, and no actual update happens — but no toast/error is surfaced either.

**Where:**
- `livos/packages/ui/src/providers/global-system-state/update.tsx` — `useUpdate` should expose mutation error state and toast it
- `livos/packages/ui/src/components/update-confirm-modal.tsx` — confirm modal should disable Install Update button while mutation is pending; on `onError` show a toast
- Backend tunnel resilience — investigate why `socket hang up` recurs after livos restart (probably liv-core or tunnel agent dependency ordering in systemd)

**Repro:** Trigger a livinityd restart (`systemctl restart livos`). Wait for tunnel reconnect (~5s). Immediately click Install Update from desktop card. Mutation may be lost in transit; UI should detect and retry/toast.

**Estimate:** 1-2 hours — UI mutation error surfacing is small; tunnel-stability investigation is the bigger half.

---

---

## 999.1 — Software Update sidebar badge

**Captured:** 2026-04-26 (during Phase 30 manual UAT)
**Source:** User feedback after Phase 30 deploy + browser test on Mini PC
**Why:** Phase 30 added a desktop bottom-right `<UpdateNotification />` card. The Settings dock icon also gets a notification count badge via `useSettingsNotificationCount`. But once inside Settings, the **sidebar** menu item for "Software Update" has no red badge — so the user can land on Settings and not immediately see which sub-page has the pending action.

**What:** Add a red dot/count badge to the Settings sidebar's "Software Update" menu row when `system.checkUpdate.available === true`.

**Where:**
- `livos/packages/ui/src/routes/settings/_components/sidebar.tsx` (or wherever the sidebar nav lives)
- Hook off the same `useSoftwareUpdate()` available state

**Estimate:** 1 small plan, ~30 min.

---

## 999.2 — RESOLVED (Phase 30 hot-patch r4 + r6)

The card's "Update" button (round 4) and the Settings list-row "View" button (round 6) both open `<UpdateConfirmModal />` directly now. The `/settings/software-update/confirm` route still exists for direct deep-links but no in-app surface routes through it.

---

## 999.2 — (was) `/settings/software-update/confirm` → modal/dialog UX

**Captured:** 2026-04-26 (during Phase 30 manual UAT)
**Source:** User feedback ("buralara yonlendirmesin" — referring to the Update button navigating to a separate route)
**Why:** Phase 30's `<UpdateNotification />` card "Update" button navigates the user to the existing `/settings/software-update/confirm` route, which opens a dialog inside the Settings shell. User would prefer the confirm step to be an inline dialog/modal that opens *over* the desktop without changing routes — more like a system alert than a settings page detour.

**What:** Convert the confirm step from a route-based dialog to an in-place modal that opens on top of the desktop. The Update button should trigger the modal directly rather than navigating away.

**Where:**
- `livos/packages/ui/src/components/update-notification.tsx` — replace `navigate('/settings/software-update/confirm')` with a local modal trigger
- `livos/packages/ui/src/routes/settings/software-update-confirm.tsx` — extract the dialog body into a reusable component or expose a portal-mounted version
- Possibly keep the settings route as a fallback for direct navigation

**Estimate:** 1 plan, ~1 hour. Some risk: the existing confirm dialog uses `useSettingsDialogProps` which is settings-shell-coupled.

**Trade-off:** The user is currently used to the settings-shell flow. Changing this may surprise users who navigated to settings looking for it. Consider supporting both paths.

---

## 999.3 — "Updating to {shortSha}" title truncation in ProgressLayout

**Captured:** 2026-04-26 (during Phase 30 manual UAT round 1)
**Source:** User feedback — "Updating to e6d2b95 bu yazi da gozukmuyor tam olarak"
**Why:** During an active update the BarePage UpdatingCover renders "Updating to {shortSha}" via `BareLogoTitle` (`<h1>` with `text-24/sm:text-36`). The user reports the title is not fully visible.

**Where:** `livos/packages/ui/src/modules/bare/shared.tsx` (BareLogoTitle, line 8) or `livos/packages/ui/src/modules/bare/progress-layout.tsx` (line 40 title prop). Likely a CSS overflow / line-height issue on smaller viewports or with longer version labels (after round 5, labels can be `v28.0.1+ac37903`, longer than a 7-char shortSha).

**Estimate:** 30 min — likely a `truncate` / `break-words` CSS tweak.

---

## 999.4 — Docker app first-click "Something went wrong"

**Captured:** 2026-04-26 (during Phase 30 manual UAT)
**Source:** User mid-UAT note — "Docker'a tıkladığımda Something went wrong, kapatıp tekrar açıyorum sorun gidiyor"
**Why:** Pre-existing pre-Phase-30 bug. First-click on Docker dock icon shows error overlay; closing and re-opening the window resolves it. Likely a hydration / race condition between WindowManager mount and Docker app's tRPC queries needing an established WS connection.

**Where:** Investigate `livos/packages/ui/src/modules/desktop/dock.tsx` window-open handler vs. `routes/docker/*` mount lifecycle and `useTrpcConnection` state.

**Estimate:** 1-2 hours of investigation — could be Suspense boundary tuning, query enabled gate, or window-mount delay.

---

## 999.7 — Factory Reset (one-click wipe + reinstall) in Settings

**Captured:** 2026-04-26 (mid-Phase-32 user pivot, after Mini PC SSH apply succeeded)
**Source:** Direct user request — "fabrika ayarlarına sıfırla" button in Settings, single-click wipes the host and reinstalls fresh from `https://livinity.io/install.sh` with the user's existing Livinity API key (so the reinstalled host re-pairs with the same identity, no re-onboarding).

**Why:** Currently a broken Mini PC has no clean recovery path other than full SSH wipe + manual reinstall. A one-click factory reset would let the user recover from a corrupted state (failed migrations, stuck containers, ratlocked configs, etc.) without leaving the dashboard. Phase 32's auto-rollback handles the "deploy went bad" case; this handles the "host went bad" case.

**Behavior (UX):**
1. Settings > Advanced > "Factory Reset" button (red, with shield/warning icon)
2. Click → confirmation modal with explicit list of what will be deleted (apps, DB, volumes, sessions, JWT secret, settings)
3. Modal asks: "Reinstalled host should..."
   - **(a) Restore my account** — preserves the Livinity API key so the reinstalled host comes back as the same logical instance (current login still works after reinstall completes)
   - **(b) Start fresh as new user** — wipes API key, reinstalled host onboards as a new instance from scratch
4. On confirm → backend triggers wipe + curl-piped reinstall → host restarts → user sees "Reinstalling..." cover page with progress
5. After ~5-10 min reinstalled → user redirected to login (option a → existing creds work, option b → onboarding flow)

**What needs to exist (technical scope):**
- `https://livinity.io/install.sh` — verified to exist + accept `--api-key <key>` CLI arg + idempotent + survives running on a host that already has `/opt/livos/`. **AUDIT BEFORE PLANNING — may need authoring or hardening.**
- New tRPC route `system.factoryReset({ preserveApiKey: boolean })` — runs the wipe + reinstall in a detached process, returns immediately so the UI can show a progress page
- Wipe procedure (bash, runs as root):
  - `systemctl stop livos liv-core liv-worker liv-memory livos-rollback caddy` (don't kill the SSH session)
  - `docker stop $(docker ps -aq) ; docker rm $(docker ps -aq) ; docker volume prune -f` (user app cleanup)
  - `sudo -u postgres psql -c "DROP DATABASE livos; DROP USER livos;"` (fresh DB)
  - `rm -rf /opt/livos /opt/nexus /etc/systemd/system/{livos,liv-core,liv-worker,liv-memory,livos-rollback}.service /etc/systemd/system/livos.service.d/`
  - If preserveApiKey: stash the API key to `/tmp/livos-reset-apikey` BEFORE the rm, then pass to install.sh
  - `curl -sSL https://livinity.io/install.sh | sudo bash -s -- --api-key <stashed-or-fresh>`
- Settings UI: `livos/packages/ui/src/routes/settings/advanced/factory-reset.tsx` (new) with confirm modal + "preserve account vs. new user" radio + progress overlay
- During reinstall, surface progress via the same BarePage cover the update.sh uses (Phase 30 pattern)

**Cross-phase contracts:**
- Reuses Phase 30's BarePage update overlay
- Reuses Phase 32's `update-history/<ts>-factory-reset.json` event log shape (extend OBS-01 schema with status: "factory-reset")
- Reuses Phase 31's idempotent SSH-applied script pattern for the wipe+install bash

**Risks (HARD — must be designed for):**
- R1: User loses ALL their app data — confirmation modal must enumerate explicitly, not generic "are you sure?"
- R2: Network failure during reinstall leaves host in half-deleted state — install.sh needs `--resume` or the wipe step needs a snapshot first
- R3: API key preservation race — the user might revoke the key from livinity.io between wipe and reinstall — handle 401 from install.sh gracefully
- R4: install.sh may not exist yet OR may not support --api-key — pre-plan audit MUST verify
- R5: Mini PC tunnel through Server5 — if Server5 is down, install.sh can't reach back to identify the host. Maybe use a public bootstrap key as fallback.
- R6: `docker volume prune` is destructive across ALL volumes, not just LivOS — limit scope to volumes owned by LivOS-managed containers

**API key handling (CRITICAL):**
- API key is sensitive. Store in `/opt/livos/.env` as `LIV_API_KEY=<value>`, **never** in repo, never in plan markdown, never in commit messages. The Settings UI fetches it via the existing authenticated context, never displays in plain.
- For the reinstall command, install.sh receives the key via stdin or an `--api-key-file` flag (NOT shell argv where it appears in `ps`).

**Estimate:** 2-3 phases (likely v30.x):
- Phase A: install.sh audit + harden (verify it exists, accepts --api-key, is idempotent — if not, author it)
- Phase B: backend `system.factoryReset` route + wipe/reinstall bash + JSON event row
- Phase C: Settings UI button + confirm modal + progress overlay + cross-cutting tests

**Status:** PARKED. Promote to active when v29.0 (Deploy & Update Stability) ships and the install.sh audit (Phase A) confirms feasibility. Until then, recovery is manual SSH.

---
