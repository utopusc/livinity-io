import {expect, test, vi} from 'vitest'

import {WINDOWS_VM_TEMPLATE, LINUX_VM_TEMPLATE} from './vm-template.js'

// Fake docker state keyed by container name — drives the single
// `docker inspect` call dockerInspectStatus issues. Mirrors the ONLY proven
// execa-mock pattern in this codebase (health-monitor.test.ts:1-17): register
// vi.mock BEFORE dynamically importing the module under test so the mock wins.
const dockerState = new Map<string, {status: string}>()

vi.mock('execa', () => ({
	$: async (_parts: TemplateStringsArray, ...args: string[]) => {
		const containerName = args[args.length - 1]
		const entry = dockerState.get(containerName)
		if (!entry) throw new Error(`No such container: ${containerName}`)
		return {stdout: `${entry.status}\n`}
	},
}))

const {dockerInspectStatus, renderVmCompose, extractOsRenderInputs} = await import('./vm-docker.js')

test('dockerInspectStatus returns the mocked container status (trimmed)', async () => {
	dockerState.set('vm-abc', {status: 'running'})
	expect(await dockerInspectStatus('vm-abc')).toBe('running')
})

test('dockerInspectStatus throws for an unknown container (mock rejects)', async () => {
	await expect(dockerInspectStatus('vm-nope')).rejects.toThrow(/No such container/)
})

test('renderVmCompose (windows) copies the elevated set verbatim + substitutes the token', () => {
	const rendered: any = renderVmCompose(WINDOWS_VM_TEMPLATE, {
		id: 'abc',
		dataDir: '/data/vm-data/abc',
		novncPort: 16100,
		rdpPort: 16200,
		resources: {cpus: 4, ramMiB: 8192, diskGiB: 128},
	})
	const svc = rendered.services.vm
	expect(svc.container_name).toBe('vm-abc')
	expect(svc.image).toBe('dockurr/windows:latest')
	expect(svc.devices).toEqual(['/dev/kvm', '/dev/net/tun'])
	expect(svc.cap_add).toEqual(['NET_ADMIN'])
	expect(svc.stop_grace_period).toBe('2m')
	expect(svc.restart).toBe('on-failure')
	// volume source is the VM's OWN dir — no literal token survives anywhere
	expect(svc.volumes).toEqual(['/data/vm-data/abc/storage:/storage'])
	expect(JSON.stringify(rendered)).not.toContain('${APP_DATA_DIR}')
})

test('renderVmCompose (windows) renders loopback-only ports incl. RDP tcp+udp', () => {
	const rendered: any = renderVmCompose(WINDOWS_VM_TEMPLATE, {
		id: 'abc',
		dataDir: '/data/vm-data/abc',
		novncPort: 16100,
		rdpPort: 16200,
		resources: {cpus: 4, ramMiB: 8192, diskGiB: 128},
	})
	const ports: string[] = rendered.services.vm.ports
	expect(ports.every((p) => p.startsWith('127.0.0.1:'))).toBe(true)
	expect(ports).toContain('127.0.0.1:16100:8006')
	expect(ports).toContain('127.0.0.1:16200:3389/tcp')
	expect(ports).toContain('127.0.0.1:16200:3389/udp')
})

// ── Phase 364 (VMENC-01): the raw-VNC loopback port + container VNC_PORT env ──────────
test('renderVmCompose WITH vncRawPort publishes 127.0.0.1:<port>:5900 (loopback) + sets VNC_PORT=5900', () => {
	const rendered: any = renderVmCompose(LINUX_VM_TEMPLATE, {
		id: 'enc',
		dataDir: '/data/vm-data/enc',
		novncPort: 16101,
		vncRawPort: 16305,
		resources: {cpus: 2, ramMiB: 2048, diskGiB: 16},
	})
	const ports: string[] = rendered.services.vm.ports
	// Every published port stays loopback-only (T-364-01: no public surface).
	expect(ports.every((p) => p.startsWith('127.0.0.1:'))).toBe(true)
	expect(ports).toContain('127.0.0.1:16305:5900')
	// The container-side raw RFB port is set so the guest's QEMU VNC server is reachable.
	expect(rendered.services.vm.environment.VNC_PORT).toBe('5900')
})

test('renderVmCompose WITHOUT vncRawPort adds NO VNC_PORT env and NO :5900 port (back-compat)', () => {
	const rendered: any = renderVmCompose(LINUX_VM_TEMPLATE, {
		id: 'noenc',
		dataDir: '/data/vm-data/noenc',
		novncPort: 16102,
		resources: {cpus: 2, ramMiB: 2048, diskGiB: 16},
	})
	// Byte-identical to a pre-364 render: no VNC_PORT key, no raw RFB port mapping.
	expect(rendered.services.vm.environment).not.toHaveProperty('VNC_PORT')
	const ports: string[] = rendered.services.vm.ports
	expect(ports.some((p) => p.includes(':5900'))).toBe(false)
})

