// 288: proves the force-sanitizer crux — apps.deployCustom forces
// isGeneratedTemplate=false so this sanitizer runs on every AI compose.
// docker.sock => abort (ComposeRejected); privileged => stripped.
//
// deployCustom stages an AI-authored compose (or a one-service compose
// synthesized from a bare image) into app-data/<slug>/, then runs the EXACT
// gate at apps.ts ~:632-642 with isGeneratedTemplate forced false. These tests
// assert that exact control on the deployCustom-shaped compose, independent of
// the install pipeline, so the security premise can't silently regress.
import assert from 'node:assert/strict'
import {test} from 'node:test'

import {sanitizeNonBuiltinCompose, ComposeRejected} from './compose-sanitizer.js'

// The app-data dir deployCustom stages into: ${dataDirectory}/app-data/<slug>.
const APP_DATA_DIR = '/opt/livos/data/app-data/myapp'

// A deployCustom-shaped compose: one service keyed by the slug, publishing the
// loopback-bound port deployCustom synthesizes for a bare image.
function deployCustomCompose(): any {
	return {
		services: {
			myapp: {
				image: 'evil:latest',
				ports: ['127.0.0.1:3000:3000'],
				restart: 'unless-stopped',
			},
		},
	}
}

// Test A — a docker.sock host bind ABORTS the deploy (ComposeRejected).
// This is the elevation-of-privilege crux (T-288-01): force isGeneratedTemplate
// =false so the sanitizer runs and REJECTS the host bind before docker up.
test('deployCustom compose mounting /var/run/docker.sock is rejected (ComposeRejected)', () => {
	const compose = deployCustomCompose()
	compose.services.myapp.volumes = ['/var/run/docker.sock:/var/run/docker.sock']
	assert.throws(
		() => sanitizeNonBuiltinCompose(compose, APP_DATA_DIR),
		(err: any) => err instanceof ComposeRejected && /docker\.sock|host-path/.test(err.message),
		'a docker.sock host bind must abort the deploy with ComposeRejected',
	)
})

// Test A2 — any host-path bind OUTSIDE app-data (another user's data) is also
// rejected (T-288-03 tampering); a named volume + an in-tree bind are allowed.
test('deployCustom compose binding an out-of-tree host path is rejected; app-data bind survives', () => {
	const evil = deployCustomCompose()
	evil.services.myapp.volumes = ['/opt/livos/data/users/victim/app-data:/loot']
	assert.throws(
		() => sanitizeNonBuiltinCompose(evil, APP_DATA_DIR),
		(err: any) => err instanceof ComposeRejected,
		'a host-path bind outside app-data must abort the deploy',
	)

	const ok = deployCustomCompose()
	ok.services.myapp.volumes = [`${APP_DATA_DIR}/data:/data`, 'namedvol:/var/lib']
	const {compose: out} = sanitizeNonBuiltinCompose(ok, APP_DATA_DIR)
	assert.deepEqual(out.services.myapp.volumes, [`${APP_DATA_DIR}/data:/data`, 'namedvol:/var/lib'], 'in-tree bind + named volume survive')
})

// Test B — privileged:true is STRIPPED (not rejected) and reported in `removed`
// (T-288-02). The deploy proceeds with the dangerous directive removed.
test('deployCustom compose with privileged:true has it stripped and reported', () => {
	const compose = deployCustomCompose()
	compose.services.myapp.privileged = true
	const {compose: out, removed} = sanitizeNonBuiltinCompose(compose, APP_DATA_DIR)
	assert.equal('privileged' in out.services.myapp, false, 'privileged must be deleted from the AI compose')
	assert.ok(
		removed.some((r) => r.includes('privileged')),
		`removed should report the stripped privileged directive, got ${JSON.stringify(removed)}`,
	)
	// belt-and-suspenders: the sanitizer also hardens the service.
	assert.ok(
		Array.isArray(out.services.myapp.security_opt) && out.services.myapp.security_opt.includes('no-new-privileges:true'),
		'no-new-privileges:true must be merged into the deployed service',
	)
})
