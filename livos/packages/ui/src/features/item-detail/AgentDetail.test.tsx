// @vitest-environment jsdom
//
// Phase 175-04 — AgentDetail behaviour tests (12 assertions B-04-1..B-04-12).
// Phase 177-04 — Inbox tRPC wiring tests (T-UI-05..T-UI-08).
//
// Pattern mirrors ProjectDetail.test.tsx (175-03) / AddItemModal.test.tsx
// (175-01/02): createRoot + act mount, no @testing-library. Streamdown is
// mocked because the real renderer pulls in remark/rehype overkill.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ── Phase 177-04: tRPC mock for vault.inbox.* ─────────────────────────────
// Hoisted so vi.mock factory can capture it before any imports.
const trpcInboxMock = vi.hoisted(() => {
	const markReadMutate = vi.fn()
	const listByAgentRefetch = vi.fn()
	return {
		markReadMutate,
		listByAgentRefetch,
		listByAgentData: [] as Array<{
			id: string
			agentId: string
			runId: string
			runAt: string
			triggeredBy: 'cron' | 'manual'
			durationMs: number
			status: 'success' | 'failed'
			read: boolean
			filePath: string
		}>,
	}
})

vi.mock('@/trpc/trpc', () => ({
	trpcReact: {
		vault: {
			inbox: {
				listByAgent: {
					useQuery: vi.fn(() => ({
						data: {entries: trpcInboxMock.listByAgentData},
						isLoading: false,
						refetch: trpcInboxMock.listByAgentRefetch,
					})),
				},
				markRead: {
					useMutation: vi.fn(() => ({
						mutate: trpcInboxMock.markReadMutate,
						isPending: false,
					})),
				},
			},
		},
	},
}))

vi.mock('streamdown', () => ({
	Streamdown: (props: {children?: string; content?: string}) => (
		<div data-testid='streamdown-stub'>{props.children ?? props.content ?? ''}</div>
	),
	default: (props: {children?: string; content?: string}) => (
		<div data-testid='streamdown-stub'>{props.children ?? props.content ?? ''}</div>
	),
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
})

afterEach(() => {
	try {
		act(() => root.unmount())
	} catch {
		/* noop */
	}
	container.remove()
})

import {AgentDetail} from './AgentDetail'

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, val: string) {
	const proto =
		input instanceof HTMLTextAreaElement
			? HTMLTextAreaElement.prototype
			: HTMLInputElement.prototype
	const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
	nativeSetter.call(input, val)
	input.dispatchEvent(new Event('input', {bubbles: true}))
	input.dispatchEvent(new Event('change', {bubbles: true}))
}