// A stray osEnv VNC_PORT must NEVER override the server-derived host-bridge contract:
// the '5900' is merged AFTER escapeComposeEnv(osEnv), so it always wins.
test('renderVmCompose: a stray osEnv VNC_PORT cannot override the server-derived 5900', () => {
	const rendered: any = renderVmCompose(LINUX_VM_TEMPLATE, {
		id: 'ov',
		dataDir: '/data/vm-data/ov',
		novncPort: 16103,
		vncRawPort: 16306,
		resources: {cpus: 2, ramMiB: 2048, diskGiB: 16},
		osEnv: {VNC_PORT: '1234'},
	})
	expect(rendered.services.vm.environment.VNC_PORT).toBe('5900')
})

test('renderVmCompose (windows) merges resources into environment, preserving VERSION default', () => {
	const rendered: any = renderVmCompose(WINDOWS_VM_TEMPLATE, {
		id: 'abc',
		dataDir: '/data/vm-data/abc',
		novncPort: 16100,
		rdpPort: 16200,
		resources: {cpus: 4, ramMiB: 8192, diskGiB: 128},
	})
	const env = rendered.services.vm.environment
	expect(env.CPU_CORES).toBe('4')
	expect(env.RAM_SIZE).toBe('8192M')
	expect(env.DISK_SIZE).toBe('128G')
	expect(env.VERSION).toBe('11')
})

test('renderVmCompose escapes $ → $$ in a user-supplied custom-image BOOT URL (Pitfall 1)', () => {
	// docker compose interpolates $VAR/${VAR} over compose-file CONTENT at parse
	// time (independent of js-yaml). A signed custom-ISO URL with a raw '$' would
	// be silently mangled — every '$' must be doubled BEFORE it lands in env.
	const rendered: any = renderVmCompose(LINUX_VM_TEMPLATE, {
		id: 'sig',
		dataDir: '/data/vm-data/sig',
		novncPort: 16101,
		resources: {cpus: 2, ramMiB: 2048, diskGiB: 16},
		osEnv: {BOOT: 'https://cdn.example/boot.iso?sig=$2b$abc$def'},
	})
	const boot: string = rendered.services.vm.environment.BOOT
	// Every '$' is doubled; no lone '$' survives.
	expect(boot).toBe('https://cdn.example/boot.iso?sig=$$2b$$abc$$def')
	expect(/\$(?!\$)/.test(boot.replaceAll('$$', ''))).toBe(false)
})

test('renderVmCompose leaves a $-free VERSION/BOOT value untouched', () => {
	const rendered: any = renderVmCompose(WINDOWS_VM_TEMPLATE, {
		id: 'w',
		dataDir: '/data/vm-data/w',
		novncPort: 16102,
		rdpPort: 16202,
		resources: {cpus: 2, ramMiB: 4096, diskGiB: 64},
		osEnv: {VERSION: '11e'},
	})
	expect(rendered.services.vm.environment.VERSION).toBe('11e')
	// Numeric CPU/RAM/DISK (never user-$-bearing) are unaffected.
	expect(rendered.services.vm.environment.CPU_CORES).toBe('2')
})

test('renderVmCompose (custom LOCAL image) appends a VM-own-dir bind to /boot.<ext> (VMSEC-02)', () => {
	// The manager has hardlinked the validated file into the VM's own dir as
	// custom.<ext>; render binds THAT (inside opts.dataDir) to the qemus container
	// target /boot.<ext> — never the original admin-supplied host path.
	const rendered: any = renderVmCompose(LINUX_VM_TEMPLATE, {
		id: 'loc',
		dataDir: '/data/vm-data/loc',
		novncPort: 16103,
		resources: {cpus: 2, ramMiB: 2048, diskGiB: 16},
		osEnv: {},
		bootFileMount: {hostFileName: 'custom.iso', containerPath: '/boot.iso'},
	})
	const volumes: string[] = rendered.services.vm.volumes
	// The template storage bind is preserved AND the boot bind is appended.
	expect(volumes).toContain('/data/vm-data/loc/storage:/storage')
	expect(volumes).toContain('/data/vm-data/loc/custom.iso:/boot.iso')
	// The bind SOURCE is always within the VM's own data dir (no host bind outside it).
	expect(volumes.every((v) => v.startsWith('/data/vm-data/loc/'))).toBe(true)
	// A local image sets NO BOOT env (qemus ignores BOOT when a /boot.<ext> file is bound).
	expect(rendered.services.vm.environment.BOOT).toBe('ubuntu') // template default only, no override
})

