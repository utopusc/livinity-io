/**
 * Phase 203-10 — Desktop registrar for OpenUI apps.
 *
 * Wraps `NativeAppConfigStore` so that whenever the `openclawos.apps.create`
 * (and `.update` / `.delete`) tRPC handlers fire successfully, the same app
 * ALSO surfaces as a clickable LivOS dock icon (D-203-10).
 *
 * The dock already subscribes to the `liv:config:updated` Redis pub/sub
 * channel that `NativeAppConfigStore.upsert` / `.delete` publish, so this
 * registrar reuses the existing surface — no new SSE channel, no new
 * window manager, no new dock loader (D-203-10 verbatim).
 *
 * Click flow (cross-package):
 *
 *   1. OpenUI app is created → tRPC handler calls registerOpenUiAppAsDesktopIcon
 *   2. Store publishes liv:config:updated → dock re-fetches apps.native.list
 *   3. NativeAppIcon renders for the new entry (because wmClassHint = `liv-openui-<slug>`)
 *   4. Click → useLaunchNativeApp.launch({id, name, iconUrl}) → openWindow(`NATIVE_<id>`)
 *   5. window-content.tsx sees the `NATIVE_` prefix + the wmClassHint pattern
 *      → mounts `<OpenUiAppContent slug={...} name={...}>` instead of
 *      `<NativeAppStreamWindowContent>` (the binary-spawn path).
 *   6. OpenUiAppContent renders `<iframe src="/liv-ai-app/apps/<slug>">` —
 *      same-origin so the LIVINITY_SESSION cookie auto-flows (T-203-06).
 *
 * Idempotency (T-203-05): the synthetic UUID is a deterministic v5-shaped
 * SHA-1 of `openui-app:<slug>`, so repeated registrations for the same
 * slug write to the same Redis key. `NativeAppConfigStore.upsert` is
 * already idempotent on duplicate IDs.
 *
 * Threat note (T-101-02): `binaryPath` MUST satisfy `nativeAppConfigSchema`'s
 * absolute-path regex. We use `/usr/bin/true` as a synthetic placeholder —
 * it would be valid to spawn but the dock's NATIVE_ click path is
 * intercepted earlier by window-content (it routes to OpenUiAppContent
 * before any spawn call fires).
 */

import {createHash} from 'node:crypto'

import {
	NativeAppConfigStore,
	type NativeAppConfig,
} from '../apps/native-app-config.js'

/** Placeholder icon served by the openclaw gateway under /liv-ai-app/icons/* (D-203-11). */
export const OPENUI_ICON_URL = '/liv-ai-app/icons/liv-ai-placeholder.svg'

/**
 * Synthetic absolute path that satisfies `nativeAppConfigSchema.binaryPath`.
 * Never actually spawned — window-content intercepts the NATIVE_ click for
 * `liv-openui-*` wmClassHints before reaching the spawn dispatcher.
 */
export const OPENUI_PLACEHOLDER_BINARY = '/usr/bin/true'

/** Prefix used in `wmClassHint` so the UI can discriminate OpenUI from real native apps. */
export const OPENUI_WMCLASS_PREFIX = 'liv-openui-'

/**
 * Derive a deterministic v5-shaped UUID from the OpenUI app slug. Re-creating
 * the same slug yields the same UUID so the Redis key collapses to a single
 * entry no matter how many `app_create` calls fire.
 *
 * We hand-roll the v5 shape (set version=5, RFC 4122 variant) rather than
 * pull in a uuid lib — keeps the new file dep-free and matches the regex
 * `z.string().uuid()` in `nativeAppConfigSchema.id`.
 */
export function deterministicUuidForSlug(slug: string): string {
	const h = createHash('sha1').update(`openui-app:${slug}`).digest('hex')
	// time_low(8)-time_mid(4)-version(4 starting with 5)-clock_seq(4 with RFC variant bits)-node(12)
	const timeLow = h.slice(0, 8)
	const timeMid = h.slice(8, 12)
	const versionAndTimeHi = '5' + h.slice(13, 16)
	// RFC 4122 variant: high two bits must be 10 → byte starts with 8/9/a/b.
	const clockSeqHigh = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80)
		.toString(16)
		.padStart(2, '0')
	const clockSeq = clockSeqHigh + h.slice(18, 20)
	const node = h.slice(20, 32)
	return `${timeLow}-${timeMid}-${versionAndTimeHi}-${clockSeq}-${node}`
}

/**
 * Sanitize a slug into a wmClassHint-safe suffix. `nativeAppConfigSchema`
 * accepts `/^[\w-]{1,64}$/` so we strip everything else and clamp length.
 * The PREFIX is fixed at `liv-openui-` so window-content can detect us.
 */
export function wmClassHintForSlug(slug: string): string {
	const safe = slug.replace(/[^\w-]/g, '-')
	// Reserve characters for the prefix so the combined string stays ≤ 64.
	const maxSuffix = 64 - OPENUI_WMCLASS_PREFIX.length
	return `${OPENUI_WMCLASS_PREFIX}${safe.slice(0, maxSuffix)}`
}

/**
 * Register an OpenUI app as a desktop icon. Safe to call repeatedly for
 * the same slug — the deterministic UUID collapses re-registrations onto
 * the same Redis entry, and `NativeAppConfigStore.upsert` re-publishes
 * `liv:config:updated` so the dock re-renders the (possibly renamed) entry.
 *
 * Caller (openclawos-router.ts) wraps the call in try/catch so a transient
 * Redis hiccup does NOT fail the underlying `apps.create` response — the
 * operator can re-register via `apps.update`.
 */
export async function registerOpenUiAppAsDesktopIcon(
	store: NativeAppConfigStore,
	slug: string,
	name: string,
): Promise<void> {
	const cfg: NativeAppConfig = {
		id: deterministicUuidForSlug(slug),
		name,
		iconUrl: OPENUI_ICON_URL,
		binaryPath: OPENUI_PLACEHOLDER_BINARY,
		wmClassHint: wmClassHintForSlug(slug),
	}
	await store.upsert(cfg)
}

/**
 * Unregister the desktop icon for an OpenUI app (called from the
 * `openclawos.apps.delete` tRPC handler). Idempotent — calls
 * `NativeAppConfigStore.delete` which returns false for missing keys
 * without publishing a spurious event.
 */
export async function unregisterOpenUiApp(
	store: NativeAppConfigStore,
	slug: string,
): Promise<void> {
	await store.delete(deterministicUuidForSlug(slug))
}
