import {$} from 'execa'
import fs from 'node:fs/promises'
import stripAnsi from 'strip-ansi'

import type {ProgressStatus} from '../apps/schema.js'
import Livinityd from '../../index.js'

type UpdateStatus = ProgressStatus

const GITHUB_COMMITS_URL = 'https://api.github.com/repos/utopusc/livinity-io/commits/master'
const DEPLOYED_SHA_PATH = '/opt/livos/.deployed-sha'

// Phase 30 UPD-02: progress-percent map for the update.sh `━━━ Section ━━━` markers.
// Sections are emitted by /opt/livos/update.sh as it walks the deploy steps.
const SECTION_PROGRESS: Record<string, number> = {
	'Pulling latest code': 10,
	'Updating LivOS source files': 20,
	'Updating Nexus source files': 30,
	'Installing dependencies': 50,
	'Building packages': 65,
	'Updating gallery cache': 85,
	'Fixing permissions': 90,
	'Restarting services': 95,
	Cleanup: 98,
}

let updateStatus: UpdateStatus
resetUpdateStatus()

function resetUpdateStatus() {
	updateStatus = {running: false, progress: 0, description: '', error: false}
}

function setUpdateStatus(properties: Partial<UpdateStatus>) {
	updateStatus = {...updateStatus, ...properties}
}

export function getUpdateStatus() {
	return updateStatus
}

export async function getLatestRelease(livinityd: Livinityd) {
	// 1. Read locally deployed SHA. ENOENT on first run is expected (update.sh
	// hasn't recorded it yet) — treat as empty so the UI advertises an update.
	let localSha = ''
	try {
		localSha = (await fs.readFile(DEPLOYED_SHA_PATH, 'utf8')).trim()
	} catch (err: any) {
		if (err.code !== 'ENOENT') throw err
	}

	// 2. Fetch latest commit on master. GitHub requires a User-Agent — without
	// it the request returns 403 (Pitfall #7 / docs.github.com REST overview).
	const response = await fetch(GITHUB_COMMITS_URL, {
		headers: {
			'User-Agent': `LivOS-${livinityd.version}`,
			Accept: 'application/vnd.github+json',
		},
	})
	if (!response.ok) {
		throw new Error(`GitHub API returned ${response.status}: ${await response.text()}`)
	}
	const data = (await response.json()) as {
		sha: string
		commit: {
			message: string
			author: {name: string; email: string; date: string}
		}
	}

	return {
		available: data.sha !== localSha,
		sha: data.sha,
		shortSha: data.sha.slice(0, 7),
		message: data.commit.message,
		author: data.commit.author.name,
		committedAt: data.commit.author.date,
	}
}

export async function performUpdate(livinityd: Livinityd): Promise<boolean> {
	setUpdateStatus({running: true, progress: 5, description: 'Starting update...', error: false})

	try {
		const proc = $({cwd: '/opt/livos'})`bash /opt/livos/update.sh`

		const handleOutput = (chunk: Buffer) => {
			const text = stripAnsi(chunk.toString())
			for (const line of text.split('\n')) {
				const sectionMatch = line.match(/━━━\s+(.+?)\s+━━━/)
				if (sectionMatch && SECTION_PROGRESS[sectionMatch[1]] !== undefined) {
					setUpdateStatus({
						progress: SECTION_PROGRESS[sectionMatch[1]],
						description: sectionMatch[1],
					})
				}
			}
		}

		proc.stdout?.on('data', handleOutput)
		proc.stderr?.on('data', handleOutput)
		await proc
	} catch (error) {
		const errMessage = (error as Error).message ?? 'Update failed'
		if (!updateStatus.error) setUpdateStatus({error: errMessage})
		// Reset state but preserve the error so the UI can differentiate a
		// fresh failure from a successful update that's about to restart services.
		const errorStatus = updateStatus.error
		resetUpdateStatus()
		setUpdateStatus({error: errorStatus})
		livinityd.logger.error('update.sh failed', error)
		return false
	}

	setUpdateStatus({running: false, progress: 100, description: 'Updated', error: false})
	return true
}
