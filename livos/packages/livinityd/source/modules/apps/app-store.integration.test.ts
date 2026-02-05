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

test.sequential('registry() throws invalid error when no user is registered', async () => {
	await expect(livinityd.client.appStore.registry.query()).rejects.toThrow('Invalid token')
})

test.sequential('addRepository() throws invalid error when no user is registered', async () => {
	await expect(livinityd.client.appStore.addRepository.mutate({url: communityAppStoreGitServer.url})).rejects.toThrow(
		'Invalid token',
	)
})

test.sequential('removeRepository() throws invalid error when no user is registered', async () => {
	await expect(livinityd.client.appStore.removeRepository.mutate({url: communityAppStoreGitServer.url})).rejects.toThrow(
		'Invalid token',
	)
})

test.sequential('login', async () => {
	await expect(livinityd.registerAndLogin()).resolves.toBe(true)
})

test.sequential('registry() returns app registry', async () => {
	await expect(livinityd.client.appStore.registry.query()).resolves.toStrictEqual([
		{
			url: livinityd.instance.appStore.defaultAppStoreRepo,
			meta: {
				id: 'sparkles',
				name: 'Sparkles',
			},
			apps: [
				{
					appStoreId: 'sparkles',
					manifestVersion: '1.0.0',
					id: 'sparkles-hello-world',
					name: 'Hello World',
					tagline: "Replace this tagline with your app's tagline",
					icon: 'https://svgur.com/i/mvA.svg',
					category: 'Development',
					version: '1.0.0',
					port: 4000,
					description: "Add your app's description here.\n\nYou can also add newlines!",
					developer: 'Livinity',
					website: 'https://livinity.com',
					submitter: 'Livinity',
					submission: 'https://github.com/getlivinity/livinity-hello-world-app',
					repo: 'https://github.com/getlivinity/livinity-hello-world-app',
					support: 'https://github.com/getlivinity/livinity-hello-world-app/issues',
					gallery: [
						'https://i.imgur.com/yyVG0Jb.jpeg',
						'https://i.imgur.com/yyVG0Jb.jpeg',
						'https://i.imgur.com/yyVG0Jb.jpeg',
					],
					releaseNotes: "Add what's new in the latest version of your app here.",
					dependencies: [],
					path: '',
					defaultUsername: '',
					defaultPassword: '',
					backupIgnore: ['data', 'logs', 'cache'],
				},
			],
		},
	])
})

test.sequential('addRepository() adds a second repository', async () => {
	await expect(livinityd.client.appStore.addRepository.mutate({url: communityAppStoreGitServer.url})).resolves.toBe(true)
})

