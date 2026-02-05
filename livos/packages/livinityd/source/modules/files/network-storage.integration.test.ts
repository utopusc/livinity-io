import nodePath from 'node:path'

import {expect, beforeEach, afterEach, describe, test} from 'vitest'

import fse from 'fs-extra'
import {delay} from 'es-toolkit'
import pRetry from 'p-retry'

import createTestLivinityd from '../test-utilities/create-test-livinityd.js'

let livinityd: Awaited<ReturnType<typeof createTestLivinityd>>

// Create a new livinityd instance for each test
beforeEach(async () => (livinityd = await createTestLivinityd({autoLogin: true})))
afterEach(async () => await livinityd.cleanup())

// Helper to setup a network share for testing
async function createNetworkShare(livinityd: Awaited<ReturnType<typeof createTestLivinityd>>, shareName: string) {
	// Create a test directory and add it as a local Samba share
	const testDirectory = `${livinityd.instance.dataDirectory}/home/${shareName}`
	await fse.mkdir(testDirectory)
	await fse.writeFile(`${testDirectory}/test-file.txt`, 'test content')

	// Add directory as a Samba share
	await livinityd.client.files.addShare.mutate({path: `/Home/${shareName}`})

	// Get share password
	const sharePassword = await livinityd.client.files.sharePassword.query()

	// Add the local share as a network share
	const mountPath = await pRetry(
		() =>
			livinityd.client.files.addNetworkShare.mutate({
				host: 'localhost',
				share: `${shareName} (Livinity)`,
				username: 'livinity',
				password: sharePassword,
			}),
		{retries: 5, factor: 1},
	)

	return mountPath
}

describe('listNetworkShares()', () => {
	test('throws invalid error without auth token', async () => {
		await expect(livinityd.unauthenticatedClient.files.listNetworkShares.query()).rejects.toThrow('Invalid token')
	})

	test('returns empty array on first start', async () => {
		const shares = await livinityd.client.files.listNetworkShares.query()
		expect(shares).toStrictEqual([])
	})

	test('returns network shares with mount status', async () => {
		const mountPath = await createNetworkShare(livinityd, 'network-test-share')

		// List network shares
		const shares = await livinityd.client.files.listNetworkShares.query()
		expect(shares).toHaveLength(1)
		expect(shares[0]).toEqual({
			host: 'localhost',
			share: 'network-test-share (Livinity)',
			mountPath,
			isMounted: true,
		})
	})
})

describe('addNetworkShare()', () => {
	test('throws invalid error without auth token', async () => {
		await expect(
			livinityd.unauthenticatedClient.files.addNetworkShare.mutate({
				host: 'localhost',
				share: 'test',
				username: 'user',
				password: 'pass',
			}),
		).rejects.toThrow('Invalid token')
	})

	test('successfully adds and mounts a network share', async () => {
		const mountPath = await createNetworkShare(livinityd, 'samba-network-test')

		expect(mountPath).toBe('/Network/localhost/samba-network-test (Livinity)')

		// Verify the share is mounted and accessible
		const networkFiles = await livinityd.client.files.list.query({path: mountPath})
		expect(networkFiles.files).toHaveLength(1)
		expect(networkFiles.files[0].name).toBe('test-file.txt')

		// Test writing a new directory in the network share
		await livinityd.client.files.createDirectory.mutate({path: `${mountPath}/new-directory`})
		const result = await livinityd.client.files.list.query({path: mountPath})
		expect(result.files.map((f) => f.name)).toContain('new-directory')
	})

	test('throws error when adding duplicate network share', async () => {
		await createNetworkShare(livinityd, 'duplicate-network-test')

		// Get share password
		const sharePassword = await livinityd.client.files.sharePassword.query()

		// Try to add the same share again
		await expect(
			livinityd.client.files.addNetworkShare.mutate({
				host: 'localhost',
				share: 'duplicate-network-test (Livinity)',
				username: 'livinity',
				password: sharePassword,
			}),
		).rejects.toThrow('already exists')
	})

	test('throws error with invalid credentials', async () => {
		// Create a test directory and add it as a local Samba share
		const testDirectory = `${livinityd.instance.dataDirectory}/home/invalid-creds-test`
		await fse.mkdir(testDirectory)

		// Add directory as a Samba share
		await livinityd.client.files.addShare.mutate({path: '/Home/invalid-creds-test'})

		// Wait for Samba to start
		await delay(3000)

		// Try to add network share with wrong password
		await expect(
			livinityd.client.files.addNetworkShare.mutate({
				host: 'localhost',
				share: 'invalid-creds-test (Livinity)',
				username: 'livinity',
				password: 'wrong-password',
			}),
		).rejects.toThrow()
	})

	test('cleans up mount directory when mount fails', async () => {
		// Try to mount a non-existent share
		await expect(
			livinityd.client.files.addNetworkShare.mutate({
				host: 'non-existent-host.local',
				share: 'non-existent-share',
				username: 'test',
				password: 'secret',
			}),
		).rejects.toThrow()

		// Verify no leftover directories were created
		const networkFiles = await livinityd.client.files.list.query({path: '/Network'})
		expect(networkFiles.files).toHaveLength(0)
	})
})

