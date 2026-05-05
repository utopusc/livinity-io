import {describe, it, expect, vi, beforeEach} from 'vitest'

// Mock file-saver BEFORE importing the module under test.
vi.mock('file-saver', () => ({
	saveAs: vi.fn(),
}))

import {saveAs} from 'file-saver'

import {
	buildJSON,
	buildMarkdown,
	exportToJSON,
	exportToMarkdown,
	safeFilename,
	type ConversationData,
} from './export-conversation'

const sampleConv: ConversationData = {
	id: 'c1',
	title: 'Test "chat"!',
	createdAt: '2026-05-04T12:00:00.000Z',
	messages: [
		{role: 'user', content: 'Hello'},
		{role: 'assistant', content: 'Hi there', reasoning: 'They greeted me\nI should reply'},
		{
			role: 'assistant',
			content: 'Done',
			toolCalls: [{name: 'browser-navigate', input: {url: 'https://example.com'}, output: 'Page loaded'}],
		},
	],
}

beforeEach(() => {
	vi.mocked(saveAs).mockClear()
})

describe('safeFilename', () => {
	it('strips unsafe chars (replaces with underscore)', () => {
		expect(safeFilename('Hello "world"/<test>')).toBe('Hello _world___test_')
	})

	it('falls back to "conversation" when input is empty', () => {
		expect(safeFilename('')).toBe('conversation')
	})

	it('returns underscores when all chars are unsafe (regex replaces, does not strip)', () => {
		// Per CONTEXT D-21: regex [^\w\-. ] replaces; '!!!' becomes '___'.
		expect(safeFilename('!!!')).toBe('___')
	})

	it('trims to 64 chars max', () => {
		expect(safeFilename('a'.repeat(100))).toHaveLength(64)
	})

	it('preserves safe chars (alphanumerics, dash, dot, space, underscore)', () => {
		expect(safeFilename('My-Convo_2026.05.04 final')).toBe('My-Convo_2026.05.04 final')
	})
})

describe('buildMarkdown', () => {
	it('starts with title heading', () => {
		const md = buildMarkdown(sampleConv)
		expect(md.startsWith('# Test "chat"!')).toBe(true)
	})

	it('includes message count', () => {
		const md = buildMarkdown(sampleConv)
		expect(md).toContain('· 3 messages')
	})

	it('includes ISO export date in header', () => {
		const md = buildMarkdown(sampleConv)
		expect(md).toContain('Exported 2026-05-04T12:00:00.000Z')
	})

	it('renders correct role labels', () => {
		const md = buildMarkdown(sampleConv)
		expect(md).toContain('## User')
		expect(md).toContain('## Assistant')
	})

	it('renders System and Tool labels when present', () => {
		const conv: ConversationData = {
			id: 'c2',
			title: 'roles',
			createdAt: '2026-05-04T12:00:00.000Z',
			messages: [
				{role: 'system', content: 'sys'},
				{role: 'tool', content: 'tool out'},
			],
		}
		const md = buildMarkdown(conv)
		expect(md).toContain('## System')
		expect(md).toContain('## Tool')
	})

	it('includes reasoning blockquote when reasoning is present', () => {
		const md = buildMarkdown(sampleConv)
		expect(md).toContain('> **Reasoning:**')
		expect(md).toContain('> They greeted me')
		expect(md).toContain('> I should reply')
	})

	it('omits reasoning section when reasoning is null', () => {
		const conv: ConversationData = {
			id: 'c3',
			title: 't',
			createdAt: 0,
			messages: [{role: 'assistant', content: 'X', reasoning: null}],
		}
		const md = buildMarkdown(conv)
		expect(md).not.toContain('**Reasoning:**')
	})

	it('omits reasoning section when reasoning is empty string', () => {
		const conv: ConversationData = {
			id: 'c4',
			title: 't',
			createdAt: 0,
			messages: [{role: 'assistant', content: 'X', reasoning: ''}],
		}
		const md = buildMarkdown(conv)
		expect(md).not.toContain('**Reasoning:**')
	})

	it('renders tool calls as <details> with name and input JSON', () => {
		const md = buildMarkdown(sampleConv)
		expect(md).toContain('<details><summary>Tool: browser-navigate</summary>')
		expect(md).toContain('"url": "https://example.com"')
		expect(md).toContain('</details>')
	})

	it('renders tool call output (string passthrough)', () => {
		const md = buildMarkdown(sampleConv)
		expect(md).toContain('Result:')
		expect(md).toContain('Page loaded')
	})

	it('renders tool call output (object as JSON)', () => {
		const conv: ConversationData = {
			id: 'c5',
			title: 't',
			createdAt: 0,
			messages: [
				{
					role: 'assistant',
					content: 'x',
					toolCalls: [{name: 'fetch', input: {}, output: {ok: true, count: 2}}],
				},
			],
		}
		const md = buildMarkdown(conv)
		expect(md).toContain('"ok": true')
		expect(md).toContain('"count": 2')
	})

	it('omits Result block when toolCall has no output', () => {
		const conv: ConversationData = {
			id: 'c6',
			title: 't',
			createdAt: 0,
			messages: [
				{
					role: 'assistant',
					content: 'x',
					toolCalls: [{name: 'noop', input: {}}],
				},
			],
		}
		const md = buildMarkdown(conv)
		expect(md).not.toContain('Result:')
	})

	it('uses --- separator after header', () => {
		const md = buildMarkdown(sampleConv)
		expect(md).toContain('\n\n---\n\n')
	})
})

describe('buildJSON', () => {
	it('returns parseable pretty-printed JSON (round-trip)', () => {
		const json = buildJSON(sampleConv)
		expect(JSON.parse(json)).toEqual(sampleConv)
	})

	it('uses 2-space indent', () => {
		const json = buildJSON(sampleConv)
		expect(json).toContain('\n  ')
	})
})

describe('exportToMarkdown', () => {
	it('calls saveAs exactly once with .md filename', () => {
		exportToMarkdown(sampleConv)
		expect(saveAs).toHaveBeenCalledTimes(1)
		const call = vi.mocked(saveAs).mock.calls[0]
		expect(call[1]).toBe('Test _chat__.md')
	})

	it('passes a Blob with text/markdown mime type', () => {
		exportToMarkdown(sampleConv)
		const call = vi.mocked(saveAs).mock.calls[0]
		const blob = call[0] as Blob
		expect(blob).toBeInstanceOf(Blob)
		expect(blob.type).toBe('text/markdown;charset=utf-8')
	})
})

describe('exportToJSON', () => {
	it('calls saveAs exactly once with .json filename', () => {
		exportToJSON(sampleConv)
		expect(saveAs).toHaveBeenCalledTimes(1)
		const call = vi.mocked(saveAs).mock.calls[0]
		expect(call[1]).toBe('Test _chat__.json')
	})

	it('passes a Blob with application/json mime type', () => {
		exportToJSON(sampleConv)
		const call = vi.mocked(saveAs).mock.calls[0]
		const blob = call[0] as Blob
		expect(blob).toBeInstanceOf(Blob)
		expect(blob.type).toBe('application/json;charset=utf-8')
	})
})
