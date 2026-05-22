/**
 * Phase 197-04 Plan 04 Task 1 — wrap-tool-with-approval.test.ts.
 *
 * Coverage (≥6 PASS):
 *   1. Wrapper preserves description + parameters
 *   2. approved=true → delegates to original execute + returns its value
 *   3. approved=false → returns REJECTED_TOOL_RESULT, original NEVER called (W-02)
 *   4. Each call generates a UNIQUE toolCallId
 *   5. runId from ctx.runId is forwarded; missing ctx.runId falls back to UUID
 *   6. REJECTED_TOOL_RESULT shape stable
 */

import {describe, expect, test, vi} from 'vitest'

import {
	REJECTED_TOOL_RESULT,
	wrapToolWithApproval,
	type ApprovalGate,
} from './wrap-tool-with-approval.js'

function makeTool() {
	return {
		description: 'desc',
		parameters: {kind: 'zod-schema'},
		execute: vi.fn(async (input: unknown, _ctx: unknown) => ({ok: true, input})),
	}
}

describe('wrapToolWithApproval (W-02 lock)', () => {
	test('Test 1: wrapper preserves description + parameters', () => {
		const tool = makeTool()
		const gate: ApprovalGate = {registerPending: vi.fn().mockResolvedValue(true)}
		const wrapped = wrapToolWithApproval(tool, 'luse_computer_click_mouse', gate)
		expect(wrapped.description).toBe('desc')
		expect(wrapped.parameters).toEqual({kind: 'zod-schema'})
		// new object reference
		expect(wrapped).not.toBe(tool)
	})

	test('Test 2: approved=true delegates to original execute + returns its value', async () => {
		const tool = makeTool()
		const gate: ApprovalGate = {registerPending: vi.fn().mockResolvedValue(true)}
		const wrapped = wrapToolWithApproval(tool, 'luse_computer_click_mouse', gate)
		const result = await wrapped.execute({x: 1}, {runId: 'r1'})
		expect(tool.execute).toHaveBeenCalledTimes(1)
		expect(tool.execute).toHaveBeenCalledWith({x: 1}, {runId: 'r1'})
		expect(result).toEqual({ok: true, input: {x: 1}})
	})

	test('Test 3: approved=false returns REJECTED_TOOL_RESULT, original NEVER called', async () => {
		const tool = makeTool()
		const gate: ApprovalGate = {registerPending: vi.fn().mockResolvedValue(false)}
		const wrapped = wrapToolWithApproval(tool, 'luse_computer_click_mouse', gate)
		const result = await wrapped.execute({x: 1}, {runId: 'r1'})
		expect(tool.execute).not.toHaveBeenCalled()
		expect(result).toEqual(REJECTED_TOOL_RESULT)
		expect((result as {rejected?: boolean}).rejected).toBe(true)
	})

	test('Test 4: each execute call generates a UNIQUE toolCallId', async () => {
		const tool = makeTool()
		const gate: ApprovalGate = {registerPending: vi.fn().mockResolvedValue(true)}
		const wrapped = wrapToolWithApproval(tool, 'luse_computer_click_mouse', gate)
		await wrapped.execute({}, {runId: 'r1'})
		await wrapped.execute({}, {runId: 'r1'})
		const calls = (gate.registerPending as ReturnType<typeof vi.fn>).mock.calls
		expect(calls.length).toBe(2)
		const id1 = calls[0]?.[0] as string
		const id2 = calls[1]?.[0] as string
		expect(id1).not.toEqual(id2)
		expect(typeof id1).toBe('string')
		expect(id1.length).toBeGreaterThan(0)
	})

	test('Test 5: runId from ctx.runId forwarded; missing → fallback UUID', async () => {
		const tool = makeTool()
		const gate: ApprovalGate = {registerPending: vi.fn().mockResolvedValue(true)}
		const wrapped = wrapToolWithApproval(tool, 'luse_computer_click_mouse', gate)
		await wrapped.execute({}, {runId: 'my-run-123'})
		await wrapped.execute({}, {/* no runId */})
		const calls = (gate.registerPending as ReturnType<typeof vi.fn>).mock.calls
		expect(calls[0]?.[1]).toBe('my-run-123')
		expect(typeof calls[1]?.[1]).toBe('string')
		expect((calls[1]?.[1] as string).length).toBeGreaterThan(0)
		expect(calls[1]?.[1]).not.toBe('my-run-123')
	})

	test('Test 6: REJECTED_TOOL_RESULT shape stable', () => {
		expect(REJECTED_TOOL_RESULT).toEqual({
			rejected: true,
			reason: 'operator rejected this tool call',
		})
	})
})
