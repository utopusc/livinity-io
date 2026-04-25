// Phase 28 Plan 28-02 — event-mappers unit tests (DOC-14).
//
// Three pure mappers translate three server-side shapes into the unified
// ActivityEvent the Activity Timeline consumes. Plus mergeAndSort dedup +
// cap helper. RED first — implementations follow in event-mappers.ts.

import {describe, expect, test} from 'vitest'

import type {ActivityEvent} from './activity-types'
import {mapAiAlert, mapDockerEvent, mapScheduledJob, mergeAndSort} from './event-mappers'

// Minimal local copies of upstream shapes so the test file doesn't pull
// livinityd source into the UI package's tsconfig include set. Field names
// + types match the originals verbatim (verified against
// livos/packages/livinityd/source/modules/docker/types.ts and ai-alerts.ts
// + scheduler/types.ts).
interface DockerEventInput {
	type: string
	action: string
	actor: string
	actorId: string
	time: number
	attributes: Record<string, string>
}

interface ScheduledJobInput {
	id: string
	name: string
	schedule: string
	type: 'image-prune' | 'container-update-check' | 'git-stack-sync' | 'volume-backup' | 'ai-resource-watch'
	config: Record<string, unknown>
	enabled: boolean
	lastRun: Date | null
	lastRunStatus: 'success' | 'failure' | 'skipped' | 'running' | null
	lastRunError: string | null
	lastRunOutput: unknown | null
	nextRun: Date | null
	createdAt: Date
	updatedAt: Date
}

interface AiAlertInput {
	id: string
	containerName: string
	environmentId: string | null
	severity: 'info' | 'warning' | 'critical'
	kind: 'memory-pressure' | 'cpu-throttle' | 'restart-loop' | 'disk-pressure' | 'other'
	message: string
	payloadJson: Record<string, unknown>
	createdAt: string
	dismissedAt: string | null
}

const ENV_ID = '11111111-1111-1111-1111-111111111111'

// ---------------------------------------------------------------------------
// mapDockerEvent
// ---------------------------------------------------------------------------

describe('mapDockerEvent', () => {
	const baseEvent: DockerEventInput = {
		type: 'container',
		action: 'start',
		actor: 'n8n',
		actorId: 'abc123',
		time: 1714000000,
		attributes: {},
	}

	test('A: container start maps to expected ActivityEvent shape (sec→ms timestamp)', () => {
		const ev = mapDockerEvent(baseEvent, ENV_ID)
		expect(ev).toEqual<ActivityEvent>({
			id: 'docker:abc123:1714000000:start',
			source: 'docker',
			severity: 'info',
			timestamp: 1714000000000,
			title: 'Container started: n8n',
			body: '',
			sourceType: 'container',
			sourceId: 'n8n',
			envId: ENV_ID,
		})
	})

	test('B-error: die / oom / kill / destroy classify as severity=error', () => {
		for (const action of ['die', 'oom', 'kill', 'destroy']) {
			const ev = mapDockerEvent({...baseEvent, action}, ENV_ID)
			expect(ev.severity).toBe('error')
		}
	})

	test('B-warn: stop / pause / unhealthy classify as severity=warn', () => {
		for (const action of ['stop', 'pause', 'unhealthy']) {
			const ev = mapDockerEvent({...baseEvent, action}, ENV_ID)
			expect(ev.severity).toBe('warn')
		}
	})

	test('B-info: create / start / restart / unpause / rename / pull / connect / disconnect / mount / unmount classify as info', () => {
		for (const action of [
			'create',
			'start',
			'restart',
			'unpause',
			'rename',
			'attach',
			'pull',
			'connect',
			'disconnect',
			'mount',
			'unmount',
		]) {
			const ev = mapDockerEvent({...baseEvent, action}, ENV_ID)
			expect(ev.severity).toBe('info')
		}
	})

	test('B-default: unmapped action defaults to info', () => {
		const ev = mapDockerEvent({...baseEvent, action: 'some-new-docker-verb-from-future'}, ENV_ID)
		expect(ev.severity).toBe('info')
	})

	test('C: image / network / volume / daemon use Type-cased title + matching sourceType', () => {
		for (const t of ['image', 'network', 'volume', 'daemon']) {
			const ev = mapDockerEvent({...baseEvent, type: t, action: 'create', actor: 'thing'}, ENV_ID)
			expect(ev.sourceType).toBe(t)
			// Title format for non-container: '<Type> <action>: <actor>'
			expect(ev.title).toBe(`${t.charAt(0).toUpperCase()}${t.slice(1)} create: thing`)
		}
	})

	test('D: id is deterministic for same input', () => {
		const a = mapDockerEvent(baseEvent, ENV_ID)
		const b = mapDockerEvent(baseEvent, ENV_ID)
		expect(a.id).toBe(b.id)
	})
})

