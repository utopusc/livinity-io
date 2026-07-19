// livos/packages/livinityd/source/modules/widgets/widget-access.ts
// Phase 345-01 (WIDG-01, D-345-2) — the pure, OFFLINE-testable core of the
// widget multi-user safety fix. No I/O, no livinityd import (mirrors the
// public-forbidden.ts pure-module precedent). The router (widgets/routes.ts)
// supplies the resolved owner + effective grant so this module stays pure.
//
// TWO latent gaps this closes (345-CONTEXT):
//   (a) the old inline splitWidgetId did `widgetId.split(':')[0..1]`, which
//       BREAKS on a composite per-user widgetId `${appId}:user:${uid}:${name}`
//       (4 segments) — it would parse appId='nextcloud', widgetName='user',
//       silently mis-targeting. splitWidgetId here rsplits on the LAST colon so
//       the widget NAME is always the final segment and the appId keeps its
//       `:user:${uid}` composite intact.
//   (b) the old router did ZERO ownership check — any authed user could
//       enable/read a widget for ANOTHER user's per-user instance.
//       decideWidgetAccess is the fail-closed ALLOW-LIST that closes it.

/** The app-access levels app-access.ts getEffectiveAppAccess returns. */
export type WidgetAccessLevel = 'none' | 'readonly' | 'full'

/**
 * Split a widgetId into its appId and widget name, rsplitting on the LAST
 * colon so a composite per-user appId keeps every `:user:${uid}` segment:
 *   'livinity:storage'                 → {appId:'livinity',            widgetName:'storage'}
 *   'transmission:status'              → {appId:'transmission',        widgetName:'status'}
 *   'nextcloud:user:u-123:status'      → {appId:'nextcloud:user:u-123',widgetName:'status'}
 * A degenerate id with no colon → {appId: widgetId, widgetName: ''} (documented).
 */
export function splitWidgetId(widgetId: string): {appId: string; widgetName: string} {
	const idx = widgetId.lastIndexOf(':')
	if (idx === -1) return {appId: widgetId, widgetName: ''}
	return {appId: widgetId.slice(0, idx), widgetName: widgetId.slice(idx + 1)}
}

/**
 * Strip a trailing `:user:${uid}` composite to recover the BASE appId used for
 * app-access grant lookups (getEffectiveAppAccess is keyed on the base app id,
 * not the per-user composite):
 *   baseAppId('nextcloud:user:u-123') → 'nextcloud'
 *   baseAppId('transmission')         → 'transmission'
 * Uses the SAME `:user:` contract as caddy.appIdOwner (the single source of
 * truth for the per-user composite format).
 */
export function baseAppId(appId: string): string {
	return appId.replace(/:user:.+$/, '')
}

/**
 * The fail-closed ownership decision (D-345-2). Written as an ALLOW-LIST:
 * a shared grant admits ONLY on an explicit `full`|`readonly` level — NEVER
 * `effectiveAccessLevel !== undefined` (that would fail-OPEN on `'none'`, the
 * value getEffectiveAppAccess actually returns for no grant — PLAN-CHECK W1).
 *
 * Admits:
 *   - owner === null           → ownerless built-in / global app (box-global,
 *                                unchanged — the livinity:* + admin-installed
 *                                global widgets keep working, never-break)
 *   - isAdmin                  → an admin may access any owned widget
 *   - currentUserId === owner  → the owner themselves
 *   - effectiveAccessLevel is  → an explicit share grant (full or readonly)
 *     'full' | 'readonly'
 * DENIES (fail-closed) everything else, notably:
 *   - owner set, currentUserId !== owner, effectiveAccessLevel === 'none'
 *   - owner set, currentUserId === undefined (unidentified caller)
 *   - unknown / empty inputs
 */
export function decideWidgetAccess(args: {
	owner: string | null
	currentUserId: string | undefined
	isAdmin: boolean
	effectiveAccessLevel: WidgetAccessLevel | undefined
}): boolean {
	const {owner, currentUserId, isAdmin, effectiveAccessLevel} = args

	// Ownerless built-in / global app — box-global, unchanged (bypass).
	if (owner === null) return true

	// An admin may access any owned widget.
	if (isAdmin) return true

	// Beyond here the caller must be an identified user.
	if (!currentUserId) return false

	// The owner themselves.
	if (currentUserId === owner) return true

	// A non-owner is admitted ONLY on an explicit share grant (ALLOW-LIST).
	return effectiveAccessLevel === 'full' || effectiveAccessLevel === 'readonly'
}
