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
import {describe, it, expect} from 'vitest'
import {isPublicForbidden} from './public-forbidden.js'

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
