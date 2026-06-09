// livos/packages/livinityd/source/modules/apps/public-forbidden.test.ts
// Phase 258 WS-C (258-03) — isPublicForbidden, the ONE source of truth for
// "this app may NEVER be made public".
//
// NOTE-2: the LOAD-BEARING triggers (neverPublic / requiresLocalAiClis /
// hasDaemonBearer) are the signals the 257 install-time sanitizer
// (sanitizeNonBuiltinCompose) does NOT strip — they are what actually protect
// OpenDesign / OpenHands-class apps. The compose signals (docker.sock /
// privileged / network_mode:host) are DEFENSE IN DEPTH only: the sanitizer
// `delete`s privileged/network_mode:host and THROWS on a docker.sock bind, so an
// installed app's on-disk compose may no longer carry them. These tests prove the
// load-bearing triggers hold even for a fully-sanitized compose (Test 9).
import {describe, it, expect, vi} from 'vitest'
import {isPublicForbidden, effectivePublicAccess} from './public-forbidden.js'

// ── Phase 262-05 (LIVOS-057) — exercise the REAL buildPublicForbiddenSignals ──
// The builtin catalog is mocked ONLY for the synthetic test appId; every other
// id passes through to the real getBuiltinApp so the rest of the module graph
// behaves normally.
vi.mock('./builtin-apps.js', async (importOriginal) => {
	const orig = await importOriginal<typeof import('./builtin-apps.js')>()
	return {
		...orig,
		getBuiltinApp: (appId: string) =>
			appId === 'livos-test-credentialed-builtin'
				? ({id: appId, requiresLocalAiClis: true} as any)
				: orig.getBuiltinApp(appId),
	}
})

const {default: Apps} = await import('./apps.js')

