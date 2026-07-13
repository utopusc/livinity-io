// Phase 310-01 (ALERT-02) — Dispatcher engine unit tests.
//
// All deps injected — NO real Redis / HTTP. A fake transport records calls, an
// in-memory floorStore persists over a plain object, the clock (now) and the
// burst timer (setTimer) are controllable so flushes fire deterministically.
//
// Covers: coalescing, resend-floor, severity routing, per-channel isolation,
// and immediate test-send + cooldown.

import {describe, expect, test, vi} from 'vitest'

import type {
	AlertSeverity,
	NotificationChannel,
	NotificationChannelKind,
} from './channel-types.js'
import {type AlertTransport, type DispatcherDeps, type FloorMap, Dispatcher} from './dispatch.js'

function ch(
	id: string,
	kind: NotificationChannelKind,
	target: string,
	severityFilter: AlertSeverity[] = ['warning', 'critical'],
	enabled = true,
): NotificationChannel {
	return {id, kind, target, enabled, severityFilter}
}

type Recorded = {method: 'liv' | 'webhook' | 'ntfy'; livId?: string; target: string; text: string}

function makeHarness(opts: {
	channels: NotificationChannel[]
	now?: () => number
	throwForTargets?: Set<string>
}) {
	const recorded: Recorded[] = []
	const timers: Array<{fn: () => void; ms: number}> = []
	let floor: FloorMap = {}

	const transport: AlertTransport = {
		async sendLiv(livId, chatId, text) {
			recorded.push({method: 'liv', livId, target: chatId, text})
			if (opts.throwForTargets?.has(chatId)) throw new Error('[alert-unavailable] boom')
		},
		async sendWebhook(url, text) {
			recorded.push({method: 'webhook', target: url, text})
			if (opts.throwForTargets?.has(url)) throw new Error('[alert-unavailable] boom')
		},
		async sendNtfy(url, text) {
			recorded.push({method: 'ntfy', target: url, text})
			if (opts.throwForTargets?.has(url)) throw new Error('[alert-unavailable] boom')
		},
	}

	const logger = {log: vi.fn(), error: vi.fn()}

	const deps: DispatcherDeps = {
		getChannels: async () => opts.channels,
		getSecret: async (_channelId, field) =>
			field === 'webhookUrl' ? 'https://hook.example.com/x' : 'ntfy-token',
		floorStore: {
			load: async () => ({...floor}),
			save: async (r) => {
				floor = {...r}
			},
		},
		logger,
		transport,
		now: opts.now,
		setTimer: (fn, ms) => {
			timers.push({fn, ms})
			return timers.length - 1
		},
	}

	return {dispatcher: new Dispatcher(deps), recorded, timers, logger, getFloor: () => floor}
}

