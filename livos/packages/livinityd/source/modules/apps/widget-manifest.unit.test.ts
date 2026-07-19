// livos/packages/livinityd/source/modules/apps/widget-manifest.unit.test.ts
// Phase 345-01 (WIDG-01, D-345-1) — the typed app-widget contract. OFFLINE unit
// test (pure zod, no I/O). Proves: the author manifest entry types; the four
// renderable runtime templates parse; chart/arbitrary types are REJECTED; the
// key-value cap holds so a huge payload cannot balloon.
import {describe, it, expect} from 'vitest'
import {
	WidgetManifestEntrySchema,
	WidgetDataSchema,
	isWidgetData,
	KEY_VALUE_MAX_ITEMS,
} from './widget-manifest.js'

describe('WidgetManifestEntrySchema (author-declared manifest entry)', () => {
	it('parses a minimal {id, endpoint} entry', () => {
		const r = WidgetManifestEntrySchema.safeParse({id: 'status', endpoint: 'web:8080/widget'})
		expect(r.success).toBe(true)
	})

	it('parses an entry with optional label/title and preserves extra author fields', () => {
		const r = WidgetManifestEntrySchema.safeParse({
			id: 'status',
			endpoint: 'web:8080/widget',
			label: 'Status',
			title: 'Downloads',
			extra: 'kept',
		})
		expect(r.success).toBe(true)
		if (r.success) expect((r.data as any).extra).toBe('kept')
	})

	it('REJECTS an entry missing id', () => {
		const r = WidgetManifestEntrySchema.safeParse({endpoint: 'web:8080/widget'})
		expect(r.success).toBe(false)
	})

	it('REJECTS an entry missing endpoint', () => {
		const r = WidgetManifestEntrySchema.safeParse({id: 'status'})
		expect(r.success).toBe(false)
	})
})

describe('WidgetDataSchema (runtime renderable templates)', () => {
	it('parses type:text-with-progress (the storage/memory built-in shape)', () => {
		const r = WidgetDataSchema.safeParse({
			type: 'text-with-progress',
			link: '?dialog=live-usage&tab=storage',
			refresh: '30s',
			title: 'Storage',
			text: '10 GB',
			subtext: '/ 100 GB',
			progressLabel: '90 GB left',
			progress: '0.10',
		})
		expect(r.success).toBe(true)
	})

	it('parses type:three-stats (the system-stats built-in shape)', () => {
		const r = WidgetDataSchema.safeParse({
			type: 'three-stats',
			link: '?dialog=live-usage',
			refresh: '10s',
			items: [
				{icon: 'system-widget-cpu', subtext: 'CPU', text: '12%'},
				{icon: 'system-widget-memory', subtext: 'Memory', text: '2 GB'},
			],
		})
		expect(r.success).toBe(true)
	})

	it('parses type:key-value (bounded label→value list)', () => {
		const r = WidgetDataSchema.safeParse({
			type: 'key-value',
			refresh: '15s',
			items: [
				{label: 'Peers', value: 12},
				{label: 'Ratio', value: '1.42'},
			],
		})
		expect(r.success).toBe(true)
	})

	it('parses type:list', () => {
		const r = WidgetDataSchema.safeParse({
			type: 'list',
			refresh: '5s',
			items: [{text: 'file-a.txt', subtext: '2 MB'}, {text: 'file-b.txt'}],
			noItemsText: 'No items',
		})
		expect(r.success).toBe(true)
	})

	it('REJECTS type:chart (chart is DEFERRED — no charting lib, D-345-1)', () => {
		const r = WidgetDataSchema.safeParse({type: 'chart', points: [1, 2, 3]})
		expect(r.success).toBe(false)
	})

	it('has NO chart member in the discriminated union', () => {
		const types = WidgetDataSchema.options.map((o) => o.shape.type.value)
		expect(types).toEqual(['text-with-progress', 'three-stats', 'key-value', 'list'])
		expect(types).not.toContain('chart')
	})

	it('REJECTS an arbitrary/unknown type', () => {
		const r = WidgetDataSchema.safeParse({type: 'arbitrary', foo: 'bar'})
		expect(r.success).toBe(false)
	})

	it('REJECTS a key-value payload over the items cap (anti-balloon)', () => {
		const items = Array.from({length: KEY_VALUE_MAX_ITEMS + 1}, (_, i) => ({
			label: `k${i}`,
			value: i,
		}))
		const r = WidgetDataSchema.safeParse({type: 'key-value', items})
		expect(r.success).toBe(false)
	})

	it('accepts a key-value payload exactly at the items cap', () => {
		const items = Array.from({length: KEY_VALUE_MAX_ITEMS}, (_, i) => ({label: `k${i}`, value: i}))
		const r = WidgetDataSchema.safeParse({type: 'key-value', items})
		expect(r.success).toBe(true)
	})

	it('isWidgetData is a correct type guard (true for valid, false for malformed)', () => {
		expect(isWidgetData({type: 'text-with-progress', text: 'x'})).toBe(true)
		expect(isWidgetData({type: 'chart'})).toBe(false)
		expect(isWidgetData({progress: 'not-a-number'})).toBe(false)
		expect(isWidgetData(null)).toBe(false)
	})
})
