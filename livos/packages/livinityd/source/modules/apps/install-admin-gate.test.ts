import assert from 'node:assert/strict'
import {test} from 'node:test'

import {assertInstallAllowed, InstallForbidden} from './install-admin-gate.js'

// Builtin app, no cred flag, non-admin → allowed (members can install builtins).
test('member can install a builtin app with no cred flag', () => {
	assert.doesNotThrow(() =>
		assertInstallAllowed({
			isAdmin: false,
			isGeneratedTemplate: true,
			manifest: {},
		}),
	)
})

// requiresLocalAiClis + non-admin → forbidden.
test('non-admin blocked from requiresLocalAiClis install (cred-bearing)', () => {
	assert.throws(
		() =>
			assertInstallAllowed({
				isAdmin: false,
				isGeneratedTemplate: true,
				manifest: {requiresLocalAiClis: true},
			}),
		(err: any) => err instanceof InstallForbidden,
	)
})

// requiresAiProvider + non-admin → forbidden (operator AI creds).
test('non-admin blocked from requiresAiProvider install', () => {
	assert.throws(
		() =>
			assertInstallAllowed({
				isAdmin: false,
				isGeneratedTemplate: true,
				manifest: {requiresAiProvider: true},
			}),
		(err: any) => err instanceof InstallForbidden,
	)
})

// Community (non-builtin) app + non-admin → forbidden (LIVOS-007).
test('non-admin blocked from new non-builtin community app install', () => {
	assert.throws(
		() =>
			assertInstallAllowed({
				isAdmin: false,
				isGeneratedTemplate: false,
				manifest: {},
			}),
		(err: any) => err instanceof InstallForbidden,
	)
})

// Admin can install everything.
test('admin can install cred-bearing and community apps', () => {
	assert.doesNotThrow(() =>
		assertInstallAllowed({
			isAdmin: true,
			isGeneratedTemplate: false,
			manifest: {requiresLocalAiClis: true, requiresAiProvider: true},
		}),
	)
})

// Legacy single-user (isAdmin defaults true at the call site) — builtin community check still passes for admin.
test('admin installs a builtin requiresAiProvider app', () => {
	assert.doesNotThrow(() =>
		assertInstallAllowed({
			isAdmin: true,
			isGeneratedTemplate: true,
			manifest: {requiresAiProvider: true},
		}),
	)
})