test.sequential('registry() returns both app repositories in registry', async () => {
	await expect(livinityd.client.appStore.registry.query()).resolves.toStrictEqual([
		{
			url: livinityd.instance.appStore.defaultAppStoreRepo,
			meta: {
				id: 'sparkles',
				name: 'Sparkles',
			},
			apps: [
				{
					appStoreId: 'sparkles',
					manifestVersion: '1.0.0',
					id: 'sparkles-hello-world',
					name: 'Hello World',
					tagline: "Replace this tagline with your app's tagline",
					icon: 'https://svgur.com/i/mvA.svg',
					category: 'Development',
					version: '1.0.0',
					port: 4000,
					description: "Add your app's description here.\n\nYou can also add newlines!",
					developer: 'Livinity',
					website: 'https://livinity.com',
					submitter: 'Livinity',
					submission: 'https://github.com/getlivinity/livinity-hello-world-app',
					repo: 'https://github.com/getlivinity/livinity-hello-world-app',
					support: 'https://github.com/getlivinity/livinity-hello-world-app/issues',
					gallery: [
						'https://i.imgur.com/yyVG0Jb.jpeg',
						'https://i.imgur.com/yyVG0Jb.jpeg',
						'https://i.imgur.com/yyVG0Jb.jpeg',
					],
					releaseNotes: "Add what's new in the latest version of your app here.",
					dependencies: [],
					path: '',
					defaultUsername: '',
					defaultPassword: '',
					backupIgnore: ['data', 'logs', 'cache'],
				},
			],
		},
		{
			url: communityAppStoreGitServer.url,
			meta: {
				id: 'sparkles',
				name: 'Sparkles',
			},
			apps: [
				{
					appStoreId: 'sparkles',
					manifestVersion: '1.0.0',
					id: 'sparkles-hello-world',
					name: 'Hello World',
					tagline: "Replace this tagline with your app's tagline",
					icon: 'https://svgur.com/i/mvA.svg',
					category: 'Development',
					version: '1.0.0',
					port: 4000,
					description: "Add your app's description here.\n\nYou can also add newlines!",
					developer: 'Livinity',
					website: 'https://livinity.com',
					submitter: 'Livinity',
					submission: 'https://github.com/getlivinity/livinity-hello-world-app',
					repo: 'https://github.com/getlivinity/livinity-hello-world-app',
					support: 'https://github.com/getlivinity/livinity-hello-world-app/issues',
					gallery: [
						'https://i.imgur.com/yyVG0Jb.jpeg',
						'https://i.imgur.com/yyVG0Jb.jpeg',
						'https://i.imgur.com/yyVG0Jb.jpeg',
					],
					releaseNotes: "Add what's new in the latest version of your app here.",
					dependencies: [],
					path: '',
					defaultUsername: '',
					defaultPassword: '',
					backupIgnore: ['data', 'logs', 'cache'],
				},
			],
		},
	])
})

test.sequential('addRepository() throws adding a repository that has already been added', async () => {
	await expect(livinityd.client.appStore.addRepository.mutate({url: communityAppStoreGitServer.url})).rejects.toThrow(
		'already exists',
	)
})

test.sequential('removeRepository() removes a reposoitory', async () => {
	await expect(livinityd.client.appStore.removeRepository.mutate({url: communityAppStoreGitServer.url})).resolves.toBe(
		true,
	)
})

test.sequential('registry() no longer returns an app repository that has been removed', async () => {
	await expect(livinityd.client.appStore.registry.query()).resolves.toStrictEqual([
		{
			url: livinityd.instance.appStore.defaultAppStoreRepo,
			meta: {
				id: 'sparkles',
				name: 'Sparkles',
			},
			apps: [
				{
					appStoreId: 'sparkles',
					manifestVersion: '1.0.0',
					id: 'sparkles-hello-world',
					name: 'Hello World',
					tagline: "Replace this tagline with your app's tagline",
					icon: 'https://svgur.com/i/mvA.svg',
					category: 'Development',
					version: '1.0.0',
					port: 4000,
					description: "Add your app's description here.\n\nYou can also add newlines!",
					developer: 'Livinity',
					website: 'https://livinity.com',
					submitter: 'Livinity',
					submission: 'https://github.com/getlivinity/livinity-hello-world-app',
					repo: 'https://github.com/getlivinity/livinity-hello-world-app',
					support: 'https://github.com/getlivinity/livinity-hello-world-app/issues',
					gallery: [
						'https://i.imgur.com/yyVG0Jb.jpeg',
						'https://i.imgur.com/yyVG0Jb.jpeg',
						'https://i.imgur.com/yyVG0Jb.jpeg',
					],
					releaseNotes: "Add what's new in the latest version of your app here.",
					dependencies: [],
					path: '',
					defaultUsername: '',
					defaultPassword: '',
					backupIgnore: ['data', 'logs', 'cache'],
				},
			],
		},
	])
})

test.sequential('removeRepository() throws removing a reposoitory that does not exist', async () => {
	await expect(livinityd.client.appStore.removeRepository.mutate({url: communityAppStoreGitServer.url})).rejects.toThrow(
		'does not exist',
	)
})

test.sequential('removeRepository() throws removing the default reposoitory', async () => {
	await expect(
		livinityd.client.appStore.removeRepository.mutate({url: livinityd.instance.appStore.defaultAppStoreRepo}),
	).rejects.toThrow('Cannot remove default repository')
})
