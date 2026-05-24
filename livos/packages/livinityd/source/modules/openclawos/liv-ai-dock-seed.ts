/**
 * Phase 203 Hot-fix D 2026-05-24 — permanent "Liv AI" dock entry seed.
 * Phase 203 Hot-fix E 2026-05-24 — renamed display "Liv AI" → "Liv" +
 *   added a SECOND deterministic entry "Chat" pointing at the same
 *   iframe surface (operator wanted two dock shortcuts).
 *
 * Mounts deterministic native-app configs every boot so the operator
 * ALWAYS sees dock shortcuts for the openclaw chat surface, even after
 * a Redis flush / factory reset. The seed is idempotent: the same
 * deterministic UUIDs collapse repeat upserts to single Redis keys.
 *
 * Click flow (cross-package, parallel to OpenUI app branch in
 * openclawos/desktop-registrar.ts):
 *
 *   1. livinityd boot → seedLivAiDockEntry(store) → NativeAppConfigStore
 *      .upsert publishes liv:config:updated for each entry (Liv + Chat).
 *   2. Dock subscribes to liv:config:updated → re-fetches apps.native.list
 *      → renders two <NativeAppIcon> tiles ("Liv" and "Chat").
 *   3. Operator clicks → useLaunchNativeApp.launch({wmClassHint: 'liv-ai'})
 *      short-circuits the binary-spawn path and opens a window with
 *      appId='LIV_AI_CHAT' (see ui/.../use-launch-native-app.ts).
 *   4. window-content.tsx sees the LIV_AI_CHAT appId and mounts the
 *      iframe content pointed at /liv-ai-app/liv-ai (the Hot-fix D part 1
 *      Caddy handle that rewrites to /plugins/openclawos).
 *   5. claw-client inside the iframe auto-handshakes via /openclawos/handshake
 *      (Plan 203-05) and jumps straight to chat — no setup form (Hot-fix E
 *      part 1 closes the reconnect race that previously kept the engine
 *      from picking up the seeded creds).
 *
 * Both entries share the SAME wmClassHint ('liv-ai') because both should
 * launch the SAME chat surface (LIV_AI_CHAT window). The dock simply shows
 * two shortcut tiles — useLaunchNativeApp uses wmClassHint to route to the
 * correct window type, not to discriminate dock entries.
 *
 * Threat note (T-101-02 / nativeAppConfigSchema): binaryPath MUST satisfy
 * the absolute-path regex. We use /usr/bin/true as a synthetic placeholder
 * — never actually spawned because window-content intercepts the click
 * for the LIV_AI_CHAT appId before reaching the spawn dispatcher. Same
 * mitigation applies to BOTH seeded entries (they hit the same launch
 * short-circuit branch).
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
 * Deterministic UUID for the permanent "Liv" dock entry. Hand-picked v5-shaped
 * literal (version nibble '4', RFC 4122 variant '8') so the same id maps to
 * the same Redis key on every boot. This is intentionally NOT derived from a
 * runtime input — there is exactly ONE Liv entry per LivOS install. Same
 * UUID as Hot-fix D shipped; only the display `name` field changes (Hot-fix
 * E rename "Liv AI" → "Liv"). Upsert idempotency means existing operator
 * installs see the rename in place, no duplicate created.
 */
export const LIV_AI_NATIVE_ID = 'd1748ca1-0203-4d04-8db1-9aa1c1a1f1d1'

/**
 * Phase 203 Hot-fix E 2026-05-24 — deterministic UUID for the SECOND seeded
 * dock entry ("Chat"). Distinct id, same target surface. Hand-picked v4-shaped
 * literal differing from LIV_AI_NATIVE_ID only in a single hex digit so the
 * two entries are visually obvious as a pair in `redis-cli KEYS`. Idempotent
 * upsert keeps re-runs at exactly one row.
 */
export const LIV_AI_CHAT_NATIVE_ID = 'd1748ca2-0203-4e04-8db1-9aa1c1a1f1d2'

/**
 * wmClassHint that useLaunchNativeApp short-circuits on. Distinct from the
 * `liv-openui-` PREFIX used by per-app OpenUI entries; this is an EXACT
 * string match so the two branches stay disjoint. Both seeded entries share
 * this hint because both open the SAME LIV_AI_CHAT window — they are
 * different dock shortcuts to the same chat surface.
 */
export const LIV_AI_WMCLASS_HINT = 'liv-ai'

/** Placeholder icon served by the Phase 202 Next.js subapp under /liv-ai-app/icons/* (D-203-11). */
export const LIV_AI_ICON_URL = '/liv-ai-app/icons/liv-ai-placeholder.svg'

/** See nativeAppConfigSchema.binaryPath — must be an absolute path with no shell metachars. */
const LIV_AI_PLACEHOLDER_BINARY = '/usr/bin/true'

/**
 * Phase 203 Hot-fix F 2026-05-24 — DELETE the Hot-fix D/E seeded entries.
 *
 * Hot-fix D/E (2026-05-24) upserted "Liv" + "Chat" into
 * `NativeAppConfigStore` thinking it fed the LivOS DOCK. It does NOT —
 * NativeAppConfigStore feeds the DESKTOP grid (rendered by
 * `desktop-content.tsx:213` via `NativeAppIcon`). Operator UAT caught the
 * mistake immediately: "where's the dock, why are you putting it on desktop?".
 *
 * Hot-fix F part 1 (commit prior) moved the two chat tiles into the dock
 * via the hardcoded `dock.tsx` (LIV_AI_CHAT + LIV_AI_CHAT_SHORTCUT). This
 * file is now the OPPOSITE — every boot we delete the two stale Redis
 * keys so the desktop is clean (no duplicate tiles).
 *
 * Idempotent: `NativeAppConfigStore.delete()` returns false (no-op) when
 * the key is already absent, so cold installs that never had Hot-fix D/E
 * applied also run cleanly. Both deletes also publish a `liv:config:updated`
 * `delete` event so the desktop grid drops the rows in real time without
 * a page refresh.
 *
 * The function name is preserved for caller stability (livinityd index.ts
 * still calls `seedLivAiDockEntry(store)` on boot) — the SEMANTICS
 * inverted from "seed two entries" to "delete the two legacy seeds". The
 * existing try/catch in the caller treats a transient Redis hiccup as
 * non-fatal — boot continues; the next boot retries the cleanup.
 */
export async function seedLivAiDockEntry(
	store: NativeAppConfigStore,
): Promise<void> {
	// Hot-fix F — sweep the bad desktop entries Hot-fix D/E left behind.
	// Order does not matter; both deletes are independent.
	await store.delete(LIV_AI_NATIVE_ID)
	await store.delete(LIV_AI_CHAT_NATIVE_ID)
}