describe('AgentDetail — Phase 175-04', () => {
	it('B-04-1: renders item.name + Bot lucide icon', () => {
		act(() => {
			root.render(<AgentDetail item={{id: 'a1', name: 'My Agent'}} />)
		})
		expect(container.textContent).toContain('My Agent')
		expect(container.querySelector('.lucide-bot')).not.toBeNull()
	})

	it('B-04-2: system prompt textarea — value + onPromptChange', () => {
		const onPromptChange = vi.fn()
		act(() => {
			root.render(
				<AgentDetail
					item={{id: 'a1', name: 'A'}}
					systemPrompt='hello'
					onPromptChange={onPromptChange}
				/>,
			)
		})
		const ta = container.querySelector(
			'[data-testid="prompt-textarea"]',
		) as HTMLTextAreaElement
		expect(ta).not.toBeNull()
		expect(ta.value).toBe('hello')
		act(() => {
			setInputValue(ta, 'new prompt')
		})
		expect(onPromptChange).toHaveBeenCalledTimes(1)
		expect(onPromptChange).toHaveBeenCalledWith('new prompt')
	})

	it('B-04-3: switching to Preview tab hides textarea + shows preview', () => {
		act(() => {
			root.render(<AgentDetail item={{id: 'a1', name: 'A'}} systemPrompt='hello' />)
		})
		expect(container.querySelector('[data-testid="prompt-textarea"]')).not.toBeNull()
		const previewTab = container.querySelector(
			'[data-testid="prompt-tab-preview"]',
		) as HTMLElement
		expect(previewTab).not.toBeNull()
		act(() => {
			previewTab.click()
		})
		expect(container.querySelector('[data-testid="prompt-textarea"]')).toBeNull()
		expect(container.querySelector('[data-testid="prompt-preview"]')).not.toBeNull()
	})

	it('B-04-4: switching back to Edit tab restores textarea + hides preview', () => {
		act(() => {
			root.render(<AgentDetail item={{id: 'a1', name: 'A'}} systemPrompt='hello' />)
		})
		act(() => {
			;(
				container.querySelector('[data-testid="prompt-tab-preview"]') as HTMLElement
			).click()
		})
		act(() => {
			;(
				container.querySelector('[data-testid="prompt-tab-edit"]') as HTMLElement
			).click()
		})
		expect(container.querySelector('[data-testid="prompt-textarea"]')).not.toBeNull()
		expect(container.querySelector('[data-testid="prompt-preview"]')).toBeNull()
	})

	it('B-04-5: tools list renders one row per tool with correct checkbox state', () => {
		act(() => {
			root.render(
				<AgentDetail
					item={{id: 'a1', name: 'A'}}
					tools={[
						{name: 'bash', enabled: true},
						{name: 'edit', enabled: false},
					]}
				/>,
			)
		})
		const list = container.querySelector('[data-testid="tools-list"]')
		expect(list).not.toBeNull()
		expect(container.querySelectorAll('[data-testid^="tool-row-"]').length).toBe(2)
		const bashCb = container.querySelector(
			'[data-testid="tool-row-bash"] input[type="checkbox"]',
		) as HTMLInputElement
		const editCb = container.querySelector(
			'[data-testid="tool-row-edit"] input[type="checkbox"]',
		) as HTMLInputElement
		expect(bashCb.checked).toBe(true)
		expect(editCb.checked).toBe(false)
	})

	it('B-04-6: clicking bash checkbox invokes onToolToggle("bash", false)', () => {
		const onToolToggle = vi.fn()
		act(() => {
			root.render(
				<AgentDetail
					item={{id: 'a1', name: 'A'}}
					tools={[{name: 'bash', enabled: true}]}
					onToolToggle={onToolToggle}
				/>,
			)
		})
		const cb = container.querySelector(
			'[data-testid="tool-row-bash"] input[type="checkbox"]',
		) as HTMLInputElement
		act(() => {
			cb.click()
		})
		expect(onToolToggle).toHaveBeenCalledTimes(1)
		expect(onToolToggle).toHaveBeenCalledWith('bash', false)
	})

	it('B-04-7: tools empty — shows empty-state testid', () => {
		act(() => {
			root.render(<AgentDetail item={{id: 'a1', name: 'A'}} tools={[]} />)
		})
		expect(container.querySelector('[data-testid="tools-empty"]')).not.toBeNull()
		expect(container.querySelectorAll('[data-testid^="tool-row-"]').length).toBe(0)
	})

	it('B-04-8: MCP servers list renders + empty-state', () => {
		act(() => {
			root.render(
				<AgentDetail item={{id: 'a1', name: 'A'}} mcpServers={['ctx7', 'filesystem']} />,
			)
		})
		expect(container.querySelector('[data-testid="mcp-row-ctx7"]')).not.toBeNull()
		expect(container.querySelector('[data-testid="mcp-row-filesystem"]')).not.toBeNull()

		act(() => {
			root.render(<AgentDetail item={{id: 'a1', name: 'A'}} mcpServers={[]} />)
		})
		expect(container.querySelector('[data-testid="mcp-empty"]')).not.toBeNull()
	})

	it('B-04-9: schedule input value + Pause + Run Now buttons fire callbacks', () => {
		const onPause = vi.fn()
		const onRunNow = vi.fn()
		act(() => {
			root.render(
				<AgentDetail
					item={{id: 'a1', name: 'A'}}
					schedule='0 9 * * *'
					onPause={onPause}
					onRunNow={onRunNow}
				/>,
			)
		})
		const inp = container.querySelector(
			'[data-testid="schedule-input"]',
		) as HTMLInputElement
		expect(inp.value).toBe('0 9 * * *')
		const pause = container.querySelector('[data-testid="pause-btn"]') as HTMLElement
		const run = container.querySelector('[data-testid="run-now-btn"]') as HTMLElement
		act(() => {
			pause.click()
		})
		act(() => {
			run.click()
		})
		expect(onPause).toHaveBeenCalledTimes(1)
		expect(onRunNow).toHaveBeenCalledTimes(1)
	})

	it('B-04-10: inbox preview shows empty-state when no tRPC data', () => {
		// tRPC mock returns [] by default (listByAgentData=[])
		act(() => {
			root.render(<AgentDetail item={{id: 'a1', name: 'A'}} />)
		})
		expect(container.querySelector('[data-testid="inbox-empty"]')).not.toBeNull()
	})

	it('B-04-11: inbox empty-state visible when tRPC returns empty array', () => {
		act(() => {
			root.render(<AgentDetail item={{id: 'a1', name: 'A'}} />)
		})
		expect(container.querySelector('[data-testid="inbox-empty"]')).not.toBeNull()
		expect(container.querySelectorAll('[data-testid^="inbox-row-"]').length).toBe(0)
	})

	it('B-04-12: last-run link + source-text invariants', () => {
		const onOpenLastRunLog = vi.fn()
		act(() => {
			root.render(
				<AgentDetail
					item={{id: 'a1', name: 'A'}}
					lastRunLogPath='/path/to/log.txt'
					onOpenLastRunLog={onOpenLastRunLog}
				/>,
			)
		})
		const link = container.querySelector(
			'[data-testid="last-run-link"]',
		) as HTMLElement
		expect(link).not.toBeNull()
		act(() => {
			link.click()
		})
		expect(onOpenLastRunLog).toHaveBeenCalledTimes(1)
		expect(onOpenLastRunLog).toHaveBeenCalledWith('/path/to/log.txt')

		// Hidden when no path.
		act(() => {
			root.render(<AgentDetail item={{id: 'a1', name: 'A'}} />)
		})
		expect(container.querySelector('[data-testid="last-run-link"]')).toBeNull()

		// Source-text invariants.
		const src = readFileSync(resolve(__dirname, 'AgentDetail.tsx'), 'utf8')
		expect(src).toMatch(/from 'lucide-react'/)
		expect(src).toMatch(/Bot/)
		expect(src).toMatch(/from 'streamdown'/)
		expect(src).toMatch(/onPromptChange/)
	})
})

