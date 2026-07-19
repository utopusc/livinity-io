// livos/packages/livinityd/source/modules/apps/widget-manifest.ts
// Phase 345-01 (WIDG-01, D-345-1) — the ONE typed contract for app widgets,
// replacing the untyped `widgets: z.array(z.any())` manifest field
// (schema.ts). PURE zod module: no I/O, no livinityd import (mirrors the
// public-forbidden.ts / public-access.ts pure-module precedent) so it is
// unit-testable OFFLINE.
//
// TWO schemas live here, at two different trust boundaries:
//
//   1. WidgetManifestEntrySchema — the AUTHOR-declared manifest entry (what the
//      app ships in its manifest). This is what replaces `z.any()` in
//      apps/schema.ts. It carries the `endpoint` System A fetches widget data
//      from (getWidgetData → the app's OWN container IP; pure data, no code
//      exec — verified in 345-CONTEXT).
//
//   2. WidgetDataSchema — the RUNTIME data shape the box serves for an
//      APP-DECLARED widget, the four renderable templates the desktop widget
//      renderer (345-02) will draw: text-with-progress | three-stats |
//      key-value | list. This is the shape the widget.data procedure
//      safeParse-validates a container payload against (W-DataContract) so a
//      misbehaving app container can never push a malformed payload that throws
//      in the UI — bad payloads DEGRADE, never throw.
//
// CHART DEFERRAL (D-345-1): there is deliberately NO 'chart' member in
// WidgetDataSchema. The desktop widget renderer has no charting lib today; a
// sparkline is net-new scope, documented as a follow-up. A payload with
// `type:'chart'` (or any unknown discriminator) is REJECTED by the
// discriminated union → safeParse.success === false → the caller degrades.
//
// BUILT-IN FILES WIDGETS BYPASS THIS UNION (minimal-surface choice): the
// livinity built-ins system-widgets.ts (text-with-progress / three-stats) and
// files/widgets.ts (files-list / files-grid) are FIRST-PARTY, trusted, and emit
// their own shapes. widget.data only safeParse-validates APP-declared widgets
// (appId !== 'livinity'); the built-ins are returned byte-identically without
// passing through WidgetDataSchema. Hence files-list/files-grid are NOT modelled
// here — this union is exactly the FOUR app-renderable templates.

import {z} from 'zod'

/**
 * The documented upper bound on a `key-value` widget's items array. A malicious
 * or misbehaving app container cannot balloon the payload past this cap — the
 * schema rejects an over-length list (safeParse fails → caller degrades).
 */
export const KEY_VALUE_MAX_ITEMS = 12

/** Bounds for the generic `list` widget so a huge payload cannot balloon either. */
export const LIST_MAX_ITEMS = 20

/**
 * The AUTHOR-declared manifest widget entry — the structural replacement for
 * `schema.ts` `widgets: z.array(z.any())`. `id` is the widget name the router
 * looks up (manifest.widgets.find(w => w.id === name)); `endpoint`
 * ("service:port/path") is resolved to the app's own container IP by
 * getWidgetData. Extra author fields are permitted (passthrough) so a richer
 * manifest is not rejected, but `id` + `endpoint` are load-bearing.
 */
export const WidgetManifestEntrySchema = z
	.object({
		id: z.string().min(1),
		endpoint: z.string().min(1),
		label: z.string().optional(),
		title: z.string().optional(),
	})
	.passthrough()
export type WidgetManifestEntry = z.infer<typeof WidgetManifestEntrySchema>

// ── The four renderable RUNTIME data templates (D-345-1) ─────────────────────
// `refresh` is the app-declared human-readable cadence (e.g. "30s"); it is
// validated BEFORE the router converts it to ms, so it is a string here.
// `progress` is accepted as string|number (built-ins emit a toFixed string; an
// app may emit a number) — kept lenient so a valid payload is never rejected on
// a cosmetic type mismatch.

const TextWithProgressSchema = z.object({
	type: z.literal('text-with-progress'),
	link: z.string().optional(),
	refresh: z.string().optional(),
	title: z.string().optional(),
	text: z.string().optional(),
	subtext: z.string().optional(),
	progressLabel: z.string().optional(),
	progress: z.union([z.string(), z.number()]).optional(),
})

const ThreeStatsSchema = z.object({
	type: z.literal('three-stats'),
	link: z.string().optional(),
	refresh: z.string().optional(),
	items: z
		.array(
			z.object({
				icon: z.string().optional(),
				subtext: z.string().optional(),
				text: z.string().optional(),
			}),
		)
		.max(3),
})

const KeyValueSchema = z.object({
	type: z.literal('key-value'),
	link: z.string().optional(),
	refresh: z.string().optional(),
	title: z.string().optional(),
	items: z
		.array(
			z.object({
				label: z.string(),
				value: z.union([z.string(), z.number()]),
			}),
		)
		.max(KEY_VALUE_MAX_ITEMS),
})

const ListSchema = z.object({
	type: z.literal('list'),
	link: z.string().optional(),
	refresh: z.string().optional(),
	title: z.string().optional(),
	items: z
		.array(
			z.object({
				text: z.string().optional(),
				subtext: z.string().optional(),
				icon: z.string().optional(),
			}),
		)
		.max(LIST_MAX_ITEMS),
	noItemsText: z.string().optional(),
})

/**
 * The RUNTIME app-widget data contract — exactly the four renderable templates,
 * NO 'chart' (deferred, D-345-1). A payload whose `type` is not one of these
 * (e.g. 'chart', 'arbitrary') is rejected: `safeParse(...).success === false`.
 */
export const WidgetDataSchema = z.discriminatedUnion('type', [
	TextWithProgressSchema,
	ThreeStatsSchema,
	KeyValueSchema,
	ListSchema,
])
export type WidgetData = z.infer<typeof WidgetDataSchema>

/** Type guard — true only for a payload matching one of the four templates. */
export function isWidgetData(value: unknown): value is WidgetData {
	return WidgetDataSchema.safeParse(value).success
}
