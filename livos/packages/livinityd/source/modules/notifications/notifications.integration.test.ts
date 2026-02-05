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
