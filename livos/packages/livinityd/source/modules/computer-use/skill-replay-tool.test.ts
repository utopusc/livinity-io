// Phase 97-07 — `webapp_replay_skill` tool tests.
//
// Coverage:
//   T1 — Bad UUID returns isError:true with clear message.
//   T2 — Missing skillId returns isError:true.
//   T3 — Skill not found (different user) returns isError:true (NOT_FOUND
//        as text, never the row).
//   T4 — Happy path returns a text content item that contains the rendered
//        <previously-learned-skill> block (matches P97-04 fixture shape).
//   T5 — _liv_meta carries skillId, webappId, retainedCount, truncated.
//   T6 — freeFormGoal is plumbed through to the context builder.

import {describe, it, expect, vi, beforeEach} from 'vitest'

import {
	executeWebAppReplaySkill,
	WEBAPP_REPLAY_SKILL_TOOL,
	translateLegacyBytebotToolNames,
} from './skill-replay-tool.js'

vi.mock('../webapps/skills-repository.js', () => ({
	getWebAppSkill: vi.fn(),
}))

import {getWebAppSkill} from '../webapps/skills-repository.js'

const FAKE_USER = '11111111-1111-1111-1111-111111111111'
const FAKE_SKILL_ID = '22222222-2222-2222-2222-222222222222'
const FAKE_WEBAPP = '33333333-3333-3333-3333-333333333333'

const fakePool = {} as never

beforeEach(() => {
	vi.mocked(getWebAppSkill).mockReset()
})

