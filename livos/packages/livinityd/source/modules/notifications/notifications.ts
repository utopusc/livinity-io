import type Livinityd from '../../index.js'
import type {AlertSeverity} from './channel-types.js'

export default class Notifications {
	#store: Livinityd['store']
	// Phase 310-02 — kept so add({external}) can fan out through the Dispatcher
	// owned by livinityd.notificationChannels (the single external-dispatch choke
	// point). The in-app-bell FileStore write is UNCHANGED and never depends on it.
	#livinityd: Livinityd
	logger: Livinityd['logger']

	constructor(livinityd: Livinityd) {
		this.#store = livinityd.store
		this.#livinityd = livinityd
		const {name} = this.constructor
		this.logger = livinityd.logger.createChildLogger(name.toLowerCase())
	}

	// Get the user object from the store
	async get() {
		return (await this.#store.get('notifications')) || []
	}

	async add(notification: string, opts?: {severity?: AlertSeverity; external?: boolean}) {
		this.logger.log(`Adding notification: ${notification}`)
		await this.#store.getWriteLock(async ({set}) => {
			// Get all notifications
			let notifications = await this.get()

			// Remove current one if it already exists so it's
			// moved to the front
			notifications = notifications.filter((n) => n !== notification)

			// Add new notification
			notifications.unshift(notification)

			// Save new notifications
			await set('notifications', notifications)
		})

		// Phase 310-02 — opt-in external dispatch. Fire-and-forget: a dispatch
		// failure must NEVER break the FileStore/in-app-bell write above, which has
		// already succeeded by this point. `?.` guards the momentarily-undefined
		// window during very early boot. Only the notification id + a generic error
		// message reach the log — never a secret/target (T-310-12).
		if (opts?.external) {
			void this.#livinityd.notificationChannels?.dispatch(notification, opts.severity ?? 'info').catch((e) =>
				this.logger.error('[alert-dispatch] external dispatch failed', {
					notification,
					error: (e as Error).message,
				}),
			)
		}

		return true
	}

	async clear(notification: string) {
		this.logger.log(`Clearing notification: ${notification}`)
		await this.#store.getWriteLock(async ({set}) => {
			// Get all notifications
			let notifications = await this.get()

			// Remove current one if it already exists
			notifications = notifications.filter((n) => n !== notification)

			// Save new notifications
			await set('notifications', notifications)
		})

		return true
	}
}
