// @vitest-environment jsdom
//
// Phase 267-04 — agent-logos.tsx render + lookup contract.
//
// Per LivOS UI testing precedent (model-picker.test.tsx, D-NO-NEW-DEPS), the
// UI package does NOT ship @testing-library — tests use direct
// react-dom/client mounts + DOM queries.
//
// Locks the two truths from the plan's must_haves:
//   • a known backend (e.g. claude) renders a brand <img> (NOT a broken image)
//   • an unknown backend renders a deterministic monogram (NOT a broken <img>)

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

import {AGENT_LOGOS, AgentLogo, agentLogoFor} from './agent-logos'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
})

afterEach(() => {
	act(() => {
		root.unmount()
	})
	container.remove()
})

describe('AGENT_LOGOS map (Phase 267-04)', () => {
	it('keys each shipped brand by BOTH backend short-name and CliName', () => {
		// backend short-name + CliName resolve the same asset
		expect(AGENT_LOGOS['claude'].src).toBe(AGENT_LOGOS['claude-code'].src)
		expect(AGENT_LOGOS['cursor'].src).toBe(AGENT_LOGOS['cursor-agent'].src)
		expect(AGENT_LOGOS['qwen'].src).toBe(AGENT_LOGOS['qwen-code'].src)
		expect(AGENT_LOGOS['kimi'].src).toBe(AGENT_LOGOS['kimi-cli'].src)
	})

	it('ships a brand asset for each of the plan-required common CLIs', () => {
		for (const key of [
			'claude',
			'gemini',
			'opencode',
			'cursor',
			'codex',
			'qwen',
			'copilot',
			'kimi',
		]) {
			expect(AGENT_LOGOS[key], `expected an entry for ${key}`).toBeDefined()
			expect(AGENT_LOGOS[key].src, `expected a brand asset src for ${key}`).toMatch(
				/^\/agent-logos\/.+\.svg$/,
			)
		}
	})

	it('every map entry carries a label + brandColor (monogram fallback inputs)', () => {
		for (const [k, v] of Object.entries(AGENT_LOGOS)) {
			expect(v.label, `label for ${k}`).toBeTruthy()
			expect(v.brandColor, `brandColor for ${k}`).toMatch(/^#[0-9A-Fa-f]{6}$/)
		}
	})
})

describe('agentLogoFor() (Phase 267-04)', () => {
	it('resolves a known key', () => {
		expect(agentLogoFor('claude').src).toBe('/agent-logos/claude.svg')
	})

	it('normalises case/whitespace', () => {
		expect(agentLogoFor('  CLAUDE  ').src).toBe('/agent-logos/claude.svg')
	})

	it('synthesises a monogram-only entry for an unknown key (no src, slate)', () => {
		const e = agentLogoFor('totally-unknown-cli')
		expect(e.src).toBeUndefined()
		expect(e.label).toBe('totally-unknown-cli')
		expect(e.brandColor).toMatch(/^#[0-9A-Fa-f]{6}$/)
	})
})

describe('<AgentLogo /> (Phase 267-04)', () => {
	it('renders a brand <img> for a known backend (claude)', () => {
		act(() => {
			root.render(<AgentLogo backend='claude' />)
		})
		const img = container.querySelector('img[data-agent-logo="asset"]') as HTMLImageElement
		expect(img).not.toBeNull()
		expect(img.getAttribute('src')).toBe('/agent-logos/claude.svg')
		expect(img.getAttribute('alt')).toBe('Claude Code')
		// must NOT render a monogram in parallel
		expect(container.querySelector('[data-agent-logo="monogram"]')).toBeNull()
	})

	it('resolves by CliName too (cursor-agent → cursor asset)', () => {
		act(() => {
			root.render(<AgentLogo name='cursor-agent' />)
		})
		const img = container.querySelector('img[data-agent-logo="asset"]') as HTMLImageElement
		expect(img).not.toBeNull()
		expect(img.getAttribute('src')).toBe('/agent-logos/cursor.svg')
	})

	it('renders a deterministic monogram for an unknown backend (no broken img)', () => {
		act(() => {
			root.render(<AgentLogo backend='unknown' />)
		})
		// NO <img> at all → cannot be a broken image
		expect(container.querySelector('img')).toBeNull()
		const mono = container.querySelector('[data-agent-logo="monogram"]') as HTMLElement
		expect(mono).not.toBeNull()
		expect(mono.textContent).toBe('U') // first letter of "unknown", uppercased
		expect(mono.getAttribute('aria-label')).toBe('unknown')
	})

	it('renders a monogram for a map entry that has no asset (aion-cli)', () => {
		act(() => {
			root.render(<AgentLogo name='aion-cli' />)
		})
		expect(container.querySelector('img')).toBeNull()
		const mono = container.querySelector('[data-agent-logo="monogram"]') as HTMLElement
		expect(mono).not.toBeNull()
		expect(mono.getAttribute('aria-label')).toBe('Aion CLI')
		expect(mono.textContent).toBe('A')
	})
})
