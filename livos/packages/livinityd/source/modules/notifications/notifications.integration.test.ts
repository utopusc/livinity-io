import {expect, beforeAll, afterAll, test} from 'vitest'

import createTestLivinityd from '../test-utilities/create-test-livinityd.js'

let livinityd: Awaited<ReturnType<typeof createTestLivinityd>>

beforeAll(async () => {
	livinityd = await createTestLivinityd()
})

afterAll(async () => {
	await livinityd.cleanup()
})

// The following tests are stateful and must be run in order

// We sleep to allow time for fs events to be triggered and handled by the livinityd filewatcher

test.sequential('notifications.get() throws invalid error without auth token', async () => {
	await expect(livinityd.client.notifications.get.query()).rejects.toThrow('Invalid token')
})

test.sequential('login', async () => {
	await expect(livinityd.registerAndLogin()).resolves.toBe(true)
})

test.sequential('notifications.get() lists nothing on a fresh install', async () => {
	await expect(livinityd.client.notifications.get.query()).resolves.toMatchObject([])
})

test.sequential('notifications.add(notification) adds a notification', async () => {
	await livinityd.instance.notifications.add('test notification')
	await expect(livinityd.client.notifications.get.query()).resolves.toMatchObject(['test notification'])
})

test.sequential('notifications.clear(notification) clears a notification', async () => {
	await expect(livinityd.client.notifications.get.query()).resolves.toMatchObject(['test notification'])
	await livinityd.client.notifications.clear.mutate('test notification')
	await expect(livinityd.client.notifications.get.query()).resolves.toMatchObject([])
})

test.sequential('notifications.add(notification) moves duplicate notifications to front', async () => {
	// Add numbered notifications
	await livinityd.instance.notifications.add('notification-1')
	await livinityd.instance.notifications.add('notification-2')
	await livinityd.instance.notifications.add('notification-3')

	// Now add the first again to move it to the front
	await livinityd.instance.notifications.add('notification-1')

	await expect(livinityd.client.notifications.get.query()).resolves.toMatchObject([
		'notification-1',
		'notification-3',
		'notification-2',
	])
})

// Phase 310-02 — the new backward-compatible add() opts param. The 1-arg form
// above is untouched and still passes; these prove the FileStore/in-app-bell path
// is identical whether or not the second arg is passed, and that opting into
// external dispatch never throws / never blocks the bell write.

test.sequential('notifications.add(notification, {external:false}) still writes the in-app bell', async () => {
	// external:false must behave EXACTLY like the 1-arg form (bell only, no dispatch)
	await livinityd.instance.notifications.add('two-arg-notification', {
		severity: 'warning',
		external: false,
	})
	const bell = await livinityd.client.notifications.get.query()
	expect(bell).toContain('two-arg-notification')
})

test.sequential('notifications.add(notification, {external:true}) is non-fatal with no channels and still writes the bell', async () => {
	// With zero channels configured the dispatch is a fire-and-forget no-op; add()
	// must still resolve true and the notification must still reach the bell.
	await expect(
		livinityd.instance.notifications.add('ext-notification', {severity: 'critical', external: true}),
	).resolves.toBe(true)
	const bell = await livinityd.client.notifications.get.query()
	expect(bell).toContain('ext-notification')
})

// Phase 310-02 — the notifications.channels admin sub-router. These run after the
// sequential 'login' test above, so `livinityd.client` is the authenticated admin
// and `livinityd.unauthenticatedClient` has no session.

test.sequential('notifications.channels.upsert + list works for an admin and NEVER returns the secret', async () => {
	// (ntfy target resolves via DNS in assertResolvedHostSafe — needs network in CI.)
	const {id} = await livinityd.client.notifications.channels.upsert.mutate({
		kind: 'ntfy',
		target: 'https://ntfy.sh/livinity-test',
		enabled: true,
		severityFilter: ['critical', 'warning'],
	})
	expect(typeof id).toBe('string')

	const channels = await livinityd.client.notifications.channels.list.query()
	const found = channels.find((c) => c.id === id)
	expect(found).toBeDefined()
	expect(found).toMatchObject({
		kind: 'ntfy',
		target: 'https://ntfy.sh/livinity-test',
		enabled: true,
		hasSecret: false,
	})
	// The raw secret value must NEVER be exposed by list() (ALERT-03 / T-310-09).
	expect(found).not.toHaveProperty('secret')
	expect(found).not.toHaveProperty('ntfyToken')
	expect(found).not.toHaveProperty('webhookUrl')
})

test.sequential('notifications.channels.list rejects a caller with no session (route is gated)', async () => {
	// adminProcedure → isAuthenticated rejects the sessionless client before the
	// handler runs (T-310-08): the route is not open to the public.
	await expect(livinityd.unauthenticatedClient.notifications.channels.list.query()).rejects.toThrow()
})

test.sequential('notifications.channels.upsert rejects a private-IP webhook URL (SSRF → BAD_REQUEST)', async () => {
	await expect(
		livinityd.client.notifications.channels.upsert.mutate({
			kind: 'webhook',
			target: 'internal',
			secret: 'http://127.0.0.1/hook',
			enabled: true,
			severityFilter: ['critical'],
		}),
	).rejects.toThrow(/SSRF blocked/)
})
