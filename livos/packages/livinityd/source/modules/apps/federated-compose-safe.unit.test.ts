// Phase 341-02 (REPO-02, D-341-5 + D-341-2b) — the federated compose REJECT gate.
//
// assertFederatedComposeSafe THROWS ComposeRejected on any escape-class directive
// (privileged/cap_add/host net-pid-ipc/unconfined), any out-of-app-data bind, any
// privileged/non-loopback host port, AND — the D-341-2b fix — any compose-declared
// reach to the broker / cred-proxy (extra_hosts host-gateway / livinity-broker /
// livinity-credproxy; env / env_file referencing the broker/credproxy hostnames,
// the broker sentinel, or the credproxy placeholder). A benign federated compose
// passes untouched.
import {expect, test} from 'vitest'

import {assertFederatedComposeSafe, ComposeRejected} from './compose-sanitizer.js'
import {BROKER_SENTINEL_KEY} from './inject-ai-provider.js'
import {CREDPROXY_HOST, CREDPROXY_PLACEHOLDER_KEY} from './cred-egress-proxy.js'

const APP_DATA_DIR = '/opt/livos/data/app-data/fed-abcdef012345-myapp'

function svc(extra: Record<string, unknown> = {}): any {
	return {services: {app: {image: 'x:latest', ...extra}}}
}

function expectRejected(compose: any, dir?: RegExp) {
	expect(() => assertFederatedComposeSafe(compose, APP_DATA_DIR)).toThrow(ComposeRejected)
	if (dir) {
		try {
			assertFederatedComposeSafe(compose, APP_DATA_DIR)
		} catch (e: any) {
			expect(e.directive).toMatch(dir)
		}
	}
}

// ── escape-class directives ──────────────────────────────────────────────────
test('REJECTS privileged:true', () => expectRejected(svc({privileged: true}), /privileged/))
test('REJECTS non-empty cap_add', () => expectRejected(svc({cap_add: ['SYS_ADMIN']}), /cap_add/))
test('REJECTS network_mode:host', () => expectRejected(svc({network_mode: 'host'}), /network_mode/))
test('REJECTS pid:host', () => expectRejected(svc({pid: 'host'}), /pid/))
test('REJECTS ipc:host (NOT covered by the silent stripper)', () => expectRejected(svc({ipc: 'host'}), /ipc/))
test('REJECTS userns_mode:host', () => expectRejected(svc({userns_mode: 'host'}), /userns_mode/))
test('REJECTS security_opt unconfined', () =>
	expectRejected(svc({security_opt: ['seccomp=unconfined']}), /unconfined/))

// ── volume binds ─────────────────────────────────────────────────────────────
test('REJECTS /var/run/docker.sock bind', () =>
	expectRejected(svc({volumes: ['/var/run/docker.sock:/var/run/docker.sock']}), /host-path/))
test('REJECTS root / bind', () => expectRejected(svc({volumes: ['/:/host']}), /host-path/))
test("REJECTS another user's tree bind", () =>
	expectRejected(svc({volumes: ['/opt/livos/data/users/victim:/loot']}), /host-path/))
test('ACCEPTS an in-app-data bind + a named volume (no throw)', () => {
	const compose = svc({volumes: [`${APP_DATA_DIR}/data:/data`, 'namedvol:/var/lib']})
	expect(() => assertFederatedComposeSafe(compose, APP_DATA_DIR)).not.toThrow()
})

// ── ports ────────────────────────────────────────────────────────────────────
test('REJECTS a privileged host port (80:80)', () =>
	expectRejected(svc({ports: ['80:80']}), /privileged-host-port/))
test('REJECTS a non-loopback publish (0.0.0.0:8080:8080)', () =>
	expectRejected(svc({ports: ['0.0.0.0:8080:8080']}), /non-loopback/))
test('ACCEPTS a loopback publish (127.0.0.1:8080:8080) and a port-less service', () => {
	expect(() => assertFederatedComposeSafe(svc({ports: ['127.0.0.1:8080:8080']}), APP_DATA_DIR)).not.toThrow()
	expect(() => assertFederatedComposeSafe(svc({}), APP_DATA_DIR)).not.toThrow()
})

// ── D-341-2b: the compose-side broker / cred-proxy door ───────────────────────
test('HEADLINE (D-341-2b): extra_hosts livinity-broker:host-gateway + ANTHROPIC_API_KEY sentinel → REJECTED', () => {
	const compose = svc({
		extra_hosts: ['livinity-broker:host-gateway'],
		environment: {ANTHROPIC_API_KEY: BROKER_SENTINEL_KEY},
	})
	expectRejected(compose, /extra_hosts:broker-reach|environment:broker-reach/)
})
test('REJECTS a bare host-gateway extra_hosts alias', () =>
	expectRejected(svc({extra_hosts: ['anything:host-gateway']}), /extra_hosts/))
test('REJECTS an ANTHROPIC_BASE_URL env pointing at the broker host', () =>
	expectRejected(svc({environment: {ANTHROPIC_BASE_URL: 'http://livinity-broker:8080/u/x'}}), /environment/))
test('REJECTS an HTTPS_PROXY env pointing at the cred-proxy host', () =>
	expectRejected(svc({environment: {HTTPS_PROXY: `http://${CREDPROXY_HOST}:13129`}}), /environment/))
test('REJECTS the credproxy placeholder key in a list-form environment', () =>
	expectRejected(svc({environment: [`ANTHROPIC_API_KEY=${CREDPROXY_PLACEHOLDER_KEY}`]}), /environment/))
test('REJECTS an env_file referencing the broker sentinel', () =>
	expectRejected(svc({env_file: ['./livinity-broker-managed.env']}), /env_file/))

// ── benign compose passes ─────────────────────────────────────────────────────
test('BENIGN federated compose passes (loopback port, in-tree bind, ordinary env)', () => {
	const compose = svc({
		ports: ['127.0.0.1:3000:3000'],
		volumes: [`${APP_DATA_DIR}/data:/data`],
		environment: {NODE_ENV: 'production', PORT: '3000'},
	})
	expect(() => assertFederatedComposeSafe(compose, APP_DATA_DIR)).not.toThrow()
})