describe('removeNetworkShare()', () => {
	test('throws invalid error without auth token', async () => {
		await expect(
			livinityd.unauthenticatedClient.files.removeNetworkShare.mutate({mountPath: '/Network/test/share'}),
		).rejects.toThrow('Invalid token')
	})

	test('throws error when removing non-existent share', async () => {
		await expect(
			livinityd.client.files.removeNetworkShare.mutate({
				mountPath: '/Network/non-existent/share',
			}),
		).rejects.toThrow('Share with mount path /Network/non-existent/share not found')
	})

	test('successfully removes a network share', async () => {
		const mountPath = await createNetworkShare(livinityd, 'remove-network-test')

		// Verify share exists
		const sharesBefore = await livinityd.client.files.listNetworkShares.query()
		expect(sharesBefore).toHaveLength(1)

		// Remove the network share
		const result = await livinityd.client.files.removeNetworkShare.mutate({mountPath})
		expect(result).toBe(true)

		// Verify share is removed
		const sharesAfter = await livinityd.client.files.listNetworkShares.query()
		expect(sharesAfter).toHaveLength(0)
	})
})

describe('discoverNetworkShareServers()', () => {
	test('throws invalid error without auth token', async () => {
		await expect(livinityd.unauthenticatedClient.files.discoverNetworkShareServers.query()).rejects.toThrow(
			'Invalid token',
		)
	})

	// Skipping for now since this will fail in CI
	// TODO: Fix this test by running a full blown livinity-dev instance in CI
	test.skip('returns array of discovered servers', async () => {
		const servers = await livinityd.client.files.discoverNetworkShareServers.query()
		expect(servers).toContain('livinity-dev.local')
	})
})

