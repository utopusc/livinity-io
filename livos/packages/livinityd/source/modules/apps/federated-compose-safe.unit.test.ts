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

// ── CR-01: $-interpolated volume host binds (were skipped as "named volumes") ──
test('CR-01 REJECTS ${APP_DATA_DIR}-rooted traversal to docker.sock', () =>
	expectRejected(svc({volumes: ['${APP_DATA_DIR}/../../../../var/run/docker.sock:/var/run/docker.sock']}), /host-path/))
test('CR-01 REJECTS an unknown ${HOME} interpolated bind', () =>
	expectRejected(svc({volumes: ['${HOME}/.ssh:/root/.ssh']}), /host-path-bind-var/))
test('CR-01 REJECTS a bare $LIVINITY_ROOT interpolated bind', () =>
	expectRejected(svc({volumes: ['$LIVINITY_ROOT:/host']}), /host-path-bind-var/))
test('CR-01 REJECTS a long-form bind whose $-source escapes app-data', () =>
	expectRejected(svc({volumes: [{type: 'bind', source: '${APP_DATA_DIR}/../../etc', target: '/etc'}]}), /host-path/))
test('CR-01 ACCEPTS a clean ${APP_DATA_DIR}-rooted bind (resolves in-tree)', () =>
	expect(() => assertFederatedComposeSafe(svc({volumes: ['${APP_DATA_DIR}/data:/data']}), APP_DATA_DIR)).not.toThrow())

// ── WR-01: numeric private / host-gateway IP broker reach (no hostname) ────────
test('WR-01 REJECTS an env pointing at the numeric docker gateway IP', () =>
	expectRejected(svc({environment: {ANTHROPIC_BASE_URL: 'http://172.17.0.1:8080/u/x'}}), /environment/))
test('WR-01 REJECTS an extra_hosts alias mapped to a private IP', () =>
	expectRejected(svc({extra_hosts: ['broker:172.17.0.1']}), /extra_hosts/))
test('WR-01 REJECTS an env pointing at a 10.x host', () =>
	expectRejected(svc({environment: {OPENAI_API_BASE_URL: 'http://10.0.0.1:8080/v1'}}), /environment/))

// ── WR-02: additional host-reach surfaces ─────────────────────────────────────
test('WR-02 REJECTS devices', () => expectRejected(svc({devices: ['/dev/kmsg:/dev/kmsg']}), /devices/))
test('WR-02 REJECTS group_add', () => expectRejected(svc({group_add: ['docker']}), /group_add/))
test('WR-02 REJECTS sysctls', () => expectRejected(svc({sysctls: {'net.ipv4.ip_forward': '1'}}), /sysctls/))
test('WR-02 REJECTS network_mode:container:<name>', () =>
	expectRejected(svc({network_mode: 'container:other'}), /network_mode:container/))
test('WR-02 REJECTS pid:service:<name>', () => expectRejected(svc({pid: 'service:other'}), /pid:container/))
