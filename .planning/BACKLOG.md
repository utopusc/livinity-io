# Backlog

Captured ideas that aren't yet scheduled into a milestone. Promote with `/gsd-review-backlog` (or by hand) when ready.

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

## 999.2 — `/settings/software-update/confirm` → modal/dialog UX

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
