import {mkdir, writeFile, readFile, rm} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {$} from 'execa'
import Dockerode from 'dockerode'

import type {StackInfo, StackContainer, StackControlOperation} from './types.js'

const docker = new Dockerode({socketPath: '/var/run/docker.sock'})

const STACKS_DIR = '/opt/livos/data/stacks'

async function ensureStacksDir(name: string): Promise<string> {
	const stackDir = join(STACKS_DIR, name)
	await mkdir(stackDir, {recursive: true})
	return stackDir
}

export async function listStacks(): Promise<StackInfo[]> {
	const containers = await docker.listContainers({all: true})

	// Group containers by compose project label
	const projects = new Map<string, StackContainer[]>()

	for (const c of containers) {
		const project = c.Labels?.['com.docker.compose.project']
		if (!project) continue

		if (!projects.has(project)) {
			projects.set(project, [])
		}

		projects.get(project)!.push({
			id: c.Id.slice(0, 12),
			name: c.Names[0]?.replace('/', '') ?? c.Id.slice(0, 12),
			image: c.Image,
			state: c.State,
			status: c.Status,
		})
	}

	// Build StackInfo array
	const stacks: StackInfo[] = []

	for (const [name, stackContainers] of projects) {
		const allRunning = stackContainers.every((c) => c.state === 'running')
		const allStopped = stackContainers.every(
			(c) => c.state === 'exited' || c.state === 'created' || c.state === 'dead',
		)

		let status: StackInfo['status']
		if (allRunning) {
			status = 'running'
		} else if (allStopped) {
			status = 'stopped'
		} else {
			status = 'partial'
		}

		stacks.push({
			name,
			status,
			containerCount: stackContainers.length,
			containers: stackContainers,
		})
	}

	return stacks.sort((a, b) => a.name.localeCompare(b.name))
}

export async function deployStack(input: {
	name: string
	composeYaml: string
	envVars?: Array<{key: string; value: string}>
}): Promise<{success: boolean; message: string}> {
	// Validate stack name
	if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(input.name)) {
		throw new Error(
			`[validation-error] Invalid stack name '${input.name}'. Must start with alphanumeric and contain only [a-zA-Z0-9_.-]`,
		)
	}

	const stackDir = await ensureStacksDir(input.name)
	const composePath = join(stackDir, 'docker-compose.yml')

	// Write compose file
	await writeFile(composePath, input.composeYaml, 'utf-8')

	// Write .env file if envVars provided
	if (input.envVars && input.envVars.length > 0) {
		const envContent = input.envVars.map((e) => `${e.key}=${e.value}`).join('\n') + '\n'
		await writeFile(join(stackDir, '.env'), envContent, 'utf-8')
	}

	// Run docker compose up
	try {
		await $({cwd: stackDir})`docker compose -p ${input.name} -f ${composePath} up -d`
	} catch (err: any) {
		throw new Error(`[compose-error] Failed to deploy stack '${input.name}': ${err.stderr || err.message}`)
	}

	return {success: true, message: `Stack '${input.name}' deployed`}
}

export async function editStack(input: {
	name: string
	composeYaml: string
	envVars?: Array<{key: string; value: string}>
}): Promise<{success: boolean; message: string}> {
	const stackDir = join(STACKS_DIR, input.name)

	if (!existsSync(stackDir)) {
		throw new Error(`[not-found] Stack '${input.name}' not found`)
	}

	const composePath = join(stackDir, 'docker-compose.yml')

	// Overwrite compose file
	await writeFile(composePath, input.composeYaml, 'utf-8')

	// Write .env file if envVars provided
	if (input.envVars && input.envVars.length > 0) {
		const envContent = input.envVars.map((e) => `${e.key}=${e.value}`).join('\n') + '\n'
		await writeFile(join(stackDir, '.env'), envContent, 'utf-8')
	}

	// Run docker compose up with --remove-orphans
	try {
		await $({cwd: stackDir})`docker compose -p ${input.name} -f ${composePath} up -d --remove-orphans`
	} catch (err: any) {
		throw new Error(`[compose-error] Failed to update stack '${input.name}': ${err.stderr || err.message}`)
	}

	return {success: true, message: `Stack '${input.name}' updated`}
}

export async function controlStack(
	name: string,
	operation: StackControlOperation,
): Promise<{success: boolean; message: string}> {
	const stackDir = join(STACKS_DIR, name)

	if (!existsSync(stackDir)) {
		throw new Error(`[not-found] Stack '${name}' not found`)
	}

	const composePath = join(stackDir, 'docker-compose.yml')

	try {
		if (operation === 'up') {
			await $({cwd: stackDir})`docker compose -p ${name} -f ${composePath} up -d`
		} else {
			await $({cwd: stackDir})`docker compose -p ${name} -f ${composePath} ${operation}`
		}
	} catch (err: any) {
		throw new Error(
			`[compose-error] Failed to ${operation} stack '${name}': ${err.stderr || err.message}`,
		)
	}

	return {success: true, message: `Stack '${name}' ${operation} completed`}
}

export async function removeStack(
	name: string,
	removeVolumes?: boolean,
): Promise<{success: boolean; message: string}> {
	const stackDir = join(STACKS_DIR, name)

	if (!existsSync(stackDir)) {
		throw new Error(`[not-found] Stack '${name}' not found`)
	}

	const composePath = join(stackDir, 'docker-compose.yml')

	try {
		if (removeVolumes) {
			await $({cwd: stackDir})`docker compose -p ${name} -f ${composePath} down --volumes`
		} else {
			await $({cwd: stackDir})`docker compose -p ${name} -f ${composePath} down`
		}
	} catch (err: any) {
		throw new Error(
			`[compose-error] Failed to remove stack '${name}': ${err.stderr || err.message}`,
		)
	}

	// Remove stack directory after successful compose down
	await rm(stackDir, {recursive: true, force: true})

	return {success: true, message: `Stack '${name}' removed`}
}

export async function getStackCompose(name: string): Promise<string> {
	const composePath = join(STACKS_DIR, name, 'docker-compose.yml')

	if (!existsSync(composePath)) {
		throw new Error(`[not-found] Stack '${name}' compose file not found`)
	}

	return readFile(composePath, 'utf-8')
}

export async function getStackEnv(
	name: string,
): Promise<Array<{key: string; value: string}>> {
	const envPath = join(STACKS_DIR, name, '.env')

	if (!existsSync(envPath)) {
		return []
	}

	const content = await readFile(envPath, 'utf-8')
	const envVars: Array<{key: string; value: string}> = []

	for (const line of content.split('\n')) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue

		const eqIndex = trimmed.indexOf('=')
		if (eqIndex === -1) continue

		envVars.push({
			key: trimmed.slice(0, eqIndex),
			value: trimmed.slice(eqIndex + 1),
		})
	}

	return envVars
}
