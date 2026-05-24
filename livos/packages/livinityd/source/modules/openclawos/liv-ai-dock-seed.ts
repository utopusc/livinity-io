/**
 * Phase 203 Hot-fix D 2026-05-24 — permanent "Liv AI" dock entry seed.
 *
 * Mounts a deterministic native-app config every boot so the operator
 * ALWAYS sees a dock shortcut for the openclaw chat surface, even after
 * a Redis flush / factory reset. The seed is idempotent: the same
 * deterministic UUID collapses repeat upserts to a single Redis key.
 *
 * Click flow (cross-package, parallel to OpenUI app branch in
 * openclawos/desktop-registrar.ts):
 *
 *   1. livinityd boot → seedLivAiDockEntry(store) → NativeAppConfigStore
 *      .upsert publishes liv:config:updated.
 *   2. Dock subscribes to liv:config:updated → re-fetches apps.native.list
 *      → renders <NativeAppIcon> tile with name "Liv AI".
 *   3. Operator clicks → useLaunchNativeApp.launch({wmClassHint: 'liv-ai'})
 *      short-circuits the binary-spawn path and opens a window with
 *      appId='LIV_AI_CHAT' (see ui/.../use-launch-native-app.ts).
 *   4. window-content.tsx sees the LIV_AI_CHAT appId and mounts the
 *      iframe content pointed at /liv-ai-app/liv-ai (the Hot-fix D part 1
 *      Caddy handle that rewrites to /plugins/openclawos).
 *   5. claw-client inside the iframe auto-handshakes via /openclawos/handshake
 *      (Plan 203-05) and jumps straight to chat — no setup form.
 *
 * Threat note (T-101-02 / nativeAppConfigSchema): binaryPath MUST satisfy
 * the absolute-path regex. We use /usr/bin/true as a synthetic placeholder
 * — never actually spawned because window-content intercepts the click
 * for the LIV_AI_CHAT appId before reaching the spawn dispatcher.
 *
 * wmClassHint='liv-ai' is the discriminator the dock launcher uses to
 * route to an iframe instead of a binary. Distinct from the
 * `liv-openui-<slug>` prefix used by per-OpenUI-app entries (Plan 203-10)
 * so the two short-circuit branches don't collide.
 */

import {
	NativeAppConfigStore,
	type NativeAppConfig,
} from '../apps/native-app-config.js'

/**
 * Deterministic UUID for the permanent Liv AI dock entry. Hand-picked v5-shaped
 * literal (version nibble '4', RFC 4122 variant '8') so the same id maps to
 * the same Redis key on every boot. This is intentionally NOT derived from a
 * runtime input — there is exactly ONE Liv AI entry per LivOS install.
 */
export const LIV_AI_NATIVE_ID = 'd1748ca1-0203-4d04-8db1-9aa1c1a1f1d1'

/**
 * wmClassHint that useLaunchNativeApp short-circuits on. Distinct from the
 * `liv-openui-` PREFIX used by per-app OpenUI entries; this is an EXACT
 * string match so the two branches stay disjoint.
 */
export const LIV_AI_WMCLASS_HINT = 'liv-ai'

/** Placeholder icon served by the Phase 202 Next.js subapp under /liv-ai-app/icons/* (D-203-11). */
export const LIV_AI_ICON_URL = '/liv-ai-app/icons/liv-ai-placeholder.svg'

/** See nativeAppConfigSchema.binaryPath — must be an absolute path with no shell metachars. */
const LIV_AI_PLACEHOLDER_BINARY = '/usr/bin/true'

/**
 * Idempotently upsert the permanent "Liv AI" dock entry. Safe to call on
 * every boot — NativeAppConfigStore.upsert is keyed by the fixed UUID so
 * repeat calls collapse to the same Redis entry. Re-publishes
 * liv:config:updated so the dock re-renders if the name / icon ever changes.
 *
 * Caller (livinityd.start) wraps this in try/catch — a transient Redis
 * hiccup here must NOT fail the rest of livinityd boot.
 */
export async function seedLivAiDockEntry(
	store: NativeAppConfigStore,
): Promise<void> {
	const cfg: NativeAppConfig = {
		id: LIV_AI_NATIVE_ID,
		name: 'Liv AI',
		iconUrl: LIV_AI_ICON_URL,
		binaryPath: LIV_AI_PLACEHOLDER_BINARY,
		wmClassHint: LIV_AI_WMCLASS_HINT,
	}
	await store.upsert(cfg)
}
