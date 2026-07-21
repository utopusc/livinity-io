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

const {dockerInspectStatus, renderVmCompose} = await import('./vm-docker.js')

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
