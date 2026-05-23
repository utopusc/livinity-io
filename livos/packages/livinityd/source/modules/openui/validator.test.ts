/**
 * Phase 203-04 — OpenUI Lang whitelist validator unit tests.
 *
 * Verifies T-203-03 enforcement:
 *   - all 14 whitelisted components accepted
 *   - components NOT in the whitelist rejected with OPENUI_DISALLOWED_COMPONENT
 *   - image.props.src + link.props.href URL guard rejects every dangerous
 *     scheme (javascript:, vbscript:, file:, data:text/html, about:)
 *   - plain http:// rejected (forces secure context)
 *   - data:image/png allowed for image.src; rejected for link.href
 *   - dangerouslySetInnerHTML anywhere in tree → OPENUI_RAW_HTML
 *   - deeply nested valid tree accepted
 *   - first failure short-circuits (returns immediately)
 */

import {describe, expect, test} from 'vitest'

import {
	OPENUI_ALLOWED_COMPONENTS,
	isSafeUrl,
	validateOpenUITree,
} from './validator.js'

describe('isSafeUrl', () => {
	test('accepts https://', () => {
		expect(isSafeUrl('https://example.com/a')).toBe(true)
	})
	test('accepts protocol-relative //', () => {
		expect(isSafeUrl('//cdn.example.com/a.png')).toBe(true)
	})
	test('accepts root-relative /', () => {
		expect(isSafeUrl('/liv-ai-app/icons/foo.svg')).toBe(true)
	})
	test('accepts fragment #', () => {
		expect(isSafeUrl('#anchor')).toBe(true)
	})
	test('rejects http:// (forces TLS)', () => {
		expect(isSafeUrl('http://example.com')).toBe(false)
	})
	test('rejects javascript: scheme', () => {
		expect(isSafeUrl('javascript:alert(1)')).toBe(false)
	})
	test('rejects vbscript: scheme', () => {
		expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false)
	})
	test('rejects file: scheme', () => {
		expect(isSafeUrl('file:///etc/passwd')).toBe(false)
	})
	test('rejects about: scheme', () => {
		expect(isSafeUrl('about:blank')).toBe(false)
	})
	test('rejects data:text/html', () => {
		expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
	})
	test('accepts data:image/png ONLY when allowDataImage:true', () => {
		const url = 'data:image/png;base64,AAAA'
		expect(isSafeUrl(url)).toBe(false)
		expect(isSafeUrl(url, {allowDataImage: true})).toBe(true)
	})
	test('rejects empty / non-string', () => {
		expect(isSafeUrl('')).toBe(false)
		expect(isSafeUrl(undefined)).toBe(false)
		expect(isSafeUrl(123)).toBe(false)
		expect(isSafeUrl(null)).toBe(false)
	})
})

