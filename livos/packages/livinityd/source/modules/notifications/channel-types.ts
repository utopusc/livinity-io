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

// Collapse `backups-failing:<repoId>` → `backups-failing` for the floor + description keys.
export function floorKey(notificationId: string): string {
	return notificationId.split(':')[0]
}

// Server-side human text for external channels (the in-app bell renders via UI
// i18n separately). Fallback = the raw notification id.
const DESCRIPTIONS: Record<string, string> = {
	'backups-failing': 'Backups have not run in over 24 hours',
	'backups-engine-unavailable': 'Backup engine is unavailable — no backups can run',
	'backups-not-configured': 'No backup destination is configured',
	'update-failed': 'A system update failed',
	'disk-critical': 'Disk space is critically low',
}

export function describeNotification(notificationId: string): string {
	return DESCRIPTIONS[floorKey(notificationId)] ?? notificationId
}

// Map livinityd channel kind → Liv ChannelId (strip 'liv:' prefix); null for webhook/ntfy.
export function livChannelId(kind: NotificationChannelKind): string | null {
	return kind.startsWith('liv:') ? kind.slice(4) : null
}

// ntfy Priority header per severity.
export function ntfyPriority(severity: AlertSeverity): string {
	return severity === 'critical' ? 'urgent' : severity === 'warning' ? 'high' : 'default'
}
