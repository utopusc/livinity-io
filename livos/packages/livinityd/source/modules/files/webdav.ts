import fse from 'fs-extra'

import {listUsers} from '../database/index.js'

import type Livinityd from '../../index.js'

// Phase 329 FILES-05 (329-05) — the fixed webdavd loopback port. This is the
// 329-04 wrapper constant (livos-webdav.sh configures SFTPGo's webdavd on
// 127.0.0.1:9083); mirrored into the `webdav` StoreSchema default so the toggle
// route + the Settings card can render a port without re-reading /etc/sftpgo.
export const WEBDAV_PORT = 9083

// Per-user WebDAV home = the user's OWN data root
// (`${dataDirectory}/users/${username}` — the 329-04 users_base_dir
// `/opt/livos/data/users` + `%username%` template, and the files.ts per-user
// isolation convention). Each SFTPGo account is scoped to ITS OWN home_dir — this
// is the deliberate DIVERGENCE (D-07) from Samba's single shared forced-root
// account: no shared account, no forced-root mapping, no single shared
// smbpasswd secret. Shared by the WebDav class (on-disk reconcile) and the
// loopback external_auth_hook endpoint (the home_dir it returns to SFTPGo) so the
// two never drift.
export function webdavHomeDir(livinityd: Livinityd, username: string): string {
	return `${livinityd.dataDirectory}/users/${username}`
}

// Per-user WebDAV (SFTPGo) manager. Clones the SHAPE of files/samba.ts
// (constructor childLogger, start()/stop() lifecycle, store-driven apply(),
// private #get() store read) but is deliberately PER-USER: it does NOT reuse
// Samba's single-shared-account model. Auth is delegated live to the loopback
// external_auth_hook endpoint (files/api.ts → PG bcrypt, the single source of
// truth); the privileged daemon install/configure/remove is delegated to the
// root wrapper via runWebdav (system/routes.ts). This class itself only owns the
// non-privileged store state + the on-disk per-user home reconcile — it NEVER
// writes privileged files or runs systemctl directly.
export default class WebDav {
	#livinityd: Livinityd
	logger: Livinityd['logger']

	constructor(livinityd: Livinityd) {
		this.#livinityd = livinityd
		const {name} = this.constructor
		this.logger = livinityd.logger.createChildLogger(`files:${name.toLowerCase()}`)
	}

	// Read current WebDAV state from the store (dedicated top-level `webdav` key,
	// D-26). Missing key → safe defaults (disabled, wrapper port, none reconciled).
	async #get() {
		const state = await this.#livinityd.store.get('webdav')
		return {
			enabled: state?.enabled ?? false,
			port: state?.port ?? WEBDAV_PORT,
			provisionedUsers: state?.provisionedUsers ?? [],
		}
	}

	// Lifecycle: mirror samba.start() — reconcile on boot if enabled. NEVER throws
	// (fail-soft): a WebDAV error must not take down the files module or block boot.
	async start() {
		const {enabled} = await this.#get()
		if (!enabled) return
		this.logger.log('Starting webdav')
		await this.apply().catch((error) => this.logger.error('Failed to apply webdav', error))
	}

	async stop() {
		// The webdavd daemon lifecycle is owned by the root wrapper (livos-webdav.sh
		// via runWebdav in system/routes.ts) — this class never runs systemctl or
		// writes privileged files, so there is nothing per-process to tear down here.
		this.logger.log('Stopping webdav')
	}

	// Store-driven per-user reconcile. For each LivOS (PG) user, ensure their WebDAV
	// home_dir exists and is owned by the files user, so an external_auth_hook login
	// lands in a ready directory. FAIL-SOFT (D-08): each per-user step is wrapped in
	// try/catch — a single user's failure is logged + retried on the next apply and
	// can NEVER propagate to block LivOS user creation. SFTPGo accounts themselves are
	// NOT pre-provisioned here: the loopback external_auth_hook creates/authenticates
	// them on demand against the PG bcrypt table (the REST-upsert path stays off — the
	// httpd binding is disabled, 329-04), so "reconcile" is purely the on-disk
	// home_dir set.
	async apply() {
		const {enabled, port} = await this.#get()
		if (!enabled) return

		const users = await listUsers().catch((error) => {
			this.logger.error('Failed to list users for webdav reconcile', error)
			return []
		})

		const {userId, groupId} = this.#livinityd.files.fileOwner
		const provisionedUsers: string[] = []

		for (const user of users) {
			try {
				const home_dir = webdavHomeDir(this.#livinityd, user.username)
				await fse.ensureDir(home_dir)
				await fse.chown(home_dir, userId, groupId).catch(() => {})
				provisionedUsers.push(user.username)
			} catch (error) {
				// FAIL-SOFT: swallow + retry on the next apply. NEVER rethrow.
				this.logger.error('Failed to reconcile a webdav home (retry next apply)', error)
			}
		}

		// Persist which users the last apply reconciled (non-secret bookkeeping only —
		// passwords stay in the PG bcrypt table, never here).
		await this.#livinityd.store
			.set('webdav', {enabled, port, provisionedUsers})
			.catch((error) => this.logger.error('Failed to persist webdav provisioning state', error))
	}

	// Toggle WebDAV on/off in the store, then reconcile (fail-soft). The privileged
	// configure/remove of the SFTPGo daemon is driven by the caller via runWebdav
	// (system/routes.ts); this only owns the store flag + the on-disk home reconcile.
	async setEnabled(enabled: boolean) {
		const {port, provisionedUsers} = await this.#get()
		await this.#livinityd.store.set('webdav', {enabled, port, provisionedUsers})
		if (enabled) await this.apply().catch((error) => this.logger.error('Failed to apply webdav', error))
	}
}
