import {test, expect} from 'vitest'

import {classifyInspect} from './health-poll.js'

// Pure classifier — no Docker calls. Mirrors <behavior> in 286-02-PLAN.md.

// Test 1: Running + healthy → ready.
test('classifyInspect: running + healthy → ready', () => {
	expect(classifyInspect({status: 'running', health: 'healthy'})).toBe('ready')
})

// Test 2: Running with no healthcheck (<no value>) → ready.
test('classifyInspect: running with no healthcheck → ready', () => {
	expect(classifyInspect({status: 'running', health: '<no value>'})).toBe('ready')
})

// Test 3: Running + healthcheck still starting → pending (keep polling).
test('classifyInspect: running + starting → pending', () => {
	expect(classifyInspect({status: 'running', health: 'starting'})).toBe('pending')
})

// Test 4: Running + unhealthy → unhealthy (terminal-fail after retries).
test('classifyInspect: running + unhealthy → unhealthy', () => {
	expect(classifyInspect({status: 'running', health: 'unhealthy'})).toBe('unhealthy')
})

// Test 5: Restarting (crash-loop in progress) → pending (keep polling until timeout).
test('classifyInspect: restarting → pending', () => {
	expect(classifyInspect({status: 'restarting', health: '<no value>'})).toBe('pending')
})

// Test 6: Exited (container died) → failed (terminal).
test('classifyInspect: exited → failed', () => {
	expect(classifyInspect({status: 'exited', health: '<no value>'})).toBe('failed')
})

// Test 7: Created (not started yet) → pending.
test('classifyInspect: created → pending', () => {
	expect(classifyInspect({status: 'created', health: '<no value>'})).toBe('pending')
})

// Extra guards: empty health string is treated as "no healthcheck"; unknown
// status is terminal (failed).
test('classifyInspect: running + empty health string → ready', () => {
	expect(classifyInspect({status: 'running', health: ''})).toBe('ready')
})

test('classifyInspect: dead → failed', () => {
	expect(classifyInspect({status: 'dead', health: '<no value>'})).toBe('failed')
})
