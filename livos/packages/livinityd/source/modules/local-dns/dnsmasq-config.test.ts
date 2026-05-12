import {describe, it, expect} from 'vitest'
import {generateLivinityDnsmasqConfig, DNSMASQ_CONF_PATH} from './dnsmasq-config.js'

describe('generateLivinityDnsmasqConfig', () => {
	it('emits address= line with leading dot wildcard (AC-104-4)', () => {
		const out = generateLivinityDnsmasqConfig('livinity.local', '192.168.1.100')
		expect(out).toMatch(/^address=\/\.livinity\.local\/192\.168\.1\.100$/m)
	})
	it('emits local= directive for the TLD', () => {
		const out = generateLivinityDnsmasqConfig('livinity.local', '192.168.1.100')
		expect(out).toMatch(/^local=\/livinity\.local\/$/m)
	})
	it('emits exactly one address= line (no duplication)', () => {
		const out = generateLivinityDnsmasqConfig('livinity.local', '192.168.1.100')
		const count = out.split('\n').filter((l) => l.startsWith('address=')).length
		expect(count).toBe(1)
	})
	it('includes upstream resolvers (1.1.1.1, 1.0.0.1) and stop-dns-rebind', () => {
		const out = generateLivinityDnsmasqConfig('livinity.local', '192.168.1.100')
		expect(out).toContain('server=1.1.1.1')
		expect(out).toContain('server=1.0.0.1')
		expect(out).toContain('stop-dns-rebind')
	})
	it('exports the canonical install path constant', () => {
		expect(DNSMASQ_CONF_PATH).toBe('/etc/dnsmasq.d/livinity.conf')
	})
})
