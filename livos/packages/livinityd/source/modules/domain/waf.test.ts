// Phase 332 (WAF-01/WAF-02) — waf.ts unit tests.
//
// Locks the stock-Caddy protection primitives + the #1 threat (Caddyfile
// injection via operator-supplied IPs/UA tokens) + the byte-identical guarantee
// for non-opted apps.

import {describe, expect, it} from 'vitest'

import {
	isValidBanIp,
	isValidUaToken,
	renderWafHandles,
	renderWafLogDirective,
	renderWafPrefix,
	validateWafConfig,
	WAF_LOG_DIR,
	WAF_MAX_BAN_IPS,
	WAF_MAX_BAN_UAS,
} from './waf.js'

describe('isValidBanIp — strict IP/CIDR (injection kill)', () => {
	it('accepts IPv4 and IPv4 CIDR', () => {
		for (const ip of ['1.2.3.4', '10.0.0.0/8', '192.168.1.0/24', '255.255.255.255', '0.0.0.0/0']) {
			expect(isValidBanIp(ip)).toBe(true)
		}
	})
	it('accepts conservative IPv6 / CIDR', () => {
		for (const ip of ['2001:db8::1', 'fe80::1', '::1', '2001:db8::/32']) {
			expect(isValidBanIp(ip)).toBe(true)
		}
	})
	it('rejects octets/masks out of range', () => {
		for (const ip of ['256.1.1.1', '1.2.3.4/33', '10.0.0.0/99', '1.2.3']) {
			expect(isValidBanIp(ip)).toBe(false)
		}
	})
	it('332-REVIEW WARN-1: rejects charset-valid-but-semantically-invalid IPv6 (net.isIP parse)', () => {
		// These pass a hex+colon regex but net.isIP rejects them — persisting one
		// would freeze every future Caddy regen (frozen-Caddyfile incident class).
		for (const ip of ['fffff::1', 'f:f', ':::', '1:2:3', '12345::', '2001:db8::/129', 'gg::1', '2001:db8::1/', '1.2.3.4/']) {
			expect(isValidBanIp(ip)).toBe(false)
		}
	})
	it('rejects any Caddyfile-breaking payload', () => {
		for (const ip of [
			'1.2.3.4 }',
			'1.2.3.4\n\trespond 200',
			'1.2.3.4"',
			'1.2.3.4 {respond}',
			'0.0.0.0/0; drop',
			'',
			'a.b.c.d',
		]) {
			expect(isValidBanIp(ip)).toBe(false)
		}
	})
})

describe('isValidUaToken — literal tokens only', () => {
	it('accepts typical bot tokens', () => {
		for (const ua of ['GPTBot', 'AhrefsBot', 'ChatGPT-User', 'curl/7.68', 'python_requests']) {
			expect(isValidUaToken(ua)).toBe(true)
		}
	})
	it('rejects whitespace / regex-injection / caddy-breaking chars', () => {
		for (const ua of ['bad bot', 'a|b', 'evil)', '(?i)x', 'x{', 'x"y', 'x\ty', '', 'x'.repeat(65)]) {
			expect(isValidUaToken(ua)).toBe(false)
		}
	})
})

describe('validateWafConfig — route-layer gate', () => {
	it('clean config → no problems', () => {
		expect(validateWafConfig({banIps: ['1.2.3.4', '10.0.0.0/8'], banUserAgents: ['GPTBot'], abuseBan: true})).toEqual(
			[],
		)
	})
	it('flags every invalid entry + over-limit', () => {
		const problems = validateWafConfig({
			banIps: ['1.2.3.4', 'bad ip }'],
			banUserAgents: ['ok', 'not ok'],
		})
		expect(problems.some((p) => p.includes('invalid IP/CIDR'))).toBe(true)
		expect(problems.some((p) => p.includes('invalid user-agent token'))).toBe(true)
	})
	it('flags over-limit lists', () => {
		const ips = Array.from({length: WAF_MAX_BAN_IPS + 1}, (_, i) => `10.0.0.${i % 256}`)
		const uas = Array.from({length: WAF_MAX_BAN_UAS + 1}, (_, i) => `bot${i}`)
		const problems = validateWafConfig({banIps: ips, banUserAgents: uas})
		expect(problems.some((p) => p.includes('banIps exceeds'))).toBe(true)
		expect(problems.some((p) => p.includes('banUserAgents exceeds'))).toBe(true)
	})
})