// ── Phase 177-04: inbox tRPC wire tests (T-UI-05..T-UI-08) ───────────────────

function makeInboxEntry(overrides?: Partial<{
	id: string
	agentId: string
	runId: string
	runAt: string
	triggeredBy: 'cron' | 'manual'
	durationMs: number
	status: 'success' | 'failed'
	read: boolean
	filePath: string
}>) {
	return {
		id: 'agent-1/run-abc',
		agentId: 'agent-1',
		runId: 'run-abc',
		runAt: '2024-01-03T10:00:00.000Z',
		triggeredBy: 'cron' as const,
		durationMs: 5000,
		status: 'success' as const,
		read: false,
		filePath: '/root/liv/items/agent-1/inbox/run-abc.md',
		...overrides,
	}
}

describe('AgentDetail — Phase 177-04 inbox tRPC wiring', () => {
	beforeEach(() => {
		// Reset mock data before each test
		trpcInboxMock.listByAgentData.length = 0
		vi.clearAllMocks()
	})

	it('T-UI-05: when listByAgent.useQuery returns 2 entries, renders 2 inbox-row- elements', () => {
		trpcInboxMock.listByAgentData.push(
			makeInboxEntry({id: 'agent-1/run-1', runId: 'run-1'}),
			makeInboxEntry({id: 'agent-1/run-2', runId: 'run-2'}),
		)
		act(() => {
			root.render(<AgentDetail item={{id: 'agent-1', name: 'A'}} />)
		})
		expect(container.querySelector('[data-testid="inbox-preview"]')).not.toBeNull()
		expect(container.querySelectorAll('[data-testid^="inbox-row-"]').length).toBe(2)
	})

	it('T-UI-06: when listByAgent returns [], renders [data-testid="inbox-empty"]', () => {
		// listByAgentData is already [] (cleared in beforeEach)
		act(() => {
			root.render(<AgentDetail item={{id: 'agent-1', name: 'A'}} />)
		})
		expect(container.querySelector('[data-testid="inbox-empty"]')).not.toBeNull()
	})

	it('T-UI-07: clicking an inbox-row calls markRead.mutate with the entry filePath', () => {
		trpcInboxMock.listByAgentData.push(
			makeInboxEntry({id: 'agent-1/run-abc', runId: 'run-abc'}),
		)
		act(() => {
			root.render(<AgentDetail item={{id: 'agent-1', name: 'A'}} />)
		})
		const row = container.querySelector('[data-testid="inbox-row-agent-1/run-abc"]') as HTMLElement
		expect(row).not.toBeNull()
		act(() => {
			row.click()
		})
		expect(trpcInboxMock.markReadMutate).toHaveBeenCalledWith(
			{filePath: '/root/liv/items/agent-1/inbox/run-abc.md'},
			expect.any(Object),
		)
	})

	it('T-UI-08: clicking Run Now calls onRunNow AND refetches inbox', () => {
		const onRunNow = vi.fn()
		act(() => {
			root.render(
				<AgentDetail
					item={{id: 'agent-1', name: 'A'}}
					onRunNow={onRunNow}
				/>,
			)
		})
		const btn = container.querySelector('[data-testid="run-now-btn"]') as HTMLElement
		act(() => {
			btn.click()
		})
		expect(onRunNow).toHaveBeenCalledTimes(1)
		expect(trpcInboxMock.listByAgentRefetch).toHaveBeenCalledTimes(1)
	})
})
