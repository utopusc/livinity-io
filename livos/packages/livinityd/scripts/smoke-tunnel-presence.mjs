// Phase 146 W3-T3 — focused smoke for TunnelPresence
//
// Verifies the W3-T1 module's full code path against the LIVE Supabase
// project without requiring a Linux livinityd run:
//   1. Mocks Redis with a Map-backed shim that satisfies the .get/.set/.del
//      surface tunnel-presence.ts uses.
//   2. Stubs global fetch so the realtime-token call returns a real HS256 JWT
//      minted locally with the production JWT_SECRET (same algo /api/me/realtime-token
//      would use — already smoke-validated in W2-T2 POC against the same secret).
//   3. Imports the COMPILED-FROM-SOURCE tunnel-presence.ts via tsx-loader and
//      calls start() against the real Supabase Realtime endpoint.
//   4. Asserts:
//      - livos:platform:status == 'connected'
//      - livos:platform:session_id == 'tunnel:<userId>'
//      - livos:platform:url       == 'https://lucy.livinity.io'
//      - The presence channel actually fired (side-B service-role observer)
//
// On Linux/Mac, the alternative is a real livinityd boot via pnpm start. On
// Windows this smoke is the moral equivalent — same code path, mocked I/O.

import {createClient} from '@supabase/supabase-js'
import jwt from 'jsonwebtoken'

const required = [
	'SUPABASE_URL',
	'SUPABASE_ANON_KEY',
	'SUPABASE_SERVICE_ROLE_KEY',
	'SUPABASE_JWT_SECRET',
	'LUCY_USER_ID',
]
for (const k of required) {
	if (!process.env[k]) {
		console.error(`MISSING ENV: ${k}`)
		process.exit(2)
	}
}

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET
const LUCY_USER_ID = process.env.LUCY_USER_ID

// === Mock Redis (Map-backed shim) ===
const store = new Map()
const mockRedis = {
	get: async (k) => store.get(k) ?? null,
	set: async (k, v) => { store.set(k, v); return 'OK' },
	del: async (k) => store.delete(k) ? 1 : 0,
}

// Seed inputs the module expects
store.set('livos:platform:api_key', 'liv_k_uYmDq_synthetic_for_smoke')
store.set('livos:platform:username', 'lucy')

// === Stub global fetch — return the same shape /api/me/realtime-token would ===
const origFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
	if (typeof url === 'string' && url.endsWith('/api/me/realtime-token')) {
		const token = jwt.sign(
			{sub: LUCY_USER_ID, role: 'authenticated', aud: 'authenticated', userId: LUCY_USER_ID},
			SUPABASE_JWT_SECRET,
			{algorithm: 'HS256', expiresIn: '1h'},
		)
		return new Response(
			JSON.stringify({
				token,
				supabaseUrl: SUPABASE_URL,
				supabaseAnonKey: SUPABASE_ANON_KEY,
				userId: LUCY_USER_ID,
				channel: `tunnel:${LUCY_USER_ID}`,
				expiresIn: 3600,
			}),
			{status: 200, headers: {'Content-Type': 'application/json'}},
		)
	}
	return origFetch(url, init)
}

// Loaded via `tsx` which transpiles .ts imports on the fly.
const {TunnelPresence} = await import('../source/modules/platform/tunnel-presence.ts')

const presence = new TunnelPresence({
	redis: mockRedis,
	version: '146.0.0-smoke',
	logger: {
		log: (...args) => console.log('[livinityd]', ...args),
		error: (...args) => console.error('[livinityd]', ...args),
	},
	realtimeTokenUrl: 'https://livinity.io/api/me/realtime-token',
})

console.log('[smoke] calling presence.start()...')
await presence.start()
console.log('[smoke] start() returned')

await new Promise((r) => setTimeout(r, 3000))

console.log('[smoke] Redis state after start():')
console.log('  status:    ', store.get('livos:platform:status'))
console.log('  session_id:', store.get('livos:platform:session_id'))
console.log('  url:       ', store.get('livos:platform:url'))

// === Side B: independent service-role read to confirm presence visible ===
const observerClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: {persistSession: false, autoRefreshToken: false},
})
const observerChannel = observerClient.channel(`tunnel:${LUCY_USER_ID}`)
const observerState = await new Promise((resolve) => {
	let resolved = false
	observerChannel.on('presence', {event: 'sync'}, () => {
		if (!resolved) { resolved = true; resolve(observerChannel.presenceState()) }
	})
	observerChannel.subscribe()
	setTimeout(() => {
		if (!resolved) { resolved = true; resolve(observerChannel.presenceState()) }
	}, 4000)
})
await observerClient.removeChannel(observerChannel)
console.log('[smoke] Side-B service-role presence state:')
console.log(JSON.stringify(observerState, null, 2))

// Assertions
const status = store.get('livos:platform:status')
const sessionId = store.get('livos:platform:session_id')
const url = store.get('livos:platform:url')
const onlineCount = Object.keys(observerState).length
const livinitydVersion = observerState[LUCY_USER_ID]?.[0]?.livinityd_version

let failures = []
if (status !== 'connected') failures.push(`status=${status} expected 'connected'`)
if (sessionId !== `tunnel:${LUCY_USER_ID}`) failures.push(`session_id=${sessionId}`)
if (url !== 'https://lucy.livinity.io') failures.push(`url=${url}`)
if (onlineCount < 1) failures.push(`observer saw ${onlineCount} online, expected ≥1`)
if (livinitydVersion !== '146.0.0-smoke') failures.push(`livinityd_version=${livinitydVersion}`)

await presence.stop()

if (failures.length) {
	console.error('FAIL:\n  ' + failures.join('\n  '))
	process.exit(1)
}
console.log('PASS: W3-T3 focused smoke — TunnelPresence end-to-end against real Supabase')
process.exit(0)