describe('renderWafHandles — stock-Caddy denial blocks', () => {
	it('undefined / empty config → empty string (byte-identical guarantee)', () => {
		expect(renderWafHandles(undefined)).toBe('')
		expect(renderWafHandles({})).toBe('')
		expect(renderWafHandles({banIps: [], banUserAgents: []})).toBe('')
	})
	it('IP ban → remote_ip matcher + handle respond 403, trailing newline', () => {
		const out = renderWafHandles({banIps: ['1.2.3.4', '10.0.0.0/8']})
		expect(out).toBe(
			['\t@livos_waf_ban_ip remote_ip 1.2.3.4 10.0.0.0/8', '\thandle @livos_waf_ban_ip {', '\t\trespond 403', '\t}', ''].join(
				'\n',
			),
		)
	})
	it('UA ban → header_regexp with case-insensitive escaped alternation', () => {
		const out = renderWafHandles({banUserAgents: ['GPTBot', 'curl/7.68']})
		// `.` in curl/7.68 must be escaped; `/` and `-` are literal.
		expect(out).toContain('\t@livos_waf_ban_ua header_regexp User-Agent (?i)(GPTBot|curl/7\\.68)')
		expect(out).toContain('\thandle @livos_waf_ban_ua {')
		expect(out).toContain('\t\trespond 403')
	})
	it('invalid entries are SKIPPED at emit even if they slip past the route', () => {
		// Defense in depth: a hand-edited store with a hostile entry must not emit it.
		const out = renderWafHandles({banIps: ['1.2.3.4', 'evil }'], banUserAgents: ['GPTBot', 'bad bot']})
		expect(out).toContain('1.2.3.4')
		expect(out).not.toContain('evil')
		expect(out).not.toContain('bad bot')
		expect(out).toContain('GPTBot')
	})
	it('all-invalid config → empty string (no stray matcher)', () => {
		expect(renderWafHandles({banIps: ['evil }'], banUserAgents: ['bad bot']})).toBe('')
	})
})

describe('renderWafLogDirective — abuse jail opt-in', () => {
	it('disabled / absent → empty', () => {
		expect(renderWafLogDirective('n8n', false)).toBe('')
		expect(renderWafLogDirective('n8n', undefined)).toBe('')
	})
	it('enabled → json log to the dedicated livos-caddy dir', () => {
		const out = renderWafLogDirective('n8n', true)
		expect(out).toContain(`\t\toutput file ${WAF_LOG_DIR}/access-n8n.log {`)
		expect(out).toContain('\t\tformat json')
		expect(out.endsWith('\n')).toBe(true)
	})
	it('bad app id (path-injection) → empty', () => {
		expect(renderWafLogDirective('../etc/passwd', true)).toBe('')
		expect(renderWafLogDirective('n8n/../x', true)).toBe('')
		expect(renderWafLogDirective('N8N', true)).toBe('') // uppercase not allowed
	})
})

describe('renderWafPrefix — full per-vhost prefix', () => {
	it('no config → empty (the non-opted byte-identical guarantee)', () => {
		expect(renderWafPrefix('n8n', undefined)).toBe('')
	})
	it('combines denial handles + abuse log, handles first', () => {
		const out = renderWafPrefix('n8n', {banIps: ['1.2.3.4'], abuseBan: true})
		expect(out.indexOf('@livos_waf_ban_ip')).toBeLessThan(out.indexOf('log {'))
	})
})
