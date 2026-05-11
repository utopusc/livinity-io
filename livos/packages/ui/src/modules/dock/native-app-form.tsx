// Phase 101-07 Task 2 — NativeAppForm.
//
// "Add Ubuntu app" dialog. Mirrors AddWebAppDialog (94-02) in shape — same
// shadcn primitives, same `useMutation + invalidate` pattern — but the
// validation surface is far more security-critical because the form's
// payload ultimately spawns a binary on the host as the `bruce` user.
//
// SCHEMA PARITY (mirrors native-app-config.ts:60-79 verbatim — single
// source of truth for "what is a valid native-app config"):
//   - binaryPath: must match /^\/[a-zA-Z0-9_\-./]+$/ (absolute, no shell
//                 metachars). Server re-parses defense-in-depth.
//   - args:       each entry must match /^[^;&|`$<>(){}\\]*$/ (no shell
//                 metachars; spaces are allowed for sentence-like args).
//                 UI input is a comma-separated string; we split + .filter
//                 Boolean to drop empty/trailing entries.
//   - env keys:   may NOT start with LD_ or DYLD_ (preload-library
//                 injection vectors — LD_PRELOAD, DYLD_INSERT_LIBRARIES,
//                 LD_LIBRARY_PATH, DYLD_FORCE_FLAT_NAMESPACE, etc.).
//   - wmClassHint: optional, /^[\w-]{1,64}$/ (mirrors schema).
//
// Q3 RESOLUTION ("Detect WM_CLASS" affordance from 101-RESEARCH):
//   The research recommendation is "user launches binary manually, backend
//   reads `xprop WM_CLASS` of newest visible window, auto-fills field."
//   That requires a new backend tRPC route AND an xprop subprocess wrapper
//   which is out of this plan's scope (Rule 4 architectural — would also
//   need a UI-driven spawn that creates state outside the dock-launch flow).
//   This MVP ships a CLIENT-SIDE "Detect" button that uses the same
//   basename-heuristic the backend's `inferWmClass` helper uses
//   (native-app-binder.ts:101) — sensible default the user can accept or
//   override. The full backend-xprop path is a clear follow-up (tracked in
//   the SUMMARY's Deferred Issues).

import {useState} from 'react'

import {Button} from '@/shadcn-components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {trpcReact} from '@/trpc/trpc'

// ─── Validation regexes ─────────────────────────────────────────────────────
//
// Kept literal-identical to the server schema so the test invariants
// (native-app-form.test.tsx) and the server-side zod (native-app-config.ts)
// can be grep-matched against each other for drift detection. DO NOT change
// one without changing the other — they are a paired contract.

