import fse from 'fs-extra'
import yaml from 'js-yaml'
import os from 'node:os'
import path from 'node:path'

import {getBuiltinApp} from './builtin-apps.js'

/**
 * Generate docker-compose.yml and livinity-app.yml for a builtin app.
 * Writes files to a temporary directory and returns the path.
 * Returns null if appId is not a builtin app or has no compose definition.
 */
export async function generateAppTemplate(appId: string): Promise<string | null> {
	const app = getBuiltinApp(appId)
	if (!app || !app.compose) return null

	// Create temp directory with unique name
	const tmpDir = path.join(os.tmpdir(), `livos-template-${appId}-${Date.now()}`)
	await fse.mkdirp(tmpDir)

	// Build docker-compose.yml from compose definition
	const composeDoc: Record<string, any> = {
		version: '3.7',
		services: {},
	}

	for (const [serviceName, serviceDef] of Object.entries(app.compose.services)) {
		const service: Record<string, any> = {
			image: serviceDef.image,
			restart: serviceDef.restart,
		}

		if (serviceDef.container_name) {
			service.container_name = serviceDef.container_name
		}
		if (serviceDef.environment && Object.keys(serviceDef.environment).length > 0) {
			service.environment = {...serviceDef.environment}
		}
		if (serviceDef.volumes && serviceDef.volumes.length > 0) {
			service.volumes = [...serviceDef.volumes]
		}
		if (serviceDef.ports && serviceDef.ports.length > 0) {
			service.ports = [...serviceDef.ports]
		}
		if (serviceDef.healthcheck) {
			service.healthcheck = {
				test: serviceDef.healthcheck.test,
				interval: serviceDef.healthcheck.interval,
				timeout: serviceDef.healthcheck.timeout,
				retries: serviceDef.healthcheck.retries,
			}
			if (serviceDef.healthcheck.start_period) {
				service.healthcheck.start_period = serviceDef.healthcheck.start_period
			}
		}
		if (serviceDef.network_mode) {
			service.network_mode = serviceDef.network_mode
		}
		if (serviceDef.privileged) {
			service.privileged = serviceDef.privileged
		}
		if (serviceDef.devices && serviceDef.devices.length > 0) {
			service.devices = [...serviceDef.devices]
		}
		if (serviceDef.depends_on && serviceDef.depends_on.length > 0) {
			service.depends_on = [...serviceDef.depends_on]
		}
		if (serviceDef.command && serviceDef.command.length > 0) {
			service.command = serviceDef.command
		}
		// v30.5 — entrypoint override (vs command which only overrides CMD).
		// Suna's kortix-api uses this to run a wrapper that writes OpenCode config
		// from OPENCODE_CONFIG_JSON env before exec'ing the upstream CMD.
		if ((serviceDef as any).entrypoint && (serviceDef as any).entrypoint.length > 0) {
			service.entrypoint = [...(serviceDef as any).entrypoint]
		}
		// v30.5 — env_file directive: load env vars from a file in the compose dir.
		// Multi-service apps use this to share user-provided values written by
		// app.ts patchComposeFile to `.env` from environmentOverrides. Without this
		// passthrough, kortix-api fails env validation (DATABASE_URL Required etc.).
		if ((serviceDef as any).env_file && (serviceDef as any).env_file.length > 0) {
			service.env_file = [...(serviceDef as any).env_file]
		}
		// v30.5 — working_dir for images that need explicit CWD when entrypoint
		// is overridden (e.g. Suna's kortix-api expects /app/apps/api).
		if ((serviceDef as any).working_dir) {
			service.working_dir = (serviceDef as any).working_dir
		}
		if ((serviceDef as any).user) {
			service.user = (serviceDef as any).user
		}
		if (serviceDef.shm_size) {
			service.shm_size = serviceDef.shm_size
		}
		if (serviceDef.security_opt && serviceDef.security_opt.length > 0) {
			service.security_opt = [...serviceDef.security_opt]
		}

		composeDoc.services[serviceName] = service
	}

	// Write docker-compose.yml
	await fse.writeFile(
		path.join(tmpDir, 'docker-compose.yml'),
		yaml.dump(composeDoc, {lineWidth: -1, noRefs: true}),
	)

	// Build livinity-app.yml manifest
	// Must satisfy AppManifest required fields: manifestVersion, id, name, tagline,
	// category, version, port, description, website, support, gallery
	const manifest: Record<string, any> = {
		manifestVersion: '1.0.0',
		id: app.id,
		name: app.name,
		tagline: app.tagline,
		category: app.category,
		version: app.version,
		port: app.port,
		description: app.description,
		website: app.website,
		developer: app.developer,
		support: app.website,
		gallery: [] as string[],
	}
	// Add credentials if defined
	if ((app as any).defaultUsername) manifest.defaultUsername = (app as any).defaultUsername
	if ((app as any).defaultPassword) manifest.defaultPassword = (app as any).defaultPassword
	if ((app as any).deterministicPassword) manifest.deterministicPassword = true
	// Phase 43.3: propagate icon, repo, requiresAiProvider so the marketplace UI
	// renders correctly + apps.ts:install() Phase 43.2 inject runs for builtin apps
	// that opt into the broker (e.g. MiroFish, Open WebUI clones).
	if ((app as any).icon) manifest.icon = (app as any).icon
	if ((app as any).repo) manifest.repo = (app as any).repo
	if ((app as any).requiresAiProvider === true) manifest.requiresAiProvider = true
	// Phase 43.5: propagate installOptions so generated manifest carries the
	// install dialog's environmentOverrides + subdomain. Without this, builtin
	// apps installed via the compose-generated path lose their env-prompt
	// metadata after rsync (the dialog still works because the marketplace UI
	// reads installOptions from registry augmentation, but downstream consumers
	// like reapplyAppConfig that read manifest from disk get an undefined
	// installOptions and skip subdomain resolution — falling back to appId).
	if ((app as any).installOptions) manifest.installOptions = (app as any).installOptions

	// Write livinity-app.yml
	await fse.writeFile(
		path.join(tmpDir, 'livinity-app.yml'),
		yaml.dump(manifest, {lineWidth: -1, noRefs: true}),
	)

	// Create app-specific config files
	if (app.id === 'filebrowser') {
		await fse.writeFile(
			path.join(tmpDir, 'filebrowser.json'),
			JSON.stringify({port: 80, baseURL: '', address: '0.0.0.0', log: 'stdout', database: '/database.db', root: '/srv'}, null, 2),
		)
	}

	return tmpDir
}