describe('discoverNetworkSharesOnServer()', () => {
	test('throws invalid error without auth token', async () => {
		await expect(
			livinityd.unauthenticatedClient.files.discoverNetworkSharesOnServer.query({
				host: 'localhost',
				username: 'user',
				password: 'pass',
			}),
		).rejects.toThrow('Invalid token')
	})

	test('throws error with invalid credentials', async () => {
		// Create a test directory and add it as a Samba share
		const testDirectory = `${livinityd.instance.dataDirectory}/home/discover-invalid-test`
		await fse.mkdir(testDirectory)

		// Add directory as a Samba share
		await livinityd.client.files.addShare.mutate({path: '/Home/discover-invalid-test'})

		// Wait for Samba to start
		await delay(3000)

		// Try to discover shares with wrong credentials
		await expect(
			livinityd.client.files.discoverNetworkSharesOnServer.query({
				host: 'localhost',
				username: 'livinity',
				password: 'wrong-password',
			}),
		).rejects.toThrow()
	})

	test('discovers shares on local Samba server', async () => {
		// Create test directories and add them as Samba shares
		const testDirectory1 = `${livinityd.instance.dataDirectory}/home/discover-test-1`
		const testDirectory2 = `${livinityd.instance.dataDirectory}/home/discover-test-2`
		await fse.mkdir(testDirectory1)
		await fse.mkdir(testDirectory2)

		// Add directories as Samba shares
		await livinityd.client.files.addShare.mutate({path: '/Home/discover-test-1'})
		await livinityd.client.files.addShare.mutate({path: '/Home/discover-test-2'})

		// Wait for Samba to start and be ready
		await delay(1000)

		// Get share password
		const sharePassword = await livinityd.client.files.sharePassword.query()

		// Discover shares on localhost
		const shares = await livinityd.client.files.discoverNetworkSharesOnServer.query({
			host: 'localhost',
			username: 'livinity',
			password: sharePassword,
		})

		// Should find our test shares
		expect(shares).toMatchObject(expect.arrayContaining(['discover-test-1 (Livinity)', 'discover-test-2 (Livinity)']))
	})
})

describe('isServerAnLivinityDevice()', () => {
	test('returns true for an livinity device', async () => {
		const address = `localhost:${livinityd.instance.server.port}`
		const isServerAnLivinityDevice = await livinityd.client.files.isServerAnLivinityDevice.query({address})
		expect(isServerAnLivinityDevice).toBe(true)
	})

	test('returns false for a non-livinity device', async () => {
		const address = 'localhost:12345'
		const isServerAnLivinityDevice = await livinityd.client.files.isServerAnLivinityDevice.query({address})
		expect(isServerAnLivinityDevice).toBe(false)
	})
})

describe('file permissions', () => {
	test('allows hard deletion of network files', async () => {
		const mountPath = await createNetworkShare(livinityd, 'network-deletion-test')

		// Attempt to hard delete a file from the network share
		await expect(livinityd.client.files.delete.mutate({path: `${mountPath}/test-file.txt`})).resolves.not.toThrow()
	})

	test('does not allow soft trash of network files', async () => {
		const mountPath = await createNetworkShare(livinityd, 'network-trash-test')

		// Attempt to trash a file from the network share
		await expect(livinityd.client.files.trash.mutate({path: `${mountPath}/test-file.txt`})).rejects.toThrow(
			'[operation-not-allowed]',
		)
	})

	test('network mount points are protected paths', async () => {
		const mountPath = await createNetworkShare(livinityd, 'network-protected-test')

		// Test each level of the mount path is protected
		expect(mountPath).toBe('/Network/localhost/network-protected-test (Livinity)')
		const hostnamePath = '/Network/localhost'
		const networkPath = '/Network'
		for (const path of [networkPath, hostnamePath, mountPath]) {
			// Trash
			await expect(livinityd.client.files.trash.mutate({path})).rejects.toThrow('[operation-not-allowed]')
			// Delete
			await expect(livinityd.client.files.delete.mutate({path})).rejects.toThrow('[operation-not-allowed]')
			// Move
			await expect(livinityd.client.files.move.mutate({path, toDirectory: '/Home'})).rejects.toThrow(
				'[operation-not-allowed]',
			)
			// Rename
			await expect(livinityd.client.files.rename.mutate({path, newName: 'Renamed Network Share'})).rejects.toThrow(
				'[operation-not-allowed]',
			)
			// Can't have siblings created
			// Skip /Network cos /test is not a valid base path
			if (path !== networkPath) {
				const siblingPath = nodePath.join(nodePath.dirname(path), 'test')
				await expect(livinityd.client.files.createDirectory.mutate({path: siblingPath})).rejects.toThrow(
					'[operation-not-allowed]',
				)
			}
		}
	})

	test('network storage paths cannot be shared', async () => {
		const mountPath = await createNetworkShare(livinityd, 'network-sharing-test')

		// Test that network paths cannot be shared
		expect(mountPath).toBe('/Network/localhost/network-sharing-test (Livinity)')
		const hostnamePath = '/Network/localhost'
		const networkPath = '/Network'
		const shareFilePath = `${mountPath}/test-file.txt`

		for (const path of [networkPath, hostnamePath, mountPath, shareFilePath]) {
			await expect(livinityd.client.files.addShare.mutate({path})).rejects.toThrow('[operation-not-allowed]')
		}
	})
})

