import {URL} from 'node:url'
import crypto from 'node:crypto'

import fse from 'fs-extra'
import * as git from 'isomorphic-git'
import http from 'isomorphic-git/http/node'
import yaml from 'js-yaml'
import {globby} from 'globby'
import {$} from 'execa'

import type Livinityd from '../../index.js'
import randomToken from '../utilities/random-token.js'
import {type AppRepositoryMeta, type AppManifest, validateManifest} from './schema.js'
import {LIVINITY_APP_STORE_REPO} from '../../constants.js'
import {validateUrl} from '../webapps/url-validator.js'

async function readYaml(path: string) {
	return yaml.load(await fse.readFile(path, 'utf8'))
}

// TODO: Refactor some of this logic out into utilities

export type AppRepositoryOptions = {
	// Phase 257-02 (WS-C, LIVOS-024): the SSRF-strict path defaults to non-admin
	// (private/loopback/link-local/metadata hosts + non-http(s) schemes rejected).
	// addRepository is reached via the now-adminProcedure route (256-03), so the
	// operator-initiated add passes isAdmin:true; any non-admin/automated path
	// stays strict.
	isAdmin?: boolean
}

export default class AppRepository {
	#livinityd: Livinityd
	logger: Livinityd['logger']
	url: string
	path: string

	constructor(livinityd: Livinityd, url: string, opts: AppRepositoryOptions = {}) {
		// Phase 257-02 (WS-C, LIVOS-024): reuse the webapps SSRF validator (scheme
		// allowlist + isPrivateHost) BEFORE any git.clone / git.listServerRefs
		// fetch, so livinityd can't be driven to reach internal targets.
		//
		// We intentionally keep `this.url` as the ORIGINAL input (not
		// res.normalized): cleanUrl() hashes this.url to derive the on-disk
		// app-store cache directory name, and the persisted appRepositories set is
		// keyed on the raw url. Swapping in the normalized form would rename every
		// existing cache dir (orphaning the clone) and change dedup keys. The
		// security gate (reject private/loopback/link-local/metadata + non-http(s))
		// is fully enforced regardless of which string we then store.
		const res = validateUrl(url, {isAdmin: opts.isAdmin ?? false})
		if (!res.ok) throw new Error(`Invalid repository URL: ${res.reason}`)
		this.#livinityd = livinityd
		this.url = url
		this.path = `${livinityd.dataDirectory}/app-stores/${this.cleanUrl()}`
		const {name} = this.constructor
		this.logger = livinityd.logger.createChildLogger(name.toLowerCase())
	}

	// Clean URL so it's safe to use as a directory name
	cleanUrl() {
		const {hostname, pathname} = new URL(this.url)
		const basename = hostname.split('.')[0]
		const username = pathname.split('/')[1]
		const repository = pathname.split('/')[2]?.replace(/\.git$/, '')
		const hash = crypto.createHash('sha256').update(this.url).digest('hex').slice(0, 8)

		let cleanUrl = ''
		if (username && repository) cleanUrl += `${username}-${repository}-`
		cleanUrl += `${basename}-${hash}`

		return (
			cleanUrl
				// Convert the URL to lowercase
				.toLowerCase()
				// Remove all characters that are not alphanumeric, dot, or hyphen
				.replace(/[^a-zA-Z0-9.-]/g, '')
		)
	}

	// Atomically clones the repository. This ensures that the repository is fully cloned
	// or not cloned at all, it will never be in a partial state while the clone is in progress.
	// Can also be used to atomically update instead of a pull.
	async atomicClone() {
		const temporaryPath = `${this.#livinityd.dataDirectory}/app-stores/.tmp/${randomToken(64)}`

		await git.clone({
			fs: fse,
			http,
			url: this.url,
			dir: temporaryPath,
			depth: 1,
			singleBranch: true,
		})

		// We're running as root so we need to relax file permissions so container can access them
		await $`chown -R 1000:1000 ${temporaryPath}`

		// We also need to strip out all .gitkeep files since some apps cannot be initialised with
		// a non-empty volume directory
		await $`find ${temporaryPath} -name .gitkeep -delete`

		await fse.move(temporaryPath, this.path, {overwrite: true})
	}

	// Get the current local commit
	async getCurrentCommit() {
		const localBranch = await git.currentBranch({fs: fse, dir: this.path, fullname: true})
		return git.resolveRef({fs: fse, dir: this.path, ref: localBranch as string})
	}

	// Get the latest remote commit from the default branch
	async checkLatestCommit() {
		const remoteRefs = await git.listServerRefs({http, url: this.url})
		const latestCommitInDefaultRemoteBranch = remoteRefs.find((ref) => ref.ref === 'HEAD')!.oid
		return latestCommitInDefaultRemoteBranch
	}

	// Check if the app repo is behind the remote repo
	async isUpdated() {
		try {
			const currentCommit = await this.getCurrentCommit()
			const latestCommit = await this.checkLatestCommit()
			return currentCommit === latestCommit
		} catch {
			// No matter what goes wrong just return false
			return false
		}
	}

	// Update (or install) the repo
	async update() {
		this.logger.log(`Checking for update for ${this.url}`)
		const isUpdated = await this.isUpdated()
		if (isUpdated) {
			this.logger.log(`${this.url} is already up to date`)
		} else {
			this.logger.log(`Newer version of ${this.url} available, updating`)
			await this.atomicClone()
			this.logger.log(`Updated ${this.url}!`)
		}

		return this.isUpdated()
	}

	// Read registry
	async readRegistry() {
		// Get repo metadata

		let meta: AppRepositoryMeta

		// Handle official repo which does not have meta
		// TODO: Instead of this hack we can probably just add this to the official repo
		// before we ship this code.
		if (this.url === LIVINITY_APP_STORE_REPO) {
			meta = {
				id: 'livinity-app-store',
				name: 'Livinity App Store',
			}
		} else {
			meta = (await readYaml(`${this.path}/livinity-app-store.yml`)) as AppRepositoryMeta
		}

		// Read app manifests from store
		const appManifests = await globby([
			`${this.path}/*/livinity-app.yml`,
		])

		const parsedManifestsPromises = appManifests.map((manifest) =>
			readYaml(manifest)
				.catch((error) => {
					this.logger.error(`Manifest parsing of ${manifest} failed`, error)
				})
				.then(validateManifest)
				.catch((error) => {
					this.logger.error(`Manifest validation of ${manifest} failed`, error)
				}),
		)

		// Wait for all reads to finish
		const manifests = await Promise.all(parsedManifestsPromises)

		// Process results and add mandatory properties
		const apps = manifests
			// Filter out invalid manifests
			.filter((app): app is AppManifest => app !== undefined)
			// Filter out disabled apps
			.filter((app) => app.disabled !== true)
			// Filter out invalid IDs
			.filter((app) => meta.id === 'livinity-app-store' || app.id.startsWith(meta.id))
			// Add icons and hydrate app store id
			.map((app) => ({
				...app,
				appStoreId: meta.id,
				// Use LivOS gallery for icons (we removed gallery images, only icons remain)
				icon: app.icon ?? `https://raw.githubusercontent.com/utopusc/livinity-apps-gallery/master/${app.id}/icon.svg`,
			}))
			// Sort apps alphabetically
			.sort((a: any, b: any) => a.id.localeCompare(b.id))

		return {
			url: this.url,
			meta,
			apps,
		}
	}
}