describe('webapp_replay_skill (P97-07)', () => {
	it('schema: tool name + required input shape', () => {
		expect(WEBAPP_REPLAY_SKILL_TOOL.name).toBe('webapp_replay_skill')
		expect(WEBAPP_REPLAY_SKILL_TOOL.input_schema.required).toEqual(['skillId'])
		expect(WEBAPP_REPLAY_SKILL_TOOL.input_schema.properties.skillId).toBeDefined()
		expect(WEBAPP_REPLAY_SKILL_TOOL.input_schema.properties.freeFormGoal).toBeDefined()
	})

	it('T1: bad UUID → isError true with message', async () => {
		const r = await executeWebAppReplaySkill(
			{pool: fakePool, userId: FAKE_USER},
			{skillId: 'not-a-uuid'},
		)
		expect(r.isError).toBe(true)
		expect(r.content[0]).toMatchObject({type: 'text'})
		expect((r.content[0] as {text: string}).text).toMatch(/UUID/)
	})

	it('T2: missing skillId → isError', async () => {
		const r = await executeWebAppReplaySkill(
			{pool: fakePool, userId: FAKE_USER},
			{} as never,
		)
		expect(r.isError).toBe(true)
	})

	it('T3: skill not found → isError with NOT_FOUND-style message', async () => {
		vi.mocked(getWebAppSkill).mockResolvedValue(null)
		const r = await executeWebAppReplaySkill(
			{pool: fakePool, userId: FAKE_USER},
			{skillId: FAKE_SKILL_ID},
		)
		expect(r.isError).toBe(true)
		expect((r.content[0] as {text: string}).text).toMatch(/not found/i)
	})

	it('T4: happy path returns rendered <previously-learned-skill> block', async () => {
		vi.mocked(getWebAppSkill).mockResolvedValue({
			id: FAKE_SKILL_ID,
			userId: FAKE_USER,
			webappId: FAKE_WEBAPP,
			skillName: 'click-and-save',
			actionLog: {
				version: 1,
				events: [
					{type: 'click', button: 'left', coords: {x: 50, y: 60}, ts: 1, screenshotRef: 'a'},
				],
			},
			createdAt: new Date(),
		})
		const r = await executeWebAppReplaySkill(
			{pool: fakePool, userId: FAKE_USER},
			{skillId: FAKE_SKILL_ID},
		)
		expect(r.isError).toBe(false)
		expect(r.content).toHaveLength(1)
		const txt = (r.content[0] as {text: string}).text
		expect(txt).toContain('<previously-learned-skill name="click-and-save">')
		expect(txt).toContain("1. click button 'left' at (50, 60)")
		expect(txt).toContain('</previously-learned-skill>')
	})

	it('T5: _liv_meta carries identification + stats', async () => {
		vi.mocked(getWebAppSkill).mockResolvedValue({
			id: FAKE_SKILL_ID,
			userId: FAKE_USER,
			webappId: FAKE_WEBAPP,
			skillName: 'name',
			actionLog: {version: 1, events: []},
			createdAt: new Date(),
		})
		const r = await executeWebAppReplaySkill(
			{pool: fakePool, userId: FAKE_USER},
			{skillId: FAKE_SKILL_ID},
		)
		expect(r._liv_meta).toMatchObject({
			kind: 'webapp-replay-skill',
			skillId: FAKE_SKILL_ID,
			skillName: 'name',
			webappId: FAKE_WEBAPP,
			truncated: false,
			retainedCount: 0,
			totalCount: 0,
		})
	})

	it('T6: freeFormGoal plumbed to context builder → renders <goal>', async () => {
		vi.mocked(getWebAppSkill).mockResolvedValue({
			id: FAKE_SKILL_ID,
			userId: FAKE_USER,
			webappId: FAKE_WEBAPP,
			skillName: 'n',
			actionLog: {version: 1, events: []},
			createdAt: new Date(),
		})
		const r = await executeWebAppReplaySkill(
			{pool: fakePool, userId: FAKE_USER},
			{skillId: FAKE_SKILL_ID, freeFormGoal: 'finish the form'},
		)
		const txt = (r.content[0] as {text: string}).text
		expect(txt).toContain('<goal>finish the form</goal>')
	})

	it('T7: getWebAppSkill called with the userId passed in deps (not skill.userId)', async () => {
		vi.mocked(getWebAppSkill).mockResolvedValue(null)
		await executeWebAppReplaySkill(
			{pool: fakePool, userId: FAKE_USER},
			{skillId: FAKE_SKILL_ID},
		)
		expect(getWebAppSkill).toHaveBeenCalledWith(fakePool, FAKE_USER, FAKE_SKILL_ID)
	})

	it('T8: oversized freeFormGoal → isError', async () => {
		const big = 'x'.repeat(3000)
		const r = await executeWebAppReplaySkill(
			{pool: fakePool, userId: FAKE_USER},
			{skillId: FAKE_SKILL_ID, freeFormGoal: big},
		)
		expect(r.isError).toBe(true)
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase 100-10-02 — backwards-compat shim for action_log v2 legacy tool names.
//
// Pre-100-10-02 action_log entries reference tool names with the
// `mcp__bytebot__<name>` Claude Code SDK prefix. After D-100-10-B (Bytebot→Luse
// rename), the registered MCP server is `luse` and tool names are
// `mcp__luse__<name>`. The shim lazy-translates legacy events on READ for
// skill versions <= 2 (D-100-10-I). Removal target v34 (G-100-10-F).
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 100-10-02 backwards-compat: legacy bytebot tool names', () => {
	it('T-10-02-COMPAT-01: translateLegacyBytebotToolNames is exported', () => {
		expect(typeof translateLegacyBytebotToolNames).toBe('function')
	})

	it('T-10-02-COMPAT-02: skillVersion=2 → mcp__bytebot__* translates to mcp__luse__*', () => {
		const events = [
			{tool: 'mcp__bytebot__click_mouse', args: {x: 100, y: 100}},
			{tool: 'mcp__bytebot__screenshot', args: {}},
		] as const
		const out = translateLegacyBytebotToolNames(events, 2)
		expect(out).toEqual([
			{tool: 'mcp__luse__click_mouse', args: {x: 100, y: 100}},
			{tool: 'mcp__luse__screenshot', args: {}},
		])
	})

	it('T-10-02-COMPAT-03: skillVersion=3 (post-rename) → events pass through unchanged', () => {
		const events = [
			{tool: 'mcp__bytebot__click_mouse', args: {x: 100, y: 100}},
			{tool: 'mcp__bytebot__screenshot', args: {}},
		] as const
		const out = translateLegacyBytebotToolNames(events, 3)
		// No double-translation; legacy literals preserved verbatim at v3+.
		expect(out).toEqual([
			{tool: 'mcp__bytebot__click_mouse', args: {x: 100, y: 100}},
			{tool: 'mcp__bytebot__screenshot', args: {}},
		])
	})
})