test('renderVmCompose (qcow2 local image) uses the matching /boot.qcow2 container target', () => {
	const rendered: any = renderVmCompose(LINUX_VM_TEMPLATE, {
		id: 'q',
		dataDir: '/data/vm-data/q',
		novncPort: 16104,
		resources: {cpus: 2, ramMiB: 2048, diskGiB: 16},
		osEnv: {},
		bootFileMount: {hostFileName: 'custom.qcow2', containerPath: '/boot.qcow2'},
	})
	expect(rendered.services.vm.volumes).toContain('/data/vm-data/q/custom.qcow2:/boot.qcow2')
})

test('renderVmCompose WITHOUT a bootFileMount leaves volumes byte-unchanged (URL/distro branch)', () => {
	// The URL/distro branch must render EXACTLY the template storage bind — no
	// extra volume creeps in when bootFileMount is absent.
	const rendered: any = renderVmCompose(LINUX_VM_TEMPLATE, {
		id: 'url',
		dataDir: '/data/vm-data/url',
		novncPort: 16105,
		resources: {cpus: 2, ramMiB: 2048, diskGiB: 16},
		osEnv: {BOOT: 'https://cdn.example/boot.iso'},
	})
	expect(rendered.services.vm.volumes).toEqual(['/data/vm-data/url/storage:/storage'])
})

// ── Phase 359 (VMSET-01): extractOsRenderInputs — recover the RAW osEnv/bootFileMount
// from an already-rendered compose so vm.update can re-render WITHOUT dropping the OS.
test('extractOsRenderInputs (windows) recovers VERSION from a rendered compose', () => {
	const rendered = renderVmCompose(WINDOWS_VM_TEMPLATE, {
		id: 'ex-w',
		dataDir: '/data/vm-data/ex-w',
		novncPort: 16110,
		rdpPort: 16210,
		resources: {cpus: 2, ramMiB: 4096, diskGiB: 64},
		osEnv: {VERSION: '10'},
	})
	expect(extractOsRenderInputs(rendered, 'windows').osEnv.VERSION).toBe('10')
})

test('extractOsRenderInputs (linux) un-escapes a $-bearing BOOT and round-trips idempotently (no $$$$)', () => {
	const raw = 'https://cdn.example/boot.iso?sig=$2b$abc'
	const rendered: any = renderVmCompose(LINUX_VM_TEMPLATE, {
		id: 'ex-l',
		dataDir: '/data/vm-data/ex-l',
		novncPort: 16111,
		resources: {cpus: 2, ramMiB: 2048, diskGiB: 16},
		osEnv: {BOOT: raw},
	})
	// The rendered compose has the value $-escaped ('$' → '$$').
	expect(rendered.services.vm.environment.BOOT).toContain('$$')
	// extractOsRenderInputs un-escapes it back to the RAW value.
	const recovered = extractOsRenderInputs(rendered, 'linux')
	expect(recovered.osEnv.BOOT).toBe(raw)
	// Re-rendering with the recovered raw osEnv escapes exactly once — byte-identical
	// to the first render's escaped value (never double-escaped to '$$$$').
	const reRendered: any = renderVmCompose(LINUX_VM_TEMPLATE, {
		id: 'ex-l',
		dataDir: '/data/vm-data/ex-l',
		novncPort: 16111,
		resources: {cpus: 2, ramMiB: 2048, diskGiB: 16},
		osEnv: recovered.osEnv,
	})
	expect(reRendered.services.vm.environment.BOOT).toBe(rendered.services.vm.environment.BOOT)
	expect(reRendered.services.vm.environment.BOOT).not.toContain('$$$$')
})

test('extractOsRenderInputs (linux) recovers a bootFileMount from a /boot.<ext> volume', () => {
	const rendered = renderVmCompose(LINUX_VM_TEMPLATE, {
		id: 'ex-b',
		dataDir: '/data/vm-data/ex-b',
		novncPort: 16112,
		resources: {cpus: 2, ramMiB: 2048, diskGiB: 16},
		osEnv: {},
		bootFileMount: {hostFileName: 'custom.iso', containerPath: '/boot.iso'},
	})
	const recovered = extractOsRenderInputs(rendered, 'linux')
	expect(recovered.bootFileMount?.hostFileName).toBe('custom.iso')
	expect(recovered.bootFileMount?.containerPath).toBe('/boot.iso')
})

test('renderVmCompose (linux, no rdpPort) emits ONLY the noVNC port + preserves BOOT default', () => {
	const rendered: any = renderVmCompose(LINUX_VM_TEMPLATE, {
		id: 'def',
		dataDir: '/data/vm-data/def',
		novncPort: 16101,
		resources: {cpus: 2, ramMiB: 4096, diskGiB: 32},
	})
	const ports: string[] = rendered.services.vm.ports
	expect(ports).toEqual(['127.0.0.1:16101:8006'])
	expect(ports.some((p) => p.includes('3389'))).toBe(false)
	expect(rendered.services.vm.environment.BOOT).toBe('ubuntu')
	expect(rendered.services.vm.image).toBe('qemux/qemu:latest')
})