describe('isPublicForbidden (258-03 WS-C)', () => {
	// ── LOAD-BEARING triggers (not stripped by the 257 sanitizer) ──────────

	it('Test 1 — neverPublic (load-bearing) → forbidden, reason never-public', () => {
		expect(isPublicForbidden({neverPublic: true})).toEqual({forbidden: true, reason: 'never-public'})
	})

	it('Test 2 — requiresLocalAiClis (load-bearing) → forbidden, reason local-ai-clis', () => {
		expect(isPublicForbidden({requiresLocalAiClis: true})).toEqual({forbidden: true, reason: 'local-ai-clis'})
	})

	it('Test 3 — daemon bearer (load-bearing, the 256-04 signal) → forbidden, reason daemon-bearer', () => {
		expect(isPublicForbidden({hasDaemonBearer: true})).toEqual({forbidden: true, reason: 'daemon-bearer'})
	})

	// ── DEFENSE-IN-DEPTH compose signals (may already be stripped at install) ─

	it('Test 4 — docker.sock bind (defense-in-depth) → forbidden, reason docker-sock', () => {
		const compose = {
			services: {
				portainer: {volumes: ['/var/run/docker.sock:/var/run/docker.sock']},
			},
		}
		expect(isPublicForbidden({compose})).toEqual({forbidden: true, reason: 'docker-sock'})
	})

	it('Test 5 — privileged (defense-in-depth) → forbidden, reason privileged', () => {
		const compose = {services: {app: {privileged: true}}}
		expect(isPublicForbidden({compose})).toEqual({forbidden: true, reason: 'privileged'})
	})

	it('Test 6 — network_mode: host (defense-in-depth) → forbidden, reason host-network', () => {
		const compose = {services: {app: {network_mode: 'host'}}}
		expect(isPublicForbidden({compose})).toEqual({forbidden: true, reason: 'host-network'})
	})

	// ── Clean app (Cal.com class) — NOT forbidden (SC6) ────────────────────

	it('Test 7 — clean app (no manifest signals, sanitized compose) → NOT forbidden', () => {
		const compose = {
			services: {
				calcom: {
					image: 'calcom/cal.com',
					volumes: ['./data:/data'],
					security_opt: ['no-new-privileges:true'],
				},
			},
		}
		expect(isPublicForbidden({compose})).toEqual({forbidden: false})
	})

	// ── Precedence — load-bearing first (deterministic reason order) ───────

	it('Test 8 — load-bearing wins over a defense-in-depth signal (deterministic order)', () => {
		const compose = {services: {app: {privileged: true}}}
		// Both a load-bearing trigger (neverPublic) AND a defense-in-depth signal
		// (privileged) present → the first reported reason is the load-bearing one.
		expect(isPublicForbidden({neverPublic: true, compose})).toEqual({forbidden: true, reason: 'never-public'})
		// Order among load-bearing: never-public → local-ai-clis → daemon-bearer.
		expect(isPublicForbidden({requiresLocalAiClis: true, hasDaemonBearer: true})).toEqual({
			forbidden: true,
			reason: 'local-ai-clis',
		})
	})

	// ── NOTE-2: a SANITIZED OpenHands/OpenDesign-class app is STILL forbidden ─

	it('Test 9 — sanitized compose (no privileged/docker.sock left) BUT daemon bearer → still forbidden', () => {
		// Simulates an installed OpenDesign-class app AFTER the 257 sanitizer ran:
		// the compose no longer carries privileged/docker.sock/host-net, but the
		// 256-04 daemon bearer is present → the load-bearing trigger still fires.
		const sanitizedCompose = {
			services: {
				od: {
					image: 'opendesign/agent',
					volumes: ['./data:/data'],
					security_opt: ['no-new-privileges:true'],
				},
			},
		}
		expect(isPublicForbidden({hasDaemonBearer: true, compose: sanitizedCompose})).toEqual({
			forbidden: true,
			reason: 'daemon-bearer',
		})
		// Same class via requiresLocalAiClis (OpenHands w/ host AI CLIs).
		expect(isPublicForbidden({requiresLocalAiClis: true, compose: sanitizedCompose})).toEqual({
			forbidden: true,
			reason: 'local-ai-clis',
		})
	})

	// ── Edge cases ─────────────────────────────────────────────────────────

	it('empty signals / no compose → NOT forbidden', () => {
		expect(isPublicForbidden({})).toEqual({forbidden: false})
		expect(isPublicForbidden({compose: undefined})).toEqual({forbidden: false})
		expect(isPublicForbidden({compose: {}})).toEqual({forbidden: false})
	})

	it('long-form bind docker.sock + named volumes ignored', () => {
		const compose = {
			services: {
				app: {volumes: [{type: 'bind', source: '/var/run/docker.sock', target: '/var/run/docker.sock'}]},
				other: {volumes: ['namedvol:/data']},
			},
		}
		expect(isPublicForbidden({compose})).toEqual({forbidden: true, reason: 'docker-sock'})
	})
})

// effectivePublicAccess composes isPublicForbidden + resolvePublicAccess into the
// ONE decision Task 2 (registerAppSubdomain) + Task 3 (read side) reuse:
//   forbidden → undefined (never public, fail-closed)   else resolvePublicAccess()
//   resolved mode 'none' → undefined                     (private; SubdomainConfig.publicAccess omitted)
describe('effectivePublicAccess (258-03 WS-C — Task 2 composition)', () => {
	it('Test 1 — no persisted setting → undefined (default private, SC5)', () => {
		const out = effectivePublicAccess({}, {publicAccess: {mode: 'paths'}}, undefined)
		expect(out).toBeUndefined()
	})

	it('Test 2 — paths setting on a CLEAN app → resolved paths config', () => {
		const out = effectivePublicAccess(
			{}, // no forbidden signals
			{publicAccess: {mode: 'paths', paths: ['/booking/'], hasOwnAuth: true}},
			{mode: 'paths', paths: ['/booking/']},
		)
		expect(out).toEqual({mode: 'paths', paths: ['/booking/'], hasOwnAuth: true})
	})

	it('Test 3 — forbidden re-assert: daemon-bearer load-bearing forces undefined even with a stale paths setting', () => {
		// The compose was sanitized (no docker.sock/privileged left) but the
		// 256-04 daemon bearer is present → a stale/forged public setting can NEVER
		// make a forbidden app public (fail-closed).
		const sanitizedCompose = {services: {od: {image: 'opendesign/agent', volumes: ['./data:/data']}}}
		const out = effectivePublicAccess(
			{hasDaemonBearer: true, compose: sanitizedCompose},
			{publicAccess: {mode: 'whole-app'}},
			{mode: 'whole-app'}, // stale/forged public setting
		)
		expect(out).toBeUndefined()
	})

	it('Test 3b — forbidden via requiresLocalAiClis also forces undefined', () => {
		const out = effectivePublicAccess(
			{requiresLocalAiClis: true},
			{publicAccess: {mode: 'paths'}},
			{mode: 'paths', paths: ['/foo']},
		)
		expect(out).toBeUndefined()
	})

	it('resolved mode none on a clean app → undefined (no public block emitted)', () => {
		const out = effectivePublicAccess({}, {publicAccess: {mode: 'paths'}}, {mode: 'none'})
		expect(out).toBeUndefined()
	})

	it('whole-app on a clean app → whole-app config (paths empty)', () => {
		const out = effectivePublicAccess(
			{},
			{publicAccess: {mode: 'whole-app', hasOwnAuth: true}},
			{mode: 'whole-app'},
		)
		expect(out).toEqual({mode: 'whole-app', paths: [], hasOwnAuth: true})
	})
})