describe('behaviour', () => {
	test('auto mounts an added network share on startup', async () => {
		const mountPath = await createNetworkShare(livinityd, 'startup-test')

		expect(mountPath).toBe('/Network/localhost/startup-test (Livinity)')

		// Verify the share is mounted and accessible
		const networkFiles = await livinityd.client.files.list.query({path: mountPath})
		expect(networkFiles.files).toHaveLength(1)
		expect(networkFiles.files[0].name).toBe('test-file.txt')

		// Set the share watch interval to 100ms and restart livinityd
		livinityd.instance.files.networkStorage.shareWatchInterval = 100
		await livinityd.instance.stop()
		await livinityd.instance.start()

		// Verify the share is still mounted and accessible
		// Retry a few times because it might take a while for the share to be available
		await pRetry(
			async () => {
				const networkFilesAfterRestart = await livinityd.client.files.list.query({path: mountPath})
				expect(networkFilesAfterRestart.files).toHaveLength(1)
				expect(networkFilesAfterRestart.files[0].name).toBe('test-file.txt')
			},
			{retries: 10, factor: 1},
		)
	})

	test('auto mounts remounts a network share if it goes offline and then comes back online', async () => {
		// Set the share watch interval to 100ms and restart livinityd
		livinityd.instance.files.networkStorage.shareWatchInterval = 100
		await livinityd.instance.stop()
		await livinityd.instance.start()

		const mountPath = await createNetworkShare(livinityd, 'reconnect-test')

		expect(mountPath).toBe('/Network/localhost/reconnect-test (Livinity)')

		// Verify the share is mounted and accessible
		const networkFiles = await livinityd.client.files.list.query({path: mountPath})
		expect(networkFiles.files).toHaveLength(1)
		expect(networkFiles.files[0].name).toBe('test-file.txt')

		// Remove the share
		await livinityd.client.files.removeShare.mutate({path: '/Home/reconnect-test'})

		// Verify the share is no longer mounted
		await expect(livinityd.client.files.list.query({path: mountPath})).rejects.toThrow('EHOSTDOWN')

		// Add the share again
		await livinityd.client.files.addShare.mutate({path: '/Home/reconnect-test'})

		// Verify the share got automatically remounted
		await pRetry(
			async () => {
				const networkFilesAfterRestart = await livinityd.client.files.list.query({path: mountPath})
				expect(networkFilesAfterRestart.files).toHaveLength(1)
				expect(networkFilesAfterRestart.files[0].name).toBe('test-file.txt')
			},
			{retries: 10, factor: 1},
		)
	})

	test('cleans up mounts on shutdown', async () => {
		const mountPath = await createNetworkShare(livinityd, 'cleanup-test')

		expect(mountPath).toBe('/Network/localhost/cleanup-test (Livinity)')

		// Verify the share is mounted and accessible
		const networkFiles = await livinityd.client.files.list.query({path: mountPath})
		expect(networkFiles.files).toHaveLength(1)
		expect(networkFiles.files[0].name).toBe('test-file.txt')

		// Check mount point exists
		const systemMountPath = await livinityd.instance.files.virtualToSystemPath(mountPath)
		expect(fse.existsSync(systemMountPath)).toBe(true)

		// Stop livinityd
		await livinityd.instance.stop().catch((error) => console.log(error))

		// Check mount point is removed
		expect(fse.existsSync(systemMountPath)).toBe(false)

		// Start livinityd again (just to afterEach stop doesn't fail)
		await livinityd.instance.start()
	})
})