const BINARY_PATH_RE = /^\/[a-zA-Z0-9_\-./]+$/
const SHELL_METACHAR_RE = /^[^;&|`$<>(){}\\]*$/
const PRELOAD_ENV_RE = /^(LD_|DYLD_)/
const WMCLASS_HINT_RE = /^[\w-]{1,64}$/

// ─── Field validators ───────────────────────────────────────────────────────

function validateBinaryPath(s: string): string | null {
	const trimmed = s.trim()
	if (!trimmed) return 'Path is required'
	if (!BINARY_PATH_RE.test(trimmed)) {
		return 'Path must be absolute with no shell metachars'
	}
	return null
}

function validateArgsList(raw: string): {args: string[]; error: string | null} {
	const parts = raw
		.split(',')
		.map((p) => p.trim())
		.filter(Boolean)
	for (const p of parts) {
		if (!SHELL_METACHAR_RE.test(p)) {
			return {args: parts, error: `Arg contains shell metachars: "${p}"`}
		}
	}
	return {args: parts, error: null}
}

function validateEnvEntries(entries: ReadonlyArray<readonly [string, string]>): string | null {
	for (const [k] of entries) {
		if (PRELOAD_ENV_RE.test(k)) {
			return `Env key "${k}" is not allowed (LD_*/DYLD_* preload-library injection)`
		}
	}
	return null
}

function validateWmClassHint(s: string): string | null {
	const trimmed = s.trim()
	if (!trimmed) return null // optional
	if (!WMCLASS_HINT_RE.test(trimmed)) {
		return 'WM_CLASS hint must be 1-64 chars of letters, digits, underscores or hyphens'
	}
	return null
}

// ─── inferWmClass (client-side mirror of native-app-binder.ts:101) ──────────

/**
 * Heuristic: strip directory + trailing extension, lowercase. Matches the
 * server-side `inferWmClass` so the "Detect" affordance below gives the
 * same suggestion the binder would compute at spawn time.
 */
function inferWmClass(binaryPath: string): string {
	const base = binaryPath.split('/').pop() ?? ''
	const noExt = base.replace(/\.[^.]+$/, '')
	return noExt.toLowerCase()
}

// ─── Component ──────────────────────────────────────────────────────────────

export interface NativeAppFormProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	/** Fires after the create mutation resolves; receives the new config id. */
	onCreated?: (id: string) => void
}

export function NativeAppForm({open, onOpenChange, onCreated}: NativeAppFormProps) {
	const utils = trpcReact.useUtils()
	const createMut = trpcReact.apps.native.create.useMutation()

	const [name, setName] = useState('')
	const [iconUrl, setIconUrl] = useState('')
	const [binaryPath, setBinaryPath] = useState('')
	const [argsRaw, setArgsRaw] = useState('')
	// envEntries is intentionally a simple [k,v] tuple list. The form ships an
	// add/remove row affordance; a full key-value matrix component is out of
	// scope for the MVP — the typical native-app config has 0-2 env entries.
	const [envEntries, setEnvEntries] = useState<Array<[string, string]>>([])
	const [wmClassHint, setWmClassHint] = useState('')

	const binaryErr = binaryPath ? validateBinaryPath(binaryPath) : null
	const {args, error: argsErr} = validateArgsList(argsRaw)
	const envErr = validateEnvEntries(envEntries)
	const wmClassErr = wmClassHint ? validateWmClassHint(wmClassHint) : null

	const canSave =
		!!name.trim() &&
		!!binaryPath.trim() &&
		!binaryErr &&
		!argsErr &&
		!envErr &&
		!wmClassErr &&
		!createMut.isPending

	// Q3 — Detect WM_CLASS affordance. Client-side basename heuristic; the
	// fuller "spawn binary + xprop poll" backend path is documented in the
	// header comment and tracked as a follow-up.
	const detectDisabled = !binaryPath.trim() || !!binaryErr
	const handleDetectWmClass = () => {
		if (detectDisabled) return
		setWmClassHint(inferWmClass(binaryPath.trim()))
	}

	const addEnvRow = () => setEnvEntries((prev) => [...prev, ['', '']])
	const updateEnvKey = (idx: number, k: string) =>
		setEnvEntries((prev) => prev.map((e, i) => (i === idx ? [k, e[1]] : e)))
	const updateEnvVal = (idx: number, v: string) =>
		setEnvEntries((prev) => prev.map((e, i) => (i === idx ? [e[0], v] : e)))
	const removeEnvRow = (idx: number) =>
		setEnvEntries((prev) => prev.filter((_, i) => i !== idx))

	const resetState = () => {
		setName('')
		setIconUrl('')
		setBinaryPath('')
		setArgsRaw('')
		setEnvEntries([])
		setWmClassHint('')
	}

	const handleSave = async () => {
		if (!canSave) return
		// Use crypto.randomUUID() at runtime — browsers expose it on globalThis.crypto
		// since Chrome 92 / Safari 15.4. UI runs in modern browsers only (no IE).
		const id =
			typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto
				? globalThis.crypto.randomUUID()
				: // Fallback for jsdom/test env where randomUUID may be missing.
					`${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
		try {
			await createMut.mutateAsync({
				id,
				name: name.trim(),
				iconUrl: iconUrl.trim() ? iconUrl.trim() : undefined,
				binaryPath: binaryPath.trim(),
				args: args.length > 0 ? args : undefined,
				env:
					envEntries.length > 0
						? Object.fromEntries(envEntries.filter(([k, v]) => k.trim() && v.trim()))
						: undefined,
				wmClassHint: wmClassHint.trim() ? wmClassHint.trim() : undefined,
			})
			await utils.apps.native.list.invalidate()
			onCreated?.(id)
			onOpenChange(false)
			resetState()
		} catch {
			// Mutation error surfaces below the form via `createMut.error`.
		}
	}

	const handleOpenChange = (next: boolean) => {
		onOpenChange(next)
		if (!next) {
			resetState()
			createMut.reset()
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add Ubuntu app</DialogTitle>
				</DialogHeader>

				<div className='flex flex-col gap-4'>
					{/* Name (required) */}
					<div className='flex flex-col gap-1.5'>
						<label className='text-xs font-medium text-white/70' htmlFor='native-app-name'>
							Name
						</label>
						<Input
							id='native-app-name'
							placeholder='Antigravity'
							value={name}
							onValueChange={setName}
						/>
					</div>

					{/* Icon URL (optional) */}
					<div className='flex flex-col gap-1.5'>
						<label className='text-xs font-medium text-white/70' htmlFor='native-app-icon-url'>
							Icon URL (optional)
						</label>
						<Input
							id='native-app-icon-url'
							placeholder='https://…/icon.png'
							value={iconUrl}
							onValueChange={setIconUrl}
						/>
					</div>

					{/* Binary path (required, validated) */}
					<div className='flex flex-col gap-1.5'>
						<label className='text-xs font-medium text-white/70' htmlFor='native-app-binary'>
							Binary path
						</label>
						<Input
							id='native-app-binary'
							placeholder='/usr/bin/antigravity-ide'
							value={binaryPath}
							onValueChange={setBinaryPath}
						/>
						{binaryErr ? <p className='text-xs text-red-400'>{binaryErr}</p> : null}
					</div>

					{/* Args (optional, comma-separated, validated) */}
					<div className='flex flex-col gap-1.5'>
						<label className='text-xs font-medium text-white/70' htmlFor='native-app-args'>
							Args (comma-separated, optional)
						</label>
						<Input
							id='native-app-args'
							placeholder='--no-sandbox, --enable-features=…'
							value={argsRaw}
							onValueChange={setArgsRaw}
						/>
						{argsErr ? <p className='text-xs text-red-400'>{argsErr}</p> : null}
					</div>

					{/* Env (optional, dynamic rows, validated) */}
					<div className='flex flex-col gap-1.5'>
						<div className='flex items-center justify-between'>
							<label className='text-xs font-medium text-white/70'>Env (optional)</label>
							<Button type='button' size='sm' onClick={addEnvRow}>
								+ Add env
							</Button>
						</div>
						{envEntries.map(([k, v], i) => (
							<div key={i} className='flex items-center gap-2'>
								<Input
									placeholder='KEY'
									value={k}
									onValueChange={(s: string) => updateEnvKey(i, s)}
								/>
								<Input
									placeholder='value'
									value={v}
									onValueChange={(s: string) => updateEnvVal(i, s)}
								/>
								<Button type='button' size='sm' onClick={() => removeEnvRow(i)}>
									×
								</Button>
							</div>
						))}
						{envErr ? <p className='text-xs text-red-400'>{envErr}</p> : null}
					</div>

					{/* WM_CLASS hint (optional, validated, with Detect affordance) */}
					<div className='flex flex-col gap-1.5'>
						<label className='text-xs font-medium text-white/70' htmlFor='native-app-wm-class'>
							WM_CLASS hint (optional)
						</label>
						<div className='flex items-center gap-2'>
							<Input
								id='native-app-wm-class'
								placeholder='antigravity'
								value={wmClassHint}
								onValueChange={setWmClassHint}
							/>
							<Button
								type='button'
								size='sm'
								onClick={handleDetectWmClass}
								disabled={detectDisabled}
							>
								Detect
							</Button>
						</div>
						{wmClassErr ? <p className='text-xs text-red-400'>{wmClassErr}</p> : null}
					</div>

					{createMut.isError ? (
						<p className='text-xs text-red-400'>
							{createMut.error?.message ?? 'Failed to add native app.'}
						</p>
					) : null}
				</div>

				<DialogFooter>
					<Button
						type='button'
						size='dialog'
						onClick={() => handleOpenChange(false)}
						disabled={createMut.isPending}
					>
						Cancel
					</Button>
					<Button
						type='button'
						size='dialog'
						variant='primary'
						onClick={() => void handleSave()}
						disabled={!canSave}
					>
						{createMut.isPending ? 'Saving…' : 'Save'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