// ---------------------------------------------------------------------------
// mapScheduledJob
// ---------------------------------------------------------------------------

describe('mapScheduledJob', () => {
	const baseJob: ScheduledJobInput = {
		id: 'job-1',
		name: 'nightly-backup',
		schedule: '0 0 * * *',
		type: 'volume-backup',
		config: {},
		enabled: true,
		lastRun: null,
		lastRunStatus: null,
		lastRunError: null,
		lastRunOutput: null,
		nextRun: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	}

	test('A: lastRun=null returns null (no event for never-run jobs)', () => {
		expect(mapScheduledJob(baseJob)).toBeNull()
	})

	test('B: success → severity=info, title="Job succeeded: <name>"', () => {
		const t = new Date('2026-04-25T12:00:00Z')
		const ev = mapScheduledJob({...baseJob, lastRun: t, lastRunStatus: 'success'})
		expect(ev).not.toBeNull()
		expect(ev!.severity).toBe('info')
		expect(ev!.title).toBe('Job succeeded: nightly-backup')
		expect(ev!.body).toBe('')
		expect(ev!.timestamp).toBe(t.getTime())
		expect(ev!.sourceType).toBe('job')
		expect(ev!.sourceId).toBe('job-1')
	})

	test('C: failure → severity=error, title="Job failed: <name>", body=lastRunError truncated to 200 chars', () => {
		const t = new Date('2026-04-25T12:00:00Z')
		const longError = 'x'.repeat(500)
		const ev = mapScheduledJob({
			...baseJob,
			lastRun: t,
			lastRunStatus: 'failure',
			lastRunError: longError,
		})
		expect(ev).not.toBeNull()
		expect(ev!.severity).toBe('error')
		expect(ev!.title).toBe('Job failed: nightly-backup')
		expect(ev!.body.length).toBeLessThanOrEqual(200)
	})

	test('C-null-error: failure with null lastRunError → body=""', () => {
		const t = new Date('2026-04-25T12:00:00Z')
		const ev = mapScheduledJob({
			...baseJob,
			lastRun: t,
			lastRunStatus: 'failure',
			lastRunError: null,
		})
		expect(ev!.body).toBe('')
	})

	test('D: skipped → severity=warn, title="Job skipped: <name>"', () => {
		const t = new Date('2026-04-25T12:00:00Z')
		const ev = mapScheduledJob({...baseJob, lastRun: t, lastRunStatus: 'skipped'})
		expect(ev).not.toBeNull()
		expect(ev!.severity).toBe('warn')
		expect(ev!.title).toBe('Job skipped: nightly-backup')
	})

	test('E: running → null (not a completed event)', () => {
		const t = new Date('2026-04-25T12:00:00Z')
		const ev = mapScheduledJob({...baseJob, lastRun: t, lastRunStatus: 'running'})
		expect(ev).toBeNull()
	})

	test('F: id format is "scheduler:<job.id>:<lastRun.getTime()>"', () => {
		const t = new Date('2026-04-25T12:00:00Z')
		const ev = mapScheduledJob({...baseJob, lastRun: t, lastRunStatus: 'success'})
		expect(ev!.id).toBe(`scheduler:job-1:${t.getTime()}`)
	})
})