describe('notifications/dispatch Dispatcher', () => {
	test('COALESCING: two alerts within the window collapse into ONE combined message per channel', async () => {
		const channels = [ch('ch-a', 'liv:telegram', 'chatA'), ch('ch-b', 'liv:discord', 'chatB')]
		const h = makeHarness({channels, now: () => 1000})

		await h.dispatcher.dispatch('backups-failing:repo1', 'warning')
		await h.dispatcher.dispatch('disk-critical', 'warning')

		// A burst timer was scheduled per channel at the 60s window.
		expect(h.timers.length).toBe(2)
		expect(h.timers.every((t) => t.ms === 60_000)).toBe(true)

		await h.dispatcher.flushChannel('ch-a')
		await h.dispatcher.flushChannel('ch-b')

		expect(h.recorded.length).toBe(2)
		for (const target of ['chatA', 'chatB']) {
			const calls = h.recorded.filter((r) => r.target === target)
			expect(calls.length).toBe(1)
			expect(calls[0].text).toContain('2 new alerts')
			expect(calls[0].text).toContain('- Backups have not run in over 24 hours')
			// disk-critical dispatched at 'warning' → the copy reflects the tier (MED-04).
			expect(calls[0].text).toContain('- Disk space is running low')
		}
	})

	test('RESEND-FLOOR: the same key is suppressed within 6h, then re-sends past the floor', async () => {
		let clock = 1000
		const channels = [ch('ch-a', 'liv:telegram', 'chatA')]
		const h = makeHarness({channels, now: () => clock})

		// First dispatch → one send.
		await h.dispatcher.dispatch('backups-engine-unavailable', 'warning')
		await h.dispatcher.flushChannel('ch-a')
		expect(h.recorded.length).toBe(1)

		// +1h: still inside the 6h floor → suppressed (nothing enqueued).
		clock += 60 * 60 * 1000
		await h.dispatcher.dispatch('backups-engine-unavailable', 'warning')
		await h.dispatcher.flushChannel('ch-a')
		expect(h.recorded.length).toBe(1)

		// Past 6h from the original send → a new dispatch goes through.
		clock = 1000 + 6 * 60 * 60 * 1000 + 1
		await h.dispatcher.dispatch('backups-engine-unavailable', 'warning')
		await h.dispatcher.flushChannel('ch-a')
		expect(h.recorded.length).toBe(2)
	})

	test('HIGH-02 (a) ESCALATION: warning then critical on the same id within the floor → critical is delivered', async () => {
		let clock = 1000
		// One channel subscribed to critical ONLY — it never saw the earlier warning.
		const channels = [ch('crit', 'liv:telegram', 'chatCrit', ['critical'])]
		const h = makeHarness({channels, now: () => clock})

		// t0: warning fires. The crit-only channel gets nothing (severity filter),
		// but the floor is set at warning.
		await h.dispatcher.dispatch('disk-critical', 'warning')
		await h.dispatcher.flushChannel('crit')
		expect(h.recorded.length).toBe(0)

		// +20min (well inside the 6h floor): disk gets objectively worse → critical,
		// SAME id. This MUST NOT be suppressed by the warning-tier floor.
		clock += 20 * 60 * 1000
		await h.dispatcher.dispatch('disk-critical', 'critical')
		await h.dispatcher.flushChannel('crit')
		expect(h.recorded.filter((r) => r.target === 'chatCrit').length).toBe(1)
	})

	test('HIGH-02 (b) NO DOWNGRADE STORM: critical then warning on the same id within the floor → warning is suppressed', async () => {
		let clock = 1000
		const channels = [ch('any', 'liv:telegram', 'chatAny', ['warning', 'critical'])]
		const h = makeHarness({channels, now: () => clock})

		await h.dispatcher.dispatch('disk-critical', 'critical')
		await h.dispatcher.flushChannel('any')
		expect(h.recorded.length).toBe(1)

		// A lower severity within the window must NOT re-storm the channel.
		clock += 20 * 60 * 1000
		await h.dispatcher.dispatch('disk-critical', 'warning')
		await h.dispatcher.flushChannel('any')
		expect(h.recorded.length).toBe(1)
	})

	test('HIGH-02 (c) STORM PREVENTION INTACT: same severity repeated within the floor is suppressed', async () => {
		let clock = 1000
		const channels = [ch('any', 'liv:telegram', 'chatAny', ['warning', 'critical'])]
		const h = makeHarness({channels, now: () => clock})

		await h.dispatcher.dispatch('disk-critical', 'critical')
		await h.dispatcher.flushChannel('any')
		expect(h.recorded.length).toBe(1)

		clock += 20 * 60 * 1000
		await h.dispatcher.dispatch('disk-critical', 'critical')
		await h.dispatcher.flushChannel('any')
		expect(h.recorded.length).toBe(1)
	})

	test('MED-03 CONCURRENT FLOOR RMW: two different keys dispatched concurrently both persist (no lost update)', async () => {
		// Fire-and-forget dispatches for two independent keys race: each awaits
		// floorStore.load() (a microtask yield) before saving. Without the floor
		// critical section, the second save would clobber the first key. The
		// serialized RMW must preserve BOTH entries.
		const channels = [ch('ch-a', 'liv:telegram', 'chatA')]
		const h = makeHarness({channels, now: () => 1000})

		await Promise.all([
			h.dispatcher.dispatch('backups-failing:repo1', 'warning'),
			h.dispatcher.dispatch('disk-critical', 'critical'),
		])

		// M-01: the floor now keys by the FULL id (floorBucketKey), so a suffixed
		// id keeps its instance suffix in its own bucket.
		const floor = h.getFloor()
		expect(Object.keys(floor).sort()).toEqual(['backups-failing:repo1', 'disk-critical'])
		expect(floor['backups-failing:repo1']).toMatchObject({severity: 'warning'})
		expect(floor['disk-critical']).toMatchObject({severity: 'critical'})
	})

	test('M-01 PER-DEVICE FLOOR: a second failing drive pages independently and is NOT suppressed by the first', async () => {
		// The core SMART regression: two DIFFERENT drives failing within the 6h floor
		// must each reach an external channel (per-device bucket), while the SAME drive
		// re-firing is still floored (anti-storm intact).
		const channels = [ch('ch-a', 'liv:telegram', 'chatA')]
		const h = makeHarness({channels, now: () => 1000})

		// sda fails → paged.
		await h.dispatcher.dispatch('smart-failing:sda', 'critical')
		await h.dispatcher.flushChannel('ch-a')
		expect(h.recorded.length).toBe(1)

		// sdb (a DIFFERENT drive) fails inside the floor → must ALSO page (its own bucket).
		await h.dispatcher.dispatch('smart-failing:sdb', 'critical')
		await h.dispatcher.flushChannel('ch-a')
		expect(h.recorded.length).toBe(2)

		// sda re-firing at the same severity inside the floor is STILL suppressed.
		await h.dispatcher.dispatch('smart-failing:sda', 'critical')
		await h.dispatcher.flushChannel('ch-a')
		expect(h.recorded.length).toBe(2)

		// Both device ids have their own floor bucket — neither collapsed to a shared key.
		expect(Object.keys(h.getFloor()).sort()).toEqual(['smart-failing:sda', 'smart-failing:sdb'])
	})

	test('SEVERITY FILTER: a channel only receives alerts whose severity is in its filter', async () => {
		const channels = [
			ch('crit', 'liv:telegram', 'chatCrit', ['critical']),
			ch('warn', 'liv:discord', 'chatWarn', ['warning', 'critical']),
		]
		const h = makeHarness({channels, now: () => 1000})

		await h.dispatcher.dispatch('disk-critical', 'warning')
		await h.dispatcher.flushChannel('crit')
		await h.dispatcher.flushChannel('warn')

		expect(h.recorded.filter((r) => r.target === 'chatCrit').length).toBe(0)
		expect(h.recorded.filter((r) => r.target === 'chatWarn').length).toBe(1)
	})

	test('PER-CHANNEL ISOLATION: one channel failing does not block delivery to others', async () => {
		const channels = [ch('fail', 'liv:telegram', 'chatFail'), ch('ok', 'liv:discord', 'chatOk')]
		const h = makeHarness({channels, now: () => 1000, throwForTargets: new Set(['chatFail'])})

		await h.dispatcher.dispatch('update-failed', 'critical')

		// Neither flush should throw, even though the 'fail' channel's transport does.
		await expect(h.dispatcher.flushChannel('fail')).resolves.toBeUndefined()
		await expect(h.dispatcher.flushChannel('ok')).resolves.toBeUndefined()

		expect(h.recorded.filter((r) => r.target === 'chatOk').length).toBe(1)
		expect(h.logger.error).toHaveBeenCalledTimes(1)
		expect(h.logger.error).toHaveBeenCalledWith(
			'[alert-dispatch] channel delivery failed',
			expect.objectContaining({channelId: 'fail', kind: 'liv:telegram'}),
		)
	})

	test('TEST SEND: fires immediately (bypassing coalescing) and enforces a per-channel cooldown', async () => {
		let clock = 5000
		const channels = [ch('wh', 'webhook', 'my-webhook-label')]
		const h = makeHarness({channels, now: () => clock})

		const first = await h.dispatcher.sendTestToChannel('wh')
		expect(first).toEqual({ok: true})
		// Immediate — no timer/window needed.
		expect(h.recorded.length).toBe(1)
		expect(h.recorded[0].method).toBe('webhook')
		expect(h.recorded[0].text).toContain('test alert')

		// Second call within the 10s cooldown → refused.
		clock += 2000
		const second = await h.dispatcher.sendTestToChannel('wh')
		expect(second.ok).toBe(false)
		expect(second.error).toMatch(/wait/i)
		expect(h.recorded.length).toBe(1)

		// Past the cooldown → allowed again.
		clock += 10_000
		const third = await h.dispatcher.sendTestToChannel('wh')
		expect(third).toEqual({ok: true})
		expect(h.recorded.length).toBe(2)
	})

	test('TEST SEND: unknown channel returns a not-found error without recording a send', async () => {
		const h = makeHarness({channels: [], now: () => 1000})
		const res = await h.dispatcher.sendTestToChannel('does-not-exist')
		expect(res).toEqual({ok: false, error: 'Channel not found'})
		expect(h.recorded.length).toBe(0)
	})
})
