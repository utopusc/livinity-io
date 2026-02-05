import type Livinityd from '../../index.js'

export default class Notifications {
	#store: Livinityd['store']
	logger: Livinityd['logger']

	constructor(livinityd: Livinityd) {
		this.#store = livinityd.store
		const {name} = this.constructor
		this.logger = livinityd.logger.createChildLogger(name.toLowerCase())
	}

	// Get the user object from the store
	async get() {
		return (await this.#store.get('notifications')) || []
	}

	async add(notification: string) {
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
