/**
 * Phase 350 (VMLIFE-02/03) — the `vm.*` tRPC router.
 *
 * Exposes the 350-02 VmManager (reachable at `ctx.livinityd.vm`) over tRPC:
 * list / get / create / start / stop / restart / delete. EVERY procedure —
 * reads AND mutations — is `adminProcedure` (requireRole('admin') +
 * auditAdminAction). There is NO member-VM concept in v49, so there is no
 * privateProcedure read surface; the admin gate is the structural,
 * compile-time-composed boundary (T-350-14) and every mutation is audit-logged
 * for free (T-350-16).
 *
 * Input is zod-validated at the boundary BEFORE the manager is touched
 * (T-350-15): a non-empty name + kind enum + positive-int resources on create,
 * a uuid on every id-bearing op, and an explicit `confirm:true` literal on
 * delete (the backend half of 352's UI confirm). The schemas are
 * forward-compatible with 351 (which REFINES bounds/GPU, never breaks this
 * shape).
 *
 * External failures are translated to honest, typed client errors at this tRPC
 * boundary (T-350-18) — the standard convention in this codebase
 * (native-routes.ts imports TRPCError for exactly this): a preflight refusal
 * (KvmUnavailable / VmResourceInvalid, both Error subclasses from
 * vm-preflight.ts) maps to BAD_REQUEST, and a single-flight race
 * ("...an operation is already in progress") maps to CONFLICT — never an opaque
 * 500.
 *
 * This phase adds ZERO Caddy / subdomain / public-exposure surface: VMs are
 * structurally absent from that system (see vm-boundary.test.ts).
 */

import {z} from 'zod'
import {TRPCError} from '@trpc/server'

import {router, adminProcedure} from '../server/trpc/trpc.js'
import {KvmUnavailable, VmResourceInvalid} from '../apps/vm-preflight.js'
import {WINDOWS_EDITION_KEYS, LINUX_DISTRO_KEYS} from './vm-os-catalog.js'
import type {CreateVmInput} from './vm-manager.js'

// ── Input schemas ─────────────────────────────────────────────────────────────
const resourcesSchema = z.object({
	cpus: z.number().int().positive(),
	ramMiB: z.number().int().positive(),
	diskGiB: z.number().int().positive(),
})
const nameSchema = z.string().min(1)

/**
 * Phase 351 (VMCREATE-01): a custom guest-image source. Only http/https URLs are
 * accepted — a `file://`/`ftp://`/etc. scheme is refused HERE, imitating
 * webapps/url-validator.ts's ALLOWED_SCHEMES allowlist. `z.string().url()` alone
 * accepts `file://` (a valid URL), so the `.refine` protocol check is the actual
 * gate; `.max(2048)` bounds it (shortcut-schema.ts:38 precedent).
 */
const customImageSchema = z.object({
	customImage: z.object({
		url: z
			.string()
			.url()
			.max(2048)
			.refine(
				(v) => {
					try {
						return ['http:', 'https:'].includes(new URL(v).protocol)
					} catch {
						return false
					}
				},
				{message: 'Only http/https custom-image URLs are allowed'},
			),
	}),
})

/**
 * The create input, discriminated by `kind` so a Windows edition and a Linux
 * distro/custom-image are mutually exclusive by construction. macOS absence
 * (VMCREATE-01) is enforced BY CONSTRUCTION — `kind` is a two-literal union and
 * the edition/distro enums simply never contain a macOS value, so an unlisted
 * value is a zod parse failure with no explicit rejection branch. This schema is
 * the cheap first gate (defense-in-depth); the manager-level checks are
 * load-bearing.
 */
const createInput = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('windows'),
		name: nameSchema,
		resources: resourcesSchema,
		os: z.object({edition: z.enum(WINDOWS_EDITION_KEYS)}),
	}),
	z.object({
		kind: z.literal('linux'),
		name: nameSchema,
		resources: resourcesSchema,
		os: z.union([z.object({distro: z.enum(LINUX_DISTRO_KEYS)}), customImageSchema]),
	}),
])
const idInput = z.object({id: z.string().uuid()})
// delete requires an explicit destruction acknowledgement — z.literal(true) means
// a missing/false `confirm` is refused at the zod boundary, before the manager.
const deleteInput = z.object({id: z.string().uuid(), confirm: z.literal(true)})

/**
 * Resolve the VmManager off the daemon context, or throw a typed 500 if the VM
 * subsystem is unavailable (mirrors native-routes' requireStore). The gate has
 * already run — this only guards a mis-wired daemon, never an auth failure.
 */
function requireVm(ctx: {livinityd?: {vm?: unknown}}) {
	const vm = ctx.livinityd?.vm
	if (!vm) throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: 'VM subsystem unavailable'})
	return vm as VmManagerSurface
}

/** The subset of VmManager the router delegates to (kept structural to avoid a value import). */
interface VmManagerSurface {
	list(): Promise<unknown>
	get(id: string): Promise<unknown>
	create(input: CreateVmInput): Promise<{id: string}>
	start(id: string): Promise<void>
	stop(id: string): Promise<void>
	restart(id: string): Promise<void>
	delete(id: string, opts: {confirm: true}): Promise<{deleted: boolean}>
}

/**
 * Run a VmManager op and translate its domain errors to typed TRPCErrors at the
 * boundary: a preflight refusal → BAD_REQUEST (a bad request, not a server
 * fault); a single-flight race → CONFLICT. Anything else re-throws unchanged
 * (tRPC renders it as INTERNAL_SERVER_ERROR).
 */
async function callVm<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn()
	} catch (e) {
		if (e instanceof KvmUnavailable || e instanceof VmResourceInvalid) {
			throw new TRPCError({code: 'BAD_REQUEST', message: e.message})
		}
		if (e instanceof Error && /already in progress/.test(e.message)) {
			throw new TRPCError({code: 'CONFLICT', message: e.message})
		}
		throw e
	}
}

// Every procedure is adminProcedure — no member-VM read/write surface exists.
const vm = router({
	list: adminProcedure.query(({ctx}) => callVm(() => requireVm(ctx).list())),
	get: adminProcedure.input(idInput).query(({ctx, input}) => callVm(() => requireVm(ctx).get(input.id))),
	create: adminProcedure
		.input(createInput)
		.mutation(({ctx, input}) => callVm(() => requireVm(ctx).create(input))),
	start: adminProcedure.input(idInput).mutation(({ctx, input}) => callVm(() => requireVm(ctx).start(input.id))),
	stop: adminProcedure.input(idInput).mutation(({ctx, input}) => callVm(() => requireVm(ctx).stop(input.id))),
	restart: adminProcedure.input(idInput).mutation(({ctx, input}) => callVm(() => requireVm(ctx).restart(input.id))),
	delete: adminProcedure
		.input(deleteInput)
		.mutation(({ctx, input}) => callVm(() => requireVm(ctx).delete(input.id, {confirm: input.confirm}))),
})

export default vm
