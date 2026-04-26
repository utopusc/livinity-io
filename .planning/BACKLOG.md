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
