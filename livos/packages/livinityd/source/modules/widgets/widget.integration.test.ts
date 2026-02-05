// TODO: Re-enable this, we temporarily disable TS here since we broke tests
// and have since changed the API. We'll refactor these later.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import {expect, beforeAll, afterAll, test} from 'vitest'

import createTestLivinityd from '../test-utilities/create-test-livinityd.js'
import runGitServer from '../test-utilities/run-git-server.js'

let livinityd: Awaited<ReturnType<typeof createTestLivinityd>>
let communityAppStoreGitServer: Awaited<ReturnType<typeof runGitServer>>

beforeAll(async () => {
	;[livinityd, communityAppStoreGitServer] = await Promise.all([createTestLivinityd(), runGitServer()])
})

afterAll(async () => {
	await Promise.all([communityAppStoreGitServer.close(), livinityd.cleanup()])
})

// The following tests are stateful and must be run in order

test.sequential('enabled() throws invalid error when no user is registered', async () => {
	await expect(livinityd.client.widget.enabled.query()).rejects.toThrow('Invalid token')
})

test.sequential('enable() throws invalid error when no user is registered', async () => {
	await expect(livinityd.client.widget.enable.mutate({widgetId: 'livinity:storage'})).rejects.toThrow('Invalid token')
})

test.sequential('disable() throws invalid error when no user is registered', async () => {
	await expect(livinityd.client.widget.disable.mutate({widgetId: 'livinity:storage'})).rejects.toThrow('Invalid token')
})

test.sequential('data() throws invalid error when no user is registered', async () => {
	await expect(livinityd.client.widget.data.query({widgetId: 'livinity:storage'})).rejects.toThrow('Invalid token')
})

test.sequential('login', async () => {
	await expect(livinityd.registerAndLogin()).resolves.toBe(true)
})

// test.sequential('listAll() returns available widgets', async () => {
// 	await expect(livinityd.client.widget.listAll.query()).resolves.toStrictEqual([
// 		{
// 			id: 'livinity:storage',
// 			type: 'stat-with-progress',
// 			refresh: 1000 * 60 * 5,
// 			example: {
// 				title: 'Storage',
// 				value: '256 GB',
// 				progressLabel: '1.75 TB left',
// 				progress: 0.25,
// 			},
// 		},
// 		{
// 			id: 'livinity:memory',
// 			type: 'stat-with-progress',
// 			refresh: 1000 * 10,
// 			example: {
// 				title: 'Memory',
// 				value: '5.8 GB',
// 				subValue: '/16GB',
// 				progressLabel: '11.4 GB left',
// 				progress: 0.36,
// 			},
// 		},
// 	])
// })

test.sequential('enabled() returns default widgets', async () => {
	await expect(livinityd.client.widget.enabled.query()).resolves.toStrictEqual([
		'livinity:files-favorites',
		'livinity:storage',
		'livinity:system-stats',
	])
})

test.sequential('disable() can disable default widgets', async () => {
	await expect(livinityd.client.widget.disable.mutate({widgetId: 'livinity:files-favorites'})).resolves.toStrictEqual(true)
	await expect(livinityd.client.widget.disable.mutate({widgetId: 'livinity:storage'})).resolves.toStrictEqual(true)
	await expect(livinityd.client.widget.disable.mutate({widgetId: 'livinity:system-stats'})).resolves.toStrictEqual(true)
})

test.sequential('enabled() returns no widgets when none are enabled', async () => {
	await expect(livinityd.client.widget.enabled.query()).resolves.toStrictEqual([])
})

test.sequential('enable() enables a widget', async () => {
	await expect(livinityd.client.widget.enable.mutate({widgetId: 'livinity:storage'})).resolves.toStrictEqual(true)
})

test.sequential('enabled() returns enabled widgets', async () => {
	await expect(livinityd.client.widget.enabled.query()).resolves.toStrictEqual(['livinity:storage'])
})

test.sequential('data() returns live widget data', async () => {
	await expect(livinityd.client.widget.data.query({widgetId: 'livinity:storage'})).resolves.toMatchObject({
		title: 'Storage',
		link: '?dialog=live-usage&tab=storage',
		refresh: 30000,
		type: 'text-with-progress',
	})
})

test.sequential('disable() disables a widget', async () => {
	await expect(livinityd.client.widget.disable.mutate({widgetId: 'livinity:storage'})).resolves.toStrictEqual(true)
})

test.sequential('enabled() returns no widgets when they are all disabled', async () => {
	await expect(livinityd.client.widget.enabled.query()).resolves.toStrictEqual([])
})
