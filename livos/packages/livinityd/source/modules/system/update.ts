import {$} from 'execa'
import type {ProgressStatus} from '../apps/schema.js'
import {detectDevice, isLivOS} from './system.js'
import Livinityd from '../../index.js'
import {domains} from '@livos/config'

type UpdateStatus = ProgressStatus

let updateStatus: UpdateStatus
resetUpdateStatus()

function resetUpdateStatus() {
	updateStatus = {
		running: false,
		progress: 0,
		description: '',
		error: false,
	}
}

function setUpdateStatus(properties: Partial<UpdateStatus>) {
	updateStatus = {...updateStatus, ...properties}
}

export function getUpdateStatus() {
	return updateStatus
}

export async function getLatestRelease(livinityd: Livinityd) {
	let deviceId = 'unknown'
	try {
		deviceId = (await detectDevice()).deviceId
	} catch (error) {
		livinityd.logger.error(`Failed to detect device type`, error)
	}

	let platform = 'unknown'
	try {
		if (await isLivOS()) {
			platform = 'LivOS'
		}
	} catch (error) {
		livinityd.logger.error(`Failed to detect platform`, error)
	}

	let channel = 'stable'
	try {
		channel = (await livinityd.store.get('settings.releaseChannel')) || 'stable'
	} catch (error) {
		livinityd.logger.error(`Failed to get release channel`, error)
	}

	const apiDomain = `${domains.api}.${domains.primary}`
	const protocol = domains.useHttps ? 'https' : 'http'
	const updateUrl = new URL(`${protocol}://${apiDomain}/latest-release`)
	// Provide context to the update server about the underlying device and platform
	// so we can avoid the 1.0 update situation where we need to shim multiple update
	// mechanisms and error-out updates for unsupported platforms. This also helps
	// notifying users for critical security updates that are be relevant only to their specific
	// platform, and avoids notififying users of updates that aren't yet available for their
	// platform.
	updateUrl.searchParams.set('version', livinityd.version)
	updateUrl.searchParams.set('device', deviceId)
	updateUrl.searchParams.set('platform', platform)
	updateUrl.searchParams.set('channel', channel)

	const result = await fetch(updateUrl, {
		headers: {'User-Agent': `LivOS ${livinityd.version}`},
	})
	const data = await result.json()
	return data as {version: string; name: string; releaseNotes: string; updateScript?: string}
}

export async function performUpdate(livinityd: Livinityd) {
	setUpdateStatus({running: true, progress: 5, description: 'Updating...', error: false})

	try {
		const {updateScript} = await getLatestRelease(livinityd)

		if (!updateScript) {
			setUpdateStatus({error: 'No update script found'})
			throw new Error('No update script found')
		}

		const result = await fetch(updateScript, {
			headers: {'User-Agent': `LivOS ${livinityd.version}`},
		})
		const updateSCriptContents = await result.text()

		// Exectute update script and report progress
		const process = $`bash -c ${updateSCriptContents}`
		let menderInstallDots = 0
		async function handleUpdateScriptOutput(chunk: Buffer) {
			const text = chunk.toString()
			const lines = text.split('\n')
			for (const line of lines) {
				// Handle our custom status updates
				if (line.startsWith('livinity-update: ')) {
					try {
						const status = JSON.parse(line.replace('livinity-update: ', '')) as Partial<UpdateStatus>
						setUpdateStatus(status)
					} catch (error) {
						// Don't kill update on JSON parse errors
					}
				}

				// Handle mender install progress
				if (line === '.') {
					menderInstallDots++
					// Mender install will stream 70 dots to stdout, lets convert that into 5%-95% of install progress
					const progress = Math.min(95, Math.floor((menderInstallDots / 70) * 90) + 5)
					livinityd.logger.log(`Update progress: ${progress}%`)
					setUpdateStatus({progress})
				}
			}
		}
		process.stdout?.on('data', (chunk) => handleUpdateScriptOutput(chunk))
		process.stderr?.on('data', (chunk) => handleUpdateScriptOutput(chunk))

		// Wait for script to complete and handle errors
		await process
	} catch (error) {
		// Don't overwrite a useful error message reported by the update script
		if (!updateStatus.error) setUpdateStatus({error: 'Update failed'})

		// Reset the state back to running but leave the error message so ui polls
		// can differentiate between a successful update after reboot and a failed
		// update that didn't reboot.
		const errorStatus = updateStatus.error
		resetUpdateStatus()
		setUpdateStatus({error: errorStatus})

		livinityd.logger.error(`Update script failed`, error)

		return false
	}

	setUpdateStatus({running: false, progress: 100, description: 'Restarting...'})

	return true
}
