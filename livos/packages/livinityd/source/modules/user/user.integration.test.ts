import {expect, beforeAll, afterAll, test, vi} from 'vitest'

import * as totp from '../utilities/totp.js'

import createTestLivinityd from '../test-utilities/create-test-livinityd.js'

let livinityd: Awaited<ReturnType<typeof createTestLivinityd>>

beforeAll(async () => {
	livinityd = await createTestLivinityd()
})

afterAll(async () => {
	await livinityd.cleanup()
})

const testUserCredentials = {
	name: 'satoshi',
	password: 'moneyprintergobrrr',
}

const testUserLanguage = 'ja'

const testTotpUri =
	'otpauth://totp/Livinity?secret=63AU7PMWJX6EQJR6G3KTQFG5RDZ2UE3WVUMP3VFJWHSWJ7MMHTIQ&period=30&digits=6&algorithm=SHA1&issuer=livinity.local'

// The following tests are stateful and must be run in order

test.sequential('exists() returns false when no user is registered', async () => {
	await expect(livinityd.client.user.exists.query()).resolves.toBe(false)
})

test.sequential('login() throws invalid error when no user is registered', async () => {
	await expect(livinityd.client.user.login.mutate({password: testUserCredentials.password})).rejects.toThrow(
		'Incorrect password',
	)
})

test.sequential('register() throws error if username is not supplied', async () => {
	await expect(
		livinityd.client.user.register.mutate({
			password: testUserCredentials.password,
		} as any),
	).rejects.toThrow(/invalid_type.*name/s)
})

test.sequential('register() throws error if password is not supplied', async () => {
	await expect(
		livinityd.client.user.register.mutate({
			name: testUserCredentials.name,
		} as any),
	).rejects.toThrow(/invalid_type.*password/s)
})

test.sequential('register() throws error if password is below min length', async () => {
	await expect(
		livinityd.client.user.register.mutate({
			name: testUserCredentials.name,
			password: 'rekt',
		}),
	).rejects.toThrow('Password must be at least 6 characters')
})

test.sequential('register() creates a user', async () => {
	await expect(livinityd.client.user.register.mutate(testUserCredentials)).resolves.toBe(true)
})

test.sequential('exists() returns true when a user is registered', async () => {
	await expect(livinityd.client.user.exists.query()).resolves.toBe(true)
})

test.sequential('register() throws an error if the user is already registered', async () => {
	await expect(livinityd.client.user.register.mutate(testUserCredentials)).rejects.toThrow(
		'Attempted to register when user is already registered',
	)
})

test.sequential('login() throws an error for invalid credentials', async () => {
	await expect(livinityd.client.user.login.mutate({password: 'usdtothemoon'})).rejects.toThrow('Incorrect password')
})

test.sequential('login() throws an error if password is not supplied', async () => {
	await expect(livinityd.client.user.login.mutate({} as any)).rejects.toThrow(/invalid_type.*password/s)
})

test.sequential("renewToken() throws if we're not logged in", async () => {
	await expect(livinityd.client.user.renewToken.mutate()).rejects.toThrow('Invalid token')
})

test.sequential("isLoggedIn() returns false if we're not logged in", async () => {
	await expect(livinityd.client.user.isLoggedIn.query()).resolves.toBe(false)
})

test.sequential('login() returns a token', async () => {
	const token = await livinityd.client.user.login.mutate(testUserCredentials)
	expect(typeof token).toBe('string')
	livinityd.setJwt(token)
})

test.sequential("renewToken() returns a new token when we're logged in", async () => {
	const token = await livinityd.client.user.renewToken.mutate()
	expect(typeof token).toBe('string')
	livinityd.setJwt(token)
})

test.sequential("isLoggedIn() returns true when we're logged in", async () => {
	await expect(livinityd.client.user.isLoggedIn.query()).resolves.toBe(true)
})

test.sequential('generateTotpUri() returns a 2FA URI', async () => {
	await expect(livinityd.client.user.generateTotpUri.query()).resolves.toContain('otpauth://totp/Livinity?secret=')
})

test.sequential('generateTotpUri() returns a unique 2FA URI each time', async () => {
	const firstUri = await livinityd.client.user.generateTotpUri.query()
	const secondUri = await livinityd.client.user.generateTotpUri.query()
	expect(firstUri).not.toBe(secondUri)
})

test.sequential('enable2fa() throws error on invalid token', async () => {
	const totpUri = await livinityd.client.user.generateTotpUri.query()
	await expect(
		livinityd.client.user.enable2fa.mutate({
			totpToken: '1234356',
			totpUri,
		}),
	).rejects.toThrow('Incorrect 2FA code')
})

test.sequential('enable2fa() enables 2FA on login', async () => {
	const totpToken = totp.generateToken(testTotpUri)
	await expect(
		livinityd.client.user.enable2fa.mutate({
			totpToken,
			totpUri: testTotpUri,
		}),
	).resolves.toBe(true)
})