// ── Phase 262-05 (LIVOS-057) — buildPublicForbiddenSignals OR-sources the
// builtin definition. The builtin/native install paths historically wrote a
// manifest WITHOUT requiresLocalAiClis (compose-generator.ts / apps.ts native
// branch), so the on-disk manifest alone read `false` for a credentialed
// builtin — a latent fail-open. The signal builder must mirror the mount path
// (apps.ts:828-829) and OR the on-disk flag with getBuiltinApp(appId).
describe('buildPublicForbiddenSignals ORs getBuiltinApp (262-05, LIVOS-057)', () => {
	// Minimal `this` stub: buildPublicForbiddenSignals only touches this.getApp().
	const makeStub = (manifest: any) => ({
		getApp: (_appId: string) => ({
			readManifest: async () => manifest,
			readCompose: async () => ({
				services: {app: {image: 'x/y', volumes: ['./data:/data']}},
			}),
		}),
	})

	it('install-path-written (flag-absent) manifest + builtin requiresLocalAiClis → forbidden (local-ai-clis)', async () => {
		// Simulates the LIVOS-057 regression: a credentialed builtin installed via
		// the compose-generator/native path whose on-disk manifest DROPPED the flag.
		const flagAbsentManifest = {
			manifestVersion: '1.1',
			id: 'livos-test-credentialed-builtin',
			name: 'Credentialed Builtin',
			version: '1.0.0',
			port: 8080,
		}
		const {signals} = await (Apps.prototype.buildPublicForbiddenSignals as any).call(
			makeStub(flagAbsentManifest),
			'livos-test-credentialed-builtin',
			undefined,
		)
		expect(signals.requiresLocalAiClis).toBe(true)
		expect(isPublicForbidden(signals)).toEqual({forbidden: true, reason: 'local-ai-clis'})
	})

	it('non-builtin flag-absent manifest stays NOT forbidden (no false positive)', async () => {
		const {signals} = await (Apps.prototype.buildPublicForbiddenSignals as any).call(
			makeStub({manifestVersion: '1.1', id: 'clean-community-app', name: 'Clean'}),
			'clean-community-app',
			undefined,
		)
		expect(signals.requiresLocalAiClis).toBe(false)
		expect(isPublicForbidden(signals)).toEqual({forbidden: false})
	})

	it('on-disk manifest flag still forbids independently of the builtin catalog', async () => {
		const {signals} = await (Apps.prototype.buildPublicForbiddenSignals as any).call(
			makeStub({manifestVersion: '1.1', id: 'community-cli-app', requiresLocalAiClis: true}),
			'community-cli-app',
			undefined,
		)
		expect(signals.requiresLocalAiClis).toBe(true)
		expect(isPublicForbidden(signals)).toEqual({forbidden: true, reason: 'local-ai-clis'})
	})
})
