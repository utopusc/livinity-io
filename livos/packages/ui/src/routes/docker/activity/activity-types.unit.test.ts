// Phase 28 Plan 28-02 — activity-types unit tests (DOC-14).
//
// activity-types.ts defines the unified ActivityEvent shape consumed by the
// Activity Timeline section. This file is mostly type-level — three short
// runtime assertions on the const arrays + one shape-sanity test per source
// to confirm TypeScript compiles a hand-built event of each kind.

import {describe, expect, test} from 'vitest'

import {
	ACTIVITY_SEVERITIES,
	ACTIVITY_SOURCES,
	type ActivityEvent,
} from './activity-types'

describe('ACTIVITY_SOURCES', () => {
	test('A: equals exactly [docker, scheduler, ai] in that order (chip render order)', () => {
		expect(ACTIVITY_SOURCES).toEqual(['docker', 'scheduler', 'ai'])
	})
})

describe('ACTIVITY_SEVERITIES', () => {
	test('B: equals exactly [info, warn, error] (collapsed from AiAlertSeverity)', () => {
		expect(ACTIVITY_SEVERITIES).toEqual(['info', 'warn', 'error'])
	})
})

describe('ActivityEvent shape sanity', () => {
	test('C-docker: a docker container event compiles + parses', () => {
		const ev: ActivityEvent = {
			id: 'docker:abc:1714000000:start',
			source: 'docker',
			severity: 'info',
			timestamp: 1714000000000,
			title: 'Container started: n8n',
			body: '',
			sourceType: 'container',
			sourceId: 'n8n',
			envId: 'env-1',
		}
		expect(ev.source).toBe('docker')
		expect(ev.sourceType).toBe('container')
	})

	test('C-scheduler: a scheduler job event compiles + parses', () => {
		const ev: ActivityEvent = {
			id: 'scheduler:job-1:1714000000000',
			source: 'scheduler',
			severity: 'error',
			timestamp: 1714000000000,
			title: 'Job failed: nightly-backup',
			body: 'Connection refused',
			sourceType: 'job',
			sourceId: 'job-1',
			envId: null,
		}
		expect(ev.source).toBe('scheduler')
		expect(ev.sourceType).toBe('job')
	})

	test('C-ai: an AI alert event compiles + parses', () => {
		const ev: ActivityEvent = {
			id: 'ai:alert-uuid',
			source: 'ai',
			severity: 'warn',
			timestamp: 1714000000000,
			title: 'AI alert: memory-pressure',
			body: 'Memory above 90% for 10m',
			sourceType: 'ai-alert',
			sourceId: 'n8n',
			envId: 'env-1',
		}
		expect(ev.source).toBe('ai')
		expect(ev.sourceType).toBe('ai-alert')
	})
})
