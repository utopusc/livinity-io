// Phase 70-02 — LivSlashMenu unit tests.
// Covers filter algorithm + immediate-command detection + commands shape.
// Pure helpers tested directly (no DOM) per CONTEXT D-NO-NEW-DEPS (no @testing-library/react).

import {describe, expect, it} from 'vitest'

import {
	LIV_BUILTIN_COMMANDS,
	executeImmediateCommand,
	filterSlashCommands,
} from './liv-slash-menu'

describe('LIV_BUILTIN_COMMANDS (D-25)', () => {
	it('contains at least 6 commands', () => {
		expect(LIV_BUILTIN_COMMANDS.length).toBeGreaterThanOrEqual(6)
	})

	it('includes /clear, /agents, /help, /usage, /think, /computer', () => {
		const names = LIV_BUILTIN_COMMANDS.map((c) => c.name)
		expect(names).toContain('/clear')
		expect(names).toContain('/agents')
		expect(names).toContain('/help')
		expect(names).toContain('/usage')
		expect(names).toContain('/think')
		expect(names).toContain('/computer')
	})

	it('every command has name + description + category', () => {
		for (const cmd of LIV_BUILTIN_COMMANDS) {
			expect(cmd.name).toMatch(/^\//)
			expect(typeof cmd.description).toBe('string')
			expect(cmd.description.length).toBeGreaterThan(0)
			expect(['builtin', 'command', 'tool', 'skill']).toContain(cmd.category)
		}
	})

	it('all commands are unique by name', () => {
		const names = LIV_BUILTIN_COMMANDS.map((c) => c.name)
		expect(new Set(names).size).toBe(names.length)
	})
})

describe('filterSlashCommands (D-25)', () => {
	it('returns all commands when filter is empty', () => {
		expect(filterSlashCommands(LIV_BUILTIN_COMMANDS, '')).toEqual(LIV_BUILTIN_COMMANDS)
	})

	it('substring matches case-insensitively (uppercase filter)', () => {
		const result = filterSlashCommands(LIV_BUILTIN_COMMANDS, 'CL')
		expect(result.find((c) => c.name === '/clear')).toBeDefined()
	})

	it('substring matches case-insensitively (lowercase filter)', () => {
		const result = filterSlashCommands(LIV_BUILTIN_COMMANDS, 'cl')
		expect(result.find((c) => c.name === '/clear')).toBeDefined()
	})

	it('returns empty array when no match', () => {
		expect(filterSlashCommands(LIV_BUILTIN_COMMANDS, 'XYZ-NOPE')).toEqual([])
	})

	it('matches mid-substring', () => {
		const result = filterSlashCommands(LIV_BUILTIN_COMMANDS, 'omp')
		expect(result.some((c) => c.name === '/computer')).toBe(true)
	})

	it('does not match the leading slash itself', () => {
		// slash is stripped before matching — filter '/' would match nothing useful
		const result = filterSlashCommands(LIV_BUILTIN_COMMANDS, '/')
		expect(result).toEqual([])
	})

	it('preserves order of input commands', () => {
		const result = filterSlashCommands(LIV_BUILTIN_COMMANDS, '')
		expect(result[0].name).toBe('/clear')
		expect(result[1].name).toBe('/agents')
	})
})

describe('executeImmediateCommand (D-27)', () => {
	it('returns true for /clear, /usage, /help', () => {
		expect(executeImmediateCommand('/clear')).toBe(true)
		expect(executeImmediateCommand('/usage')).toBe(true)
		expect(executeImmediateCommand('/help')).toBe(true)
	})

	it('returns false for /think, /computer, /agents', () => {
		expect(executeImmediateCommand('/think')).toBe(false)
		expect(executeImmediateCommand('/computer')).toBe(false)
		expect(executeImmediateCommand('/agents')).toBe(false)
	})

	it('returns false for unknown commands and empty string', () => {
		expect(executeImmediateCommand('/unknown')).toBe(false)
		expect(executeImmediateCommand('')).toBe(false)
	})

	it('is case-sensitive (only exact slash-prefixed names match)', () => {
		// IMMEDIATE_COMMANDS Set uses exact match on lowercase canonical names
		expect(executeImmediateCommand('/CLEAR')).toBe(false)
		expect(executeImmediateCommand('clear')).toBe(false)
	})
})
