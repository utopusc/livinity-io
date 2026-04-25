// Phase 25 Plan 25-02 — sortTopCpu pure module tests.
//
// Locked-down behaviour for the cross-env Top-CPU sort algorithm: descending
// by cpuPercent, ties broken by envName asc then containerName asc, hard cap
// at TOP_CPU_LIMIT (default 10). Pure module — no React, no tRPC; runs cleanly
// under jsdom-or-node.

import {describe, expect, test} from 'vitest'

import {sortTopCpu, TOP_CPU_LIMIT, type TopCpuEntry} from './sort-top-cpu'

function entry(overrides: Partial<TopCpuEntry> = {}): TopCpuEntry {
	return {
		envId: 'env-a',
		envName: 'a',
		containerId: 'c1',
		containerName: 'c1',
		image: 'nginx',
		cpuPercent: 0,
		memoryPercent: 0,
		isProtected: false,
		...overrides,
	}
}

describe('sortTopCpu', () => {
	test('empty input returns []', () => {
		expect(sortTopCpu([])).toEqual([])
	})

	test('single-element input returned unchanged', () => {
		const e = entry({cpuPercent: 5})
		expect(sortTopCpu([e])).toEqual([e])
	})

	test('sorts descending by cpuPercent', () => {
		const e1 = entry({containerName: 'c-a', cpuPercent: 50})
		const e2 = entry({containerName: 'c-b', cpuPercent: 30})
		const e3 = entry({containerName: 'c-c', cpuPercent: 70})
		expect(sortTopCpu([e1, e2, e3]).map((x) => x.cpuPercent)).toEqual([70, 50, 30])
	})

	test('tie on cpuPercent broken by envName asc, then containerName asc', () => {
		const a50 = entry({envName: 'a', containerName: 'x', cpuPercent: 50})
		const b50 = entry({envName: 'b', containerName: 'x', cpuPercent: 50})
		const a60 = entry({envName: 'a', containerName: 'y', cpuPercent: 60})
		const result = sortTopCpu([b50, a50, a60])
		expect(result).toEqual([a60, a50, b50])
	})

	test('respects custom limit param', () => {
		const fifteen = Array.from({length: 15}, (_, i) =>
			entry({containerName: `c${i}`, containerId: `c${i}`, cpuPercent: i}),
		)
		expect(sortTopCpu(fifteen, 10)).toHaveLength(10)
	})

	test('default limit is TOP_CPU_LIMIT (10)', () => {
		const fifteen = Array.from({length: 15}, (_, i) =>
			entry({containerName: `c${i}`, containerId: `c${i}`, cpuPercent: i}),
		)
		expect(sortTopCpu(fifteen)).toHaveLength(TOP_CPU_LIMIT)
		expect(TOP_CPU_LIMIT).toBe(10)
	})

	test('does not mutate input array', () => {
		const e1 = entry({containerName: 'c-a', cpuPercent: 50})
		const e2 = entry({containerName: 'c-b', cpuPercent: 30})
		const e3 = entry({containerName: 'c-c', cpuPercent: 70})
		const input = [e1, e2, e3]
		const inputBefore = [...input]
		sortTopCpu(input)
		expect(input).toEqual(inputBefore)
	})
})