describe('validateOpenUITree — whitelist enforcement', () => {
	test('14-entry allow-list matches the renderer source of truth', () => {
		expect(OPENUI_ALLOWED_COMPONENTS).toHaveLength(14)
	})

	test('every whitelisted component is accepted', () => {
		for (const name of OPENUI_ALLOWED_COMPONENTS) {
			const tree = {type: name, props: {}, children: []}
			expect(validateOpenUITree(tree).ok).toBe(true)
		}
	})

	test('unknown component rejected', () => {
		const tree = {type: 'script', props: {}}
		const r = validateOpenUITree(tree)
		expect(r.ok).toBe(false)
		if (!r.ok) {
			expect(r.reason).toMatch(/^OPENUI_DISALLOWED_COMPONENT:script$/)
		}
	})

	test('unknown component nested deep rejected', () => {
		const tree = {
			type: 'card',
			props: {},
			children: [
				{
					type: 'layout-stack',
					children: [{type: 'iframe', props: {src: 'evil'}}],
				},
			],
		}
		const r = validateOpenUITree(tree)
		expect(r.ok).toBe(false)
		if (!r.ok) {
			expect(r.reason).toContain('iframe')
		}
	})

	test('image.src must be safe', () => {
		const r = validateOpenUITree({
			type: 'image',
			props: {src: 'javascript:alert(1)'},
		})
		expect(r.ok).toBe(false)
		if (!r.ok) expect(r.reason).toBe('OPENUI_UNSAFE_URL:image.src')
	})

	test('image.src data:image/* allowed', () => {
		const r = validateOpenUITree({
			type: 'image',
			props: {src: 'data:image/png;base64,AAAA'},
		})
		expect(r.ok).toBe(true)
	})

	test('link.href must be safe', () => {
		const r = validateOpenUITree({
			type: 'link',
			props: {href: 'javascript:void(0)'},
		})
		expect(r.ok).toBe(false)
		if (!r.ok) expect(r.reason).toBe('OPENUI_UNSAFE_URL:link.href')
	})

	test('link.href data:image rejected (only image.src allows it)', () => {
		const r = validateOpenUITree({
			type: 'link',
			props: {href: 'data:image/png;base64,AAAA'},
		})
		expect(r.ok).toBe(false)
	})

	test('dangerouslySetInnerHTML anywhere rejected', () => {
		const tree = {
			type: 'card',
			props: {
				dangerouslySetInnerHTML: {__html: '<script>alert(1)</script>'},
			},
		}
		const r = validateOpenUITree(tree)
		expect(r.ok).toBe(false)
		if (!r.ok) expect(r.reason).toBe('OPENUI_RAW_HTML')
	})

	test('deeply nested valid tree accepted', () => {
		const tree = {
			type: 'layout-stack',
			props: {gap: 2},
			children: [
				{type: 'heading', props: {level: 1, text: 'Hello'}},
				{
					type: 'card',
					props: {title: 'Card'},
					children: [
						{
							type: 'layout-row',
							props: {gap: 1},
							children: [
								{type: 'text', props: {text: 'a'}},
								{
									type: 'link',
									props: {href: 'https://example.com', text: 'go'},
								},
								{
									type: 'image',
									props: {src: '/liv-ai-app/icons/x.svg', alt: 'x'},
								},
							],
						},
						{
							type: 'table',
							props: {columns: ['a', 'b'], rows: [['1', '2']]},
						},
					],
				},
				{type: 'divider'},
				{
					type: 'list',
					props: {variant: 'unordered'},
					children: [
						{type: 'text', props: {text: 'one'}},
						{type: 'text', props: {text: 'two'}},
					],
				},
				{type: 'badge', props: {text: 'beta', tone: 'info'}},
				{type: 'input', props: {label: 'Name', value: 'a'}},
				{type: 'button', props: {label: 'Go'}},
			],
		}
		const r = validateOpenUITree(tree)
		expect(r.ok).toBe(true)
	})

	test('arrays of nodes are walked', () => {
		const trees = [
			{type: 'text', props: {text: 'ok'}},
			{type: 'evil-component'},
		]
		const r = validateOpenUITree(trees)
		expect(r.ok).toBe(false)
		if (!r.ok) expect(r.reason).toContain('evil-component')
	})

	test('null / undefined / primitives are accepted (leaf children)', () => {
		expect(validateOpenUITree(null).ok).toBe(true)
		expect(validateOpenUITree(undefined).ok).toBe(true)
		expect(validateOpenUITree('string').ok).toBe(true)
		expect(validateOpenUITree(42).ok).toBe(true)
		expect(validateOpenUITree(true).ok).toBe(true)
	})

	test('uses `name` shape too (LLM emits either `type` or `name`)', () => {
		const tree = {name: 'card', props: {}}
		expect(validateOpenUITree(tree).ok).toBe(true)
		const bad = {name: 'iframe', props: {}}
		const r = validateOpenUITree(bad)
		expect(r.ok).toBe(false)
		if (!r.ok) expect(r.reason).toContain('iframe')
	})
})
