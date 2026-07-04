import {expect, test} from 'vitest'

import {
	candidateZoneNames,
	decodeTunnelToken,
	deriveAppHost,
	parseCfApiTokenSecret,
} from './cf-local.js'

test('decodeTunnelToken extracts account tag + tunnel id from a base64 connector blob', () => {
	const blob = Buffer.from(
		JSON.stringify({a: 'acct-tag-123', t: 'tunnel-id-456', s: 'secretbase64=='}),
	).toString('base64')
	expect(decodeTunnelToken(blob)).toEqual({accountId: 'acct-tag-123', tunnelId: 'tunnel-id-456'})
})

test('decodeTunnelToken tolerates surrounding whitespace', () => {
	const blob = `\n  ${Buffer.from(JSON.stringify({a: 'a1', t: 't1', s: 's1'})).toString('base64')}  \n`
	expect(decodeTunnelToken(blob)).toEqual({accountId: 'a1', tunnelId: 't1'})
})

test('decodeTunnelToken returns null on malformed / missing fields', () => {
	expect(decodeTunnelToken('')).toBeNull()
	expect(decodeTunnelToken('not-base64-json!!!')).toBeNull()
	expect(decodeTunnelToken(Buffer.from(JSON.stringify({t: 'only-tunnel'})).toString('base64'))).toBeNull()
	expect(decodeTunnelToken(Buffer.from(JSON.stringify({a: '', t: 't'})).toString('base64'))).toBeNull()
})

test('parseCfApiTokenSecret reads env-file format (writeCfTokenSecret contract)', () => {
	expect(parseCfApiTokenSecret('CLOUDFLARE_API_TOKEN=abc123\n')).toBe('abc123')
	expect(parseCfApiTokenSecret('export CLOUDFLARE_API_TOKEN="quoted-tok"\n')).toBe('quoted-tok')
})

test('parseCfApiTokenSecret falls back to a bare token line', () => {
	expect(parseCfApiTokenSecret('  raw-token-value  \n')).toBe('raw-token-value')
	expect(parseCfApiTokenSecret('')).toBeNull()
})

test('deriveAppHost prepends <app>- to the apex (hyphen scheme parity with Pro)', () => {
	expect(deriveAppHost('bruce.bruceoz.com', 'n8n')).toBe('n8n-bruce.bruceoz.com')
	expect(deriveAppHost('jack.example.co.uk', 'jellyfin')).toBe('jellyfin-jack.example.co.uk')
	// Pro parity: the same rule applied to a livinity.io apex reproduces the managed host.
	expect(deriveAppHost('bruce.livinity.io', 'n8n')).toBe('n8n-bruce.livinity.io')
})

test('candidateZoneNames walks from full apex down to the 2-label registrable, skipping the bare TLD', () => {
	expect(candidateZoneNames('bruce.bruceoz.com')).toEqual(['bruce.bruceoz.com', 'bruceoz.com'])
	expect(candidateZoneNames('a.b.c.example.com')).toEqual([
		'a.b.c.example.com',
		'b.c.example.com',
		'c.example.com',
		'example.com',
	])
	expect(candidateZoneNames('example.com')).toEqual(['example.com'])
})
