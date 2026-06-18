import {createTRPCProxyClient, httpBatchLink} from '@trpc/client'
import got from 'got'
import {CookieJar} from 'tough-cookie'

import Livinityd from '../../index.js'
import type {AppRouter} from '../server/trpc/index.js'

import temporaryDirectory from '../utilities/temporary-directory.js'

export default async function createTestLivinityd({autoLogin = false, autoStart = true} = {}) {
	const directory = temporaryDirectory()
	await directory.createRoot()
	let jwt = ''

	function setJwt(newJwt: string) {
		jwt = newJwt
	}

	// Phase 276-04: the git-clone app-store resolution (install Step 3) was
	// removed in plan 276-02. The harness no longer wires a local git server as
	// the default app store repo — non-builtin apps now resolve via Step 2
	// (fetchPlatformTemplate), which apps.integration.test.ts mocks to the local
	// sparkles fixture. (run-git-server.js is kept; widget.integration.test.ts
	// still uses its own runGitServer call.)
	const dataDirectory = await directory.create()
	const livinityd = new Livinityd({
		dataDirectory,
		port: 0,
		logLevel: 'silent',
		defaultAppStoreRepo: '',
	})
	if (autoStart) await livinityd.start()

	const client = createTRPCProxyClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `http://localhost:${livinityd.server.port}/trpc`,
				headers: async () => ({
					Authorization: `Bearer ${jwt}`,
				}),
			}),
		],
	})

	const unauthenticatedClient = createTRPCProxyClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `http://localhost:${livinityd.server.port}/trpc`,
			}),
		],
	})

	const unauthenticatedApi = got.extend({
		prefixUrl: `http://localhost:${livinityd.server.port}/api`,
		retry: {limit: 0},
		responseType: 'json',
	})
	const cookieJar = new CookieJar()
	const api = unauthenticatedApi.extend({cookieJar})

	const userCredentials = {
		name: 'satoshi',
		password: 'moneyprintergobrrr',
	}

	async function registerAndLogin() {
		// Set tRPC JWT
		await client.user.register.mutate(userCredentials)
		const token = await client.user.login.mutate(userCredentials)
		setJwt(token)

		// Set API cookie
		await api.post('../trpc/user.login', {json: userCredentials})

		return true
	}

	async function cleanup() {
		await livinityd.stop()
		await directory.destroyRoot()
	}

	if (autoLogin) await registerAndLogin()

	return {
		instance: livinityd,
		client,
		unauthenticatedClient,
		api,
		unauthenticatedApi,
		setJwt,
		registerAndLogin,
		cleanup,
	}
}
