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
	// Phase 345-02 (WIDG-01, D-345-3): a single ADDITIVE renderer type for
	// manifest-declared app widgets. It is deliberately NOT added to
	// WIDGET_CATALOG (the static 6-built-in catalog stays byte-identical) —
	// app widgets are sourced from apps.list, and the concrete template
	// (text-with-progress | three-stats | key-value | list) is decided at
	// render time from the live widget.data payload, not from this catalog.
	| 'app-widget'

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
	// Phase 345-02: only set on `type: 'app-widget'` instances. The System A
	// composite widget id `${appId}:${widgetId}` passed to widget.enable /
	// widget.data; `title` is the manifest-declared label shown in the header.
	appWidgetId?: string
	title?: string
}

// ── Helpers ──────────────────────────────────────────────

export function createWidgetId(type: WidgetType): string {
	return `widget-${type}-${crypto.randomUUID().slice(0, 8)}`
}

// Phase 345-02 (WIDG-01, D-345-3): build a WidgetMeta for a manifest-declared
// app widget. `appWidgetId` is the System A `${appId}:${widgetId}` composite the
// backend router splits (splitWidgetId) and ownership-gates.
export function createAppWidgetMeta(appWidgetId: string, title?: string): WidgetMeta {
	return {id: createWidgetId('app-widget'), type: 'app-widget', appWidgetId, title}
}

export function getWidgetSize(type: WidgetType): {colSpan: number; rowSpan: number} {
	// Phase 345-02: app widgets are not in the static catalog; give them a
	// medium footprint (the typed templates read better than the 2x2 default).
	if (type === 'app-widget') return WIDGET_SIZES.medium
	const entry = WIDGET_CATALOG.find((w) => w.type === type)
	if (!entry) return {colSpan: 2, rowSpan: 2}
	return WIDGET_SIZES[entry.size]
}

export function getWidgetCatalogEntry(type: WidgetType): WidgetCatalogEntry | undefined {
	return WIDGET_CATALOG.find((w) => w.type === type)
}
