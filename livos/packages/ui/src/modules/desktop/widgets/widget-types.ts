// ── Widget Size System ───────────────────────────────────

export type WidgetSize = 'small' | 'medium' | 'large'

export const WIDGET_SIZES: Record<WidgetSize, {colSpan: number; rowSpan: number; label: string}> = {
	small: {colSpan: 2, rowSpan: 2, label: 'Small (2x2)'},
	medium: {colSpan: 4, rowSpan: 2, label: 'Medium (4x2)'},
	large: {colSpan: 4, rowSpan: 4, label: 'Large (4x4)'},
}

// ── Widget Type Catalog ──────────────────────────────────

export type WidgetType =
	| 'clock'
	| 'system-info-compact'
	| 'system-info-detailed'
	| 'quick-notes'
	| 'app-status'
	| 'top-apps'

export interface WidgetVariant {
	key: string
	label: string
	configPatch: Record<string, unknown>
}

export interface WidgetCatalogEntry {
	type: WidgetType
	name: string
	description: string
	icon: string
	size: WidgetSize
	variants?: WidgetVariant[]
}

export const WIDGET_CATALOG: WidgetCatalogEntry[] = [
	{
		type: 'clock',
		name: 'Clock',
		description: 'Digital or analog clock',
		icon: '🕐',
		size: 'small',
		variants: [
			{key: 'digital', label: 'Digital', configPatch: {mode: 'digital'}},
			{key: 'analog', label: 'Analog', configPatch: {mode: 'analog'}},
		],
	},
	{
		type: 'system-info-compact',
		name: 'System Info',
		description: 'CPU, RAM, Disk usage bars',
		icon: '📊',
		size: 'small',
	},
	{
		type: 'system-info-detailed',
		name: 'System Detailed',
		description: 'Circular gauges + temperature',
		icon: '🔬',
		size: 'medium',
	},
	{
		type: 'quick-notes',
		name: 'Quick Notes',
		description: 'Editable notepad with auto-save',
		icon: '📝',
		size: 'large',
	},
	{
		type: 'app-status',
		name: 'App Status',
		description: 'Docker container states',
		icon: '🐳',
		size: 'medium',
	},
	{
		type: 'top-apps',
		name: 'Top Apps',
		description: 'Most resource-heavy apps',
		icon: '⚡',
		size: 'small',
	},
]

// ── Widget Instance Metadata ─────────────────────────────

export interface WidgetMeta {
	id: string
	type: WidgetType
	config?: Record<string, unknown>
}

// ── Helpers ──────────────────────────────────────────────

export function createWidgetId(type: WidgetType): string {
	return `widget-${type}-${crypto.randomUUID().slice(0, 8)}`
}

export function getWidgetSize(type: WidgetType): {colSpan: number; rowSpan: number} {
	const entry = WIDGET_CATALOG.find((w) => w.type === type)
	if (!entry) return {colSpan: 2, rowSpan: 2}
	return WIDGET_SIZES[entry.size]
}

export function getWidgetCatalogEntry(type: WidgetType): WidgetCatalogEntry | undefined {
	return WIDGET_CATALOG.find((w) => w.type === type)
}
