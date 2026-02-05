import {expect, beforeEach, afterEach, test} from 'vitest'
import yaml from 'js-yaml'
import fse from 'fs-extra'

import createTestLivinityd from '../test-utilities/create-test-livinityd.js'

async function readYaml(path: string) {
	return yaml.load(await fse.readFile(path, 'utf8'))
}

// Fresh non-running livinityd instance for each test
let livinityd: Awaited<ReturnType<typeof createTestLivinityd>>
beforeEach(async () => (livinityd = await createTestLivinityd({autoStart: false})))
afterEach(() => livinityd.cleanup())

test('legacy downloads directory is migrated', async () => {
	const dataDirectory = livinityd.instance.dataDirectory
	const legacyDownloadsDirectory = `${dataDirectory}/data/storage/downloads`
	const legacyDownloadsFile = `${legacyDownloadsDirectory}/bitcoin.pdf`
	const newDownloadsDirectory = `${dataDirectory}/home/Downloads`
	const newDownloadsFile = `${newDownloadsDirectory}/bitcoin.pdf`

	// Create legacy downloads data
	await fse.ensureDir(legacyDownloadsDirectory)
	await fse.writeFile(legacyDownloadsFile, 'Bitcoin: A Peer-to-Peer Electronic Cash System')

	// Ensure files exist at legacy path and not new path
	await expect(fse.pathExists(legacyDownloadsDirectory)).resolves.toBe(true)
	await expect(fse.pathExists(legacyDownloadsFile)).resolves.toBe(true)
	await expect(fse.pathExists(newDownloadsDirectory)).resolves.toBe(false)
	await expect(fse.pathExists(newDownloadsFile)).resolves.toBe(false)

	// Start livinityd
	await livinityd.instance.start()

	// Ensure files are migrated to new path
	await expect(fse.pathExists(legacyDownloadsDirectory)).resolves.toBe(false)
	await expect(fse.pathExists(legacyDownloadsFile)).resolves.toBe(false)
	await expect(fse.pathExists(newDownloadsDirectory)).resolves.toBe(true)
	await expect(fse.pathExists(newDownloadsFile)).resolves.toBe(true)
})

test('Back That Mac Up app port is migrated from 445 to 1445', async () => {
	const {dataDirectory} = livinityd.instance
	const appComposeFile = `${dataDirectory}/app-data/back-that-mac-up/docker-compose.yml`

	// Create app directory structure
	await fse.ensureFile(appComposeFile)

	// Create docker-compose.yml with old port mapping
	const oldComposeContent = {
		version: '3.7',
		services: {
			timemachine: {
				ports: ['445:445'],
				random: 'property',
			},
			random: 'property',
		},
	}
	await fse.writeFile(appComposeFile, yaml.dump(oldComposeContent))

	// Mark app as installed in store
	await livinityd.instance.store.set('apps', ['back-that-mac-up'])

	// Check the docker-compose.yml has the expected value
	await expect(readYaml(appComposeFile)).resolves.toMatchObject(oldComposeContent)

	// Start livinityd
	await livinityd.instance.start()

	// Check if the docker-compose.yml has been updated with the new port mapping
	// and all other values are the same
	await expect(readYaml(appComposeFile)).resolves.toMatchObject({
		version: '3.7',
		services: {
			timemachine: {
				ports: ['1445:445'],
				random: 'property',
			},
			random: 'property',
		},
	})

	// Verify notification was created
	const notifications = await livinityd.instance.notifications.get()
	expect(notifications.includes('migrated-back-that-mac-up')).toBe(true)
})

test('first run writes version without adding a notification', async () => {
	// Ensure no version is set on first run
	const versionBefore = await livinityd.instance.store.get('version')
	expect(versionBefore).toBeUndefined()

	// Start livinityd
	await livinityd.instance.start()

	// Verify version is written to store
	const versionAfter = await livinityd.instance.store.get('version')
	expect(versionAfter).toBe(livinityd.instance.version)

	// Verify no notification was created (first run)
	const notifications = await livinityd.instance.notifications.get()
	expect(notifications.includes('livos-updated')).toBe(false)
})

test('OS update adds a notification', async () => {
	const oldVersion = '1.4.2'

	// Set an old version in the store
	await livinityd.instance.store.set('version', oldVersion)

	// Verify old version is set
	const versionBefore = await livinityd.instance.store.get('version')
	expect(versionBefore).toBe(oldVersion)

	// Start livinityd
	await livinityd.instance.start()

	// Verify version is updated to current version
	const versionAfter = await livinityd.instance.store.get('version')
	expect(versionAfter).toBe(livinityd.instance.version)
	expect(versionAfter).not.toBe(oldVersion)

	// Verify notification was created
	const notifications = await livinityd.instance.notifications.get()
	expect(notifications.includes('livos-updated')).toBe(true)
})

test('restarting with same version does not add a notification', async () => {
	const currentVersion = livinityd.instance.version

	// Start livinityd
	await livinityd.instance.start()

	// Verify version is written after first start
	const versionAfterFirstStart = await livinityd.instance.store.get('version')
	expect(versionAfterFirstStart).toBe(currentVersion)

	// Stop livinityd
	await livinityd.instance.stop()

	// Restart livinityd with the same version
	await livinityd.instance.start()

	// Verify version remains the same
	const versionAfterRestart = await livinityd.instance.store.get('version')
	expect(versionAfterRestart).toBe(currentVersion)

	// Verify no notification was created
	const notifications = await livinityd.instance.notifications.get()
	expect(notifications.includes('livos-updated')).toBe(false)
})
