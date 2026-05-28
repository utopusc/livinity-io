/**
 * Phase 241-01 — transform.test.ts
 *
 * Unit tests for transformRedisToAionUi — pure data-shape conversion from
 * a Liv Redis catalog entry into the AionUi POST /api/mcp/servers payload
 * shape. No I/O — every assertion is a direct return-value check or
 * thrown-error pattern match.
 *
 * Reference contracts:
 *   - .planning/phases/241-mcp-auto-add-liv-tools/241-RESEARCH.md §1 (probe-verified
 *     CreateMcpServerRequest shape: 5 fields — name, transport, description,
 *     original_json, builtin; `enabled` is NOT a request field)
 *   - .planning/phases/241-mcp-auto-add-liv-tools/241-CONTEXT.md D-241-01 (5 system MCPs)
 */

import {describe, expect, test} from 'vitest'

import {transformRedisToAionUi} from '../transform.js'
import type {LivRedisEntry} from '../types.js'

describe('transformRedisToAionUi', () => {
	test('stdio happy path — full payload (command, args, env, description, enabled ignored)', () => {
		const input: LivRedisEntry = {
			name: 'luse',
			transport: 'stdio',
			command: 'node',
			args: ['x.js'],
			env: {FOO: 'bar'},
			enabled: true, // MUST be stripped from output (D-241-RESEARCH §1 enabled quirk)
			description: 'desc',
		}
		const out = transformRedisToAionUi('luse', input)
		expect(out).toEqual({
			name: 'luse',
			transport: {type: 'stdio', command: 'node', args: ['x.js'], env: {FOO: 'bar'}},
			description: 'desc',
			builtin: false,
		})
		// Belt-and-braces: enabled must not appear anywhere in the payload
		expect((out as Record<string, unknown>).enabled).toBeUndefined()
	})

	test('stdio with missing args defaults to []', () => {
		const input: LivRedisEntry = {
			name: 'liv-system',
			transport: 'stdio',
			command: '/usr/local/bin/liv-system-mcp',
		}
		const out = transformRedisToAionUi('liv-system', input)
		expect(out.transport).toEqual({type: 'stdio', command: '/usr/local/bin/liv-system-mcp', args: []})
		// description must not be set when absent in input (no description:undefined field leak)
		expect(Object.prototype.hasOwnProperty.call(out, 'description')).toBe(false)
	})

	test('stdio missing command throws descriptive error', () => {
		const input: LivRedisEntry = {
			name: 'liv-docker',
			transport: 'stdio',
		}
		expect(() => transformRedisToAionUi('liv-docker', input)).toThrow(
			/Liv MCP 'liv-docker' marked stdio but has no command/,
		)
	})

	test('http happy path — minimal payload (url only, no headers)', () => {
		const input: LivRedisEntry = {
			name: 'liv-vault',
			transport: 'http',
			url: 'http://127.0.0.1:9000',
		}
		const out = transformRedisToAionUi('liv-vault', input)
		expect(out).toEqual({
			name: 'liv-vault',
			transport: {type: 'http', url: 'http://127.0.0.1:9000'},
			builtin: false,
		})
	})

	test('http missing url throws descriptive error', () => {
		const input: LivRedisEntry = {
			name: 'liv-vault',
			transport: 'http',
		}
		expect(() => transformRedisToAionUi('liv-vault', input)).toThrow(
			/Liv MCP 'liv-vault' marked http but has no url/,
		)
	})

	test('unknown transport throws descriptive error (sse is AionUi-only, not in Liv catalog)', () => {
		const input = {
			name: 'rogue',
			transport: 'sse',
			url: 'http://x',
		} as unknown as LivRedisEntry
		expect(() => transformRedisToAionUi('rogue', input)).toThrow(/unknown transport: sse/)
	})

	test('description is passed through when present; omitted when absent', () => {
		// Present
		const withDesc: LivRedisEntry = {
			name: 'liv-apps',
			transport: 'stdio',
			command: 'liv-apps-mcp',
			description: 'List + control installed apps',
		}
		const outWith = transformRedisToAionUi('liv-apps', withDesc)
		expect(outWith.description).toBe('List + control installed apps')

		// Absent
		const noDesc: LivRedisEntry = {
			name: 'liv-apps',
			transport: 'stdio',
			command: 'liv-apps-mcp',
		}
		const outNo = transformRedisToAionUi('liv-apps', noDesc)
		expect(Object.prototype.hasOwnProperty.call(outNo, 'description')).toBe(false)
	})

	test('http transport passes headers through when present', () => {
		const input: LivRedisEntry = {
			name: 'liv-vault',
			transport: 'http',
			url: 'http://127.0.0.1:9000',
			headers: {Authorization: 'Bearer xyz'},
		}
		const out = transformRedisToAionUi('liv-vault', input)
		expect(out.transport).toEqual({
			type: 'http',
			url: 'http://127.0.0.1:9000',
			headers: {Authorization: 'Bearer xyz'},
		})
	})

	test('stdio without env produces transport without env key (no env:undefined leak)', () => {
		const input: LivRedisEntry = {
			name: 'liv-system',
			transport: 'stdio',
			command: 'liv-system-mcp',
			args: ['--verbose'],
		}
		const out = transformRedisToAionUi('liv-system', input)
		expect(Object.prototype.hasOwnProperty.call(out.transport, 'env')).toBe(false)
	})
})
