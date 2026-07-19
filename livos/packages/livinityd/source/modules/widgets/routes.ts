import z from 'zod'
import ms from 'ms'
import {TRPCError} from '@trpc/server'

import {router, privateProcedure} from '../server/trpc/trpc.js'
import {systemWidgets} from '../system/system-widgets.js'
import {filesWidgets} from '../files/widgets.js'
import {appIdOwner} from '../domain/caddy.js'
import {WidgetDataSchema} from '../apps/widget-manifest.js'
// Phase 345-01 (WIDG-01, D-345-2) — the pure, unit-tested widget multi-user
// safety core. splitWidgetId now rsplits on the LAST colon (composite per-user
// id fix); decideWidgetAccess is the fail-closed ownership allow-list
// (CR-345-1: per-user composites are owner/admin-only, no base-grant crossover).
import {splitWidgetId, decideWidgetAccess} from './widget-access.js'

const MAX_ALLOWED_WIDGETS = 3

const livinityWidgets = {...systemWidgets, ...filesWidgets}

// Minimal ctx shape assertWidgetAccess needs (structurally compatible with the
// full tRPC context — keeps the helper testable and decoupled).
type WidgetAccessCtx = {
	currentUser?: {id: string; role: string}
	legacySingleUser?: boolean
}

// Phase 345-01 (WIDG-01, D-345-2) — the fail-closed ownership gate shared by
// enable + data. Built-in `livinity` system/files widgets have NO owner and are
// box-global → ungated (never-break). A per-user composite appId
// (`${base}:user:${uid}`) is gated: only the owner, an admin, or a user with an
// explicit full/readonly share grant may enable/read it.
async function assertWidgetAccess(ctx: WidgetAccessCtx, appId: string): Promise<void> {
	if (appId === 'livinity') return // built-in system/files widgets — ownerless, unchanged

	const owner = appIdOwner(appId)
	const isAdmin = ctx.currentUser ? ctx.currentUser.role === 'admin' : ctx.legacySingleUser === true

	// CR-345-1: a per-user composite instance is owner/admin-only. A BASE-app
	// share grant is deliberately NOT consulted — it does not prove access to
	// another user's specific instance whose container the data fetch reads.
	if (!decideWidgetAccess({owner, currentUserId: ctx.currentUser?.id, isAdmin})) {
		throw new TRPCError({code: 'FORBIDDEN', message: 'You do not have access to this app widget'})
	}
}

export default router({
	// List enabled widgets
	enabled: privateProcedure.query(async ({ctx}) => {
		const widgetIds = (await ctx.livinityd.store.get('widgets')) || []

		return widgetIds
	}),

	// Enable widget
	enable: privateProcedure
		.input(
			z.object({
				widgetId: z.string(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			const {appId, widgetName} = splitWidgetId(input.widgetId)

			// Phase 345-01 — fail-closed ownership gate BEFORE any metadata read.
			await assertWidgetAccess(ctx, appId)

			// Validate widget
			if (appId === 'livinity') {
				// This is an Livinity widget
				if (!(widgetName in livinityWidgets)) throw new Error(`No widget named ${widgetName} found in Livinity widgets`)
			} else {
				// This is an app widget
				// Throws an error if the widget doesn't exist
				await ctx.apps.getApp(appId).getWidgetMetadata(widgetName)
			}

			// Save widget ID
			await ctx.livinityd.store.getWriteLock(async ({get, set}) => {
				const widgets = (await get('widgets')) || []

				// Check if widget is already active
				if (widgets.includes(input.widgetId)) throw new Error(`Widget ${input.widgetId} is already enabled`)

				// Check we don't have more than 3 widgets enabled
				if (widgets.length >= MAX_ALLOWED_WIDGETS)
					throw new Error(`The maximum number of widgets (${MAX_ALLOWED_WIDGETS}) has already been enabled`)

				widgets.push(input.widgetId)
				await set('widgets', widgets)
			})

			return true
		}),

	// Disable widget
	disable: privateProcedure
		.input(
			z.object({
				widgetId: z.string(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			// Remove widget ID
			await ctx.livinityd.store.getWriteLock(async ({get, set}) => {
				const widgets = await get('widgets')

				// Check if widget is currently enabled
				if (!widgets.includes(input.widgetId)) throw new Error(`Widget ${input.widgetId} is not enabled`)

				// Remove widget
				const updatedWidgets = widgets.filter((widget) => widget !== input.widgetId)
				await set('widgets', updatedWidgets)
			})

			return true
		}),

	// Get live data for a widget
	data: privateProcedure
		.input(
			z.object({
				widgetId: z.string(),
			}),
		)
		.query(async ({ctx, input}) => {
			const {appId, widgetName} = splitWidgetId(input.widgetId)
			let widgetData: {[key: string]: any}

			// Phase 345-01 — fail-closed ownership gate BEFORE any data fetch.
			await assertWidgetAccess(ctx, appId)

			if (appId === 'livinity') {
				// This is an Livinity widget — FIRST-PARTY, trusted; its shape
				// (text-with-progress / three-stats / files-list / files-grid) is
				// returned byte-identically and NOT run through WidgetDataSchema
				// (the built-in files shapes deliberately bypass the app union).
				if (!(widgetName in livinityWidgets)) throw new Error(`No widget named ${widgetName} found in Livinity widgets`)

				widgetData = await livinityWidgets[widgetName as keyof typeof livinityWidgets](ctx.livinityd)
			} else {
				// This is an app widget — the payload comes from the app's OWN
				// container. Phase 345-01 (W-DataContract): validate it against the
				// four renderable templates and DEGRADE (never throw) on a
				// malformed payload, so a misbehaving container cannot push a shape
				// that throws in the UI render.
				const raw = await ctx.apps.getApp(appId).getWidgetData(widgetName)
				const parsed = WidgetDataSchema.safeParse(raw)
				// IN-345-1: on success return the VALIDATED data (stripped to the
				// four typed fields) — never the raw container payload — so only
				// typed fields ever structurally leave the box.
				widgetData = parsed.success ? parsed.data : {type: 'unknown', refresh: raw?.refresh ?? '30s'}
			}

			// Parse refresh time from human-readable string to milliseconds.
			// IN-345-2: `refresh` is OPTIONAL in WidgetDataSchema, so a conformant
			// payload may omit it — default to '30s' (mirrors the degrade path)
			// rather than letting ms(undefined) throw a 500.
			widgetData.refresh = ms(widgetData.refresh ?? '30s')

			return widgetData
		}),
})
