// Phase 310-01 (ALERT-02 / ALERT-03) — shared alert-channel contract.
//
// The single source of truth for the notification-channel data model, the
// coalescing/resend-floor timing constants, and the server-side helpers the
// Dispatcher + secret vault + (Plan 02) tRPC routes all consume. Everything
// here is pure/synchronous — no Redis, no fetch, no daemon coupling — so every
// downstream module stays unit-testable in isolation.

export type AlertSeverity = 'critical' | 'warning' | 'info'

// livinityd-local mirror of Liv's ChannelId union (telegram/discord/slack/matrix/
// gmail/whatsapp, prefixed `liv:`) plus the two native transports webhook/ntfy.
// A cross-package type import between livos/ and liv/ is not wired, so this is a
// local copy on purpose.
export type NotificationChannelKind =
	| 'liv:telegram'
	| 'liv:discord'
	| 'liv:slack'
	| 'liv:matrix'
	| 'liv:gmail'
	| 'liv:whatsapp'
	| 'webhook'
	| 'ntfy'

export interface NotificationChannel {
	id: string
	kind: NotificationChannelKind
	target: string // messenger: chatId; webhook: non-secret label/host; ntfy: topic URL
	enabled: boolean
	severityFilter: AlertSeverity[]
}

// FileStore key holding the non-secret channel routing config (array).
//
// NOTE (Phase 310-02): these are dot-prop paths under a DEDICATED top-level
// `alerts` object — NOT nested under the `notifications` bell array. dot-prop
// treats '.' as a path separator, so the original 'notifications.channels' would
// have been read/written as `store.notifications.channels`, colliding with the
// `notifications: string[]` in-app-bell array (js-yaml drops props set on an
// array → the config would never persist). `alerts.*` avoids that collision.
export const CHANNELS_STORE_KEY = 'alerts.channels'
// FileStore key holding the per-key `lastDispatchedAt` resend-floor map.
export const DISPATCH_FLOOR_STORE_KEY = 'alerts.dispatchFloor'

// Coalescing burst window: N dispatch() calls within this window collapse into
// ONE combined message per channel (cascading-failure protection).
export const BURST_WINDOW_MS = 60_000
// Resend floor: the same notification key does not re-dispatch externally within
// this window (suppresses the backups module's deliberate hourly re-adds).
export const RESEND_FLOOR_MS = 6 * 60 * 60 * 1000 // 6h — RESEARCH A1: configurable default
// Per-channel test-send cooldown (outbound-relay DoS cap).
export const TEST_COOLDOWN_MS = 10_000

// Collapse `backups-failing:<repoId>` → `backups-failing` for the DESCRIPTION key
// (human text lookup) + the admin-gating family match. NOT used for the resend
// floor — see floorBucketKey.
export function floorKey(notificationId: string): string {
	return notificationId.split(':')[0]
}

// M-01: the resend-floor bucket key. UNLIKE floorKey (which collapses `family:<id>`
// to the bare `family`), the floor must key by the FULL id so per-INSTANCE alerts
// page INDEPENDENTLY: a second failing drive (smart-failing:sdb) must never be
// suppressed by the first (smart-failing:sda)'s 6h floor — two failing drives is
// strictly worse than one and each must reach an external channel. Non-suffixed
// system alerts (disk-critical, smart-permission-denied) are unaffected: their full
// id already equals their base, so single-instance floor behavior is preserved. The
// same exact condition re-firing (identical full id) is still floored, so the
// anti-storm protection is intact.
export function floorBucketKey(notificationId: string): string {
	return notificationId
}

// Server-side human text for external channels (the in-app bell renders via UI
// i18n separately). Fallback = the raw notification id.
const DESCRIPTIONS: Record<string, string> = {
	'backups-failing': 'Backups have not run in over 24 hours',
	'backups-engine-unavailable': 'Backup engine is unavailable — no backups can run',
	'backups-not-configured': 'No backup destination is configured',
	'update-failed': 'A system update failed',
	// Phase 313 SMART-02/03 — floorKey collapses smart-failing:<id> to the base key.
	'smart-failing': 'A drive is showing pre-failure SMART indicators',
	'smart-unavailable': 'SMART could not be read for a drive (enclosure limitation)',
	'smart-permission-denied': 'SMART monitoring is not configured correctly — drive health cannot be read',
	// Phase 320 MON-02 — floorKey collapses ai-resource-pressure:<container>:<kind> to
	// the base key. The external message stays generic (the Kimi projection + container
	// payload remain in-app in ai_alerts only).
	'ai-resource-pressure': 'A container is under resource pressure',
	// Phase 326 HW-01 — UPS mains-power alerts (upsWatchHandler). Fixed, app-controlled
	// strings (no host device data) — the in-app bell renders its own i18n text.
	'ups-power-loss': 'Running on UPS battery — mains power lost',
	'ups-power-restored': 'Mains power restored',
}

// MED-04: `disk-critical` fires at two tiers (jobs.ts diskSeverityFor): warning
// (<1GB free) and critical (<100MB free). The external message must reflect the
// tier that actually fired — a warning must NOT read "critically low". Severity
// is threaded from the Dispatcher (which always has it); an unknown/critical
// severity keeps the more urgent wording (fail-loud default).
export function describeNotification(notificationId: string, severity?: AlertSeverity): string {
	const key = floorKey(notificationId)
	if (key === 'disk-critical') {
		return severity === 'warning' ? 'Disk space is running low' : 'Disk space is critically low'
	}
	return DESCRIPTIONS[key] ?? notificationId
}

// Map livinityd channel kind → Liv ChannelId (strip 'liv:' prefix); null for webhook/ntfy.
export function livChannelId(kind: NotificationChannelKind): string | null {
	return kind.startsWith('liv:') ? kind.slice(4) : null
}

// ntfy Priority header per severity.
export function ntfyPriority(severity: AlertSeverity): string {
	return severity === 'critical' ? 'urgent' : severity === 'warning' ? 'high' : 'default'
}