// ---------------------------------------------------------------------------
// mapAiAlert
// ---------------------------------------------------------------------------

describe('mapAiAlert', () => {
	const baseAlert: AiAlertInput = {
		id: 'alert-uuid',
		containerName: 'n8n',
		environmentId: ENV_ID,
		severity: 'info',
		kind: 'memory-pressure',
		message: 'Memory at 92%',
		payloadJson: {},
		createdAt: '2026-04-25T12:00:00.000Z',
		dismissedAt: null,
	}

	test('A: severity collapse — critical→error, warning→warn, info→info', () => {
		expect(mapAiAlert({...baseAlert, severity: 'critical'}).severity).toBe('error')
		expect(mapAiAlert({...baseAlert, severity: 'warning'}).severity).toBe('warn')
		expect(mapAiAlert({...baseAlert, severity: 'info'}).severity).toBe('info')
	})

	test('B: title="AI alert: <kind>", body=<message>', () => {
		const ev = mapAiAlert(baseAlert)
		expect(ev.title).toBe('AI alert: memory-pressure')
		expect(ev.body).toBe('Memory at 92%')
	})

	test('C: timestamp = Date.parse(createdAt) (ms)', () => {
		const ev = mapAiAlert(baseAlert)
		expect(ev.timestamp).toBe(Date.parse('2026-04-25T12:00:00.000Z'))
	})

	test('D: sourceType="ai-alert", sourceId=containerName, envId=environmentId', () => {
		const ev = mapAiAlert(baseAlert)
		expect(ev.sourceType).toBe('ai-alert')
		expect(ev.sourceId).toBe('n8n')
		expect(ev.envId).toBe(ENV_ID)
	})

	test('E: id = "ai:" + alert.id', () => {
		expect(mapAiAlert(baseAlert).id).toBe('ai:alert-uuid')
	})

	test('F: dismissed alerts still map (filter belongs to the hook layer)', () => {
		const ev = mapAiAlert({...baseAlert, dismissedAt: '2026-04-25T13:00:00.000Z'})
		expect(ev).toBeTruthy()
		expect(ev.id).toBe('ai:alert-uuid')
	})
})

// ---------------------------------------------------------------------------
// mergeAndSort
// ---------------------------------------------------------------------------

describe('mergeAndSort', () => {
	function makeEv(id: string, ts: number): ActivityEvent {
		return {
			id,
			source: 'docker',
			severity: 'info',
			timestamp: ts,
			title: id,
			body: '',
			sourceType: 'container',
			sourceId: id,
			envId: null,
		}
	}

	test('A: concatenates and sorts DESC by timestamp (most recent first)', () => {
		const out = mergeAndSort(
			[makeEv('a', 100), makeEv('b', 300)],
			[makeEv('c', 200)],
		)
		expect(out.map((e) => e.id)).toEqual(['b', 'c', 'a'])
	})

	test('B: deduplicates by id (later wins)', () => {
		const first = makeEv('dup', 100)
		const second = {...makeEv('dup', 100), title: 'overwritten'}
		const out = mergeAndSort([first], [second])
		expect(out).toHaveLength(1)
		expect(out[0].title).toBe('overwritten')
	})

	test('C: caps result at 500 rows', () => {
		const big = Array.from({length: 600}, (_, i) => makeEv(`e-${i}`, i))
		const out = mergeAndSort(big)
		expect(out).toHaveLength(500)
	})

	test('D: stable sort — equal timestamps preserve input array order', () => {
		const a = makeEv('a', 100)
		const b = makeEv('b', 100)
		const c = makeEv('c', 100)
		const out = mergeAndSort([a, b, c])
		expect(out.map((e) => e.id)).toEqual(['a', 'b', 'c'])
	})
})