test.sequential('login() requires 2FA token if enabled', async () => {
	await expect(livinityd.client.user.login.mutate(testUserCredentials)).rejects.toThrow('Missing 2FA code')

	const totpToken = totp.generateToken(testTotpUri)
	await expect(
		livinityd.client.user.login.mutate({
			...testUserCredentials,
			totpToken,
		}),
	).resolves.toBeTypeOf('string')
})

test.sequential('disable2fa() throws error on invalid token', async () => {
	await expect(
		livinityd.client.user.disable2fa.mutate({
			totpToken: '000000',
		}),
	).rejects.toThrow('Incorrect 2FA code')
})

test.sequential('disable2fa() disables 2fa on login', async () => {
	const totpToken = totp.generateToken(testTotpUri)
	await expect(
		livinityd.client.user.disable2fa.mutate({
			totpToken,
		}),
	).resolves.toBe(true)

	await expect(livinityd.client.user.login.mutate(testUserCredentials)).resolves.toBeTypeOf('string')
})

test.sequential('get() returns user data', async () => {
	await expect(livinityd.client.user.get.query()).resolves.toMatchObject({
		name: 'satoshi',
		language: 'en',
	})
})

test.sequential("set() sets the user's name", async () => {
	await expect(livinityd.client.user.set.mutate({name: 'Hal'})).resolves.toBe(true)
	await expect(livinityd.client.user.get.query()).resolves.toMatchObject({name: 'Hal'})

	// Revert name change
	await expect(livinityd.client.user.set.mutate({name: testUserCredentials.name})).resolves.toBe(true)
	await expect(livinityd.client.user.get.query()).resolves.toMatchObject({name: testUserCredentials.name})
})

test.sequential("set() sets the user's language", async () => {
	await expect(livinityd.client.user.set.mutate({language: testUserLanguage})).resolves.toBe(true)
	await expect(livinityd.client.user.get.query()).resolves.toMatchObject({language: testUserLanguage})
})

test.sequential("set() sets the user's wallpaper", async () => {
	await expect(livinityd.client.user.set.mutate({wallpaper: '1.jpg'})).resolves.toBe(true)
	await expect(livinityd.client.user.get.query()).resolves.toMatchObject({wallpaper: '1.jpg'})

	await expect(livinityd.client.user.set.mutate({wallpaper: '2.jpg'})).resolves.toBe(true)
	await expect(livinityd.client.user.get.query()).resolves.toMatchObject({wallpaper: '2.jpg'})
})

test.sequential('set() throws on unknown property', async () => {
	// @ts-expect-error Testing invalid arguments
	await expect(livinityd.client.user.set.mutate({foo: 'bar'})).rejects.toThrow('unrecognized_keys')
})

test.sequential('language() is publically available', async () => {
	await expect(livinityd.unauthenticatedClient.user.language.query()).resolves.toBe(testUserLanguage)
})

test.sequential("language() returns the user's language", async () => {
	await expect(livinityd.client.user.language.query()).resolves.toBe(testUserLanguage)
})

test.sequential('changePassword() throws on inavlid oldPassword', async () => {
	await expect(
		livinityd.client.user.changePassword.mutate({oldPassword: 'fiat4lyfe', newPassword: 'usdtothemoon'}),
	).rejects.toThrow('Incorrect password')
})

test.sequential("changePassword() changes the user's password", async () => {
	await expect(
		livinityd.client.user.changePassword.mutate({oldPassword: testUserCredentials.password, newPassword: 'usdtothemoon'}),
	).resolves.toBe(true)
	await expect(livinityd.client.user.login.mutate({password: 'usdtothemoon'})).resolves.toBeTypeOf('string')

	// Reset password
	await expect(
		livinityd.client.user.changePassword.mutate({oldPassword: 'usdtothemoon', newPassword: testUserCredentials.password}),
	).resolves.toBe(true)
	await expect(livinityd.client.user.login.mutate(testUserCredentials)).resolves.toBeTypeOf('string')
})

// NOTE: The test below will wipe the above state and create a new user
// We need it to test registering a user with language
test.sequential('register() creates a new user with language', async () => {
	// Create fresh instance so we can register a new user
	await livinityd.cleanup()
	livinityd = await createTestLivinityd()

	// Register a new user with language
	await expect(livinityd.client.user.register.mutate({...testUserCredentials, language: testUserLanguage})).resolves.toBe(
		true,
	)

	// Set jwt
	const token = await livinityd.client.user.login.mutate(testUserCredentials)
	livinityd.setJwt(token)

	// Check language is returned in user object
	await expect(livinityd.client.user.get.query()).resolves.toMatchObject({language: testUserLanguage})

	// Check language is returned in public language endpoint
	await expect(livinityd.client.user.language.query()).resolves.toBe(testUserLanguage)
})
