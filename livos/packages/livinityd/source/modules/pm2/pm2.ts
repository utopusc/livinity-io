import {$} from 'execa'

import {
	PROTECTED_PM2_PROCESSES,
	type PM2ProcessInfo,
	type PM2ProcessDetail,
	type PM2Operation,
} from './types.js'

export function isProtectedProcess(name: string): boolean {
	const lower = name.toLowerCase()
	return PROTECTED_PM2_PROCESSES.some((p) => p.toLowerCase() === lower)
}

export async function listProcesses(): Promise<PM2ProcessInfo[]> {
	try {
		const result = await $({reject: false})`pm2 jlist`
		if (!result.stdout || result.stdout.trim() === '') return []

		const entries: any[] = JSON.parse(result.stdout)
		return entries
			.map(
				(entry): PM2ProcessInfo => ({
					name: entry.name,
					pm_id: entry.pm_id,
					status: entry.pm2_env?.status ?? 'stopped',
					cpu: entry.monit?.cpu ?? 0,
					memory: entry.monit?.memory ?? 0,
					uptime:
						entry.pm2_env?.status === 'online'
							? Date.now() - (entry.pm2_env?.pm_uptime ?? Date.now())
							: 0,
					restarts: entry.pm2_env?.restart_time ?? 0,
					isProtected: isProtectedProcess(entry.name),
				}),
			)
			.sort((a, b) => a.pm_id - b.pm_id)
	} catch {
		return []
	}
}

export async function manageProcess(
	name: string,
	operation: PM2Operation,
): Promise<{success: boolean; message: string}> {
	if (isProtectedProcess(name) && operation === 'stop') {
		throw new Error(`[protected-process] Cannot stop protected process: ${name}`)
	}

	await $`pm2 ${operation} ${name}`

	const pastTense = operation === 'stop' ? 'stopped' : `${operation}ed`
	return {success: true, message: `Process ${name} ${pastTense} successfully`}
}

export async function getProcessLogs(
	name: string,
	lines: number = 200,
): Promise<string> {
	const result = await $({timeout: 10000, reject: false})`pm2 logs ${name} --lines ${String(lines)} --nostream --raw`
	return result.stdout || ''
}

export async function describeProcess(name: string): Promise<PM2ProcessDetail> {
	let entries: any[]
	try {
		const result = await $`pm2 describe ${name} --json`
		entries = JSON.parse(result.stdout)
	} catch {
		throw new Error(`[not-found] Process not found: ${name}`)
	}

	if (!entries || entries.length === 0) {
		throw new Error(`[not-found] Process not found: ${name}`)
	}

	const entry = entries[0]
	return {
		name: entry.name,
		pm_id: entry.pm_id,
		pid: entry.pid ?? 0,
		script: entry.pm2_env?.pm_exec_path ?? 'N/A',
		cwd: entry.pm2_env?.pm_cwd ?? 'N/A',
		nodeVersion: entry.pm2_env?.node_version ?? 'N/A',
		execMode: entry.pm2_env?.exec_mode ?? 'fork',
		status: entry.pm2_env?.status ?? 'stopped',
		restarts: entry.pm2_env?.restart_time ?? 0,
		uptime:
			entry.pm2_env?.status === 'online'
				? Date.now() - (entry.pm2_env?.pm_uptime ?? Date.now())
				: 0,
		createdAt: entry.pm2_env?.created_at ?? 0,
	}
}
