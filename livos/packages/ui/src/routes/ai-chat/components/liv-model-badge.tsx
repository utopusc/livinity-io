/** LivModelBadge — Phase 70-06. Inline model pill ("Liv Agent · Kimi").
 *
 * Renders a clickable pill: `<IconBrain /> Liv Agent · <model>` where `<model>`
 * is read from `import.meta.env.VITE_LIV_MODEL_DEFAULT` at build time
 * (falls back to `'Kimi'` per CONTEXT D-31).
 *
 * Click is a no-op for P70 (model switching is backlog) — logs intent so the
 * surface is greppable when P75/v32 wires real switching. Hover tooltip uses
 * the native `title` attribute (NO new tooltip library, D-NO-NEW-DEPS).
 *
 * Wired in 70-08 by replacing the `data-testid='liv-composer-model-badge-stub'`
 * placeholder LivComposer ships in 70-01.
 *
 * NO new npm deps (D-07). Reuses P66 `--liv-accent-cyan` + `--liv-bg-elevated`
 * + `--liv-border-subtle` + `--liv-text-secondary` tokens. */

import {IconBrain} from '@tabler/icons-react'

import {cn} from '@/shadcn-lib/utils'

/** Pure helper — selects displayed model name from a (possibly absent) env value.
 * Whitespace-only and empty strings fall back to `'Kimi'`. Exported for vitest. */
export function getModelBadgeText(envValue: string | undefined | null): string {
	if (envValue && envValue.trim().length > 0) return envValue
	return 'Kimi'
}

export interface LivModelBadgeProps {
	className?: string
}

export function LivModelBadge({className}: LivModelBadgeProps) {
	const modelEnv = import.meta.env.VITE_LIV_MODEL_DEFAULT as string | undefined
	const model = getModelBadgeText(modelEnv)

	const handleClick = () => {
		// Model switching is backlog (CONTEXT D-31). Logs intent so the surface is
		// greppable when P75/v32 wires real switching.
		// eslint-disable-next-line no-console
		console.info('[LivModelBadge] Model switching not yet implemented')
	}

	return (
		<button
			type='button'
			onClick={handleClick}
			title={`Current model: ${model}. Click to switch (coming soon).`}
			data-testid='liv-model-badge'
			className={cn(
				'inline-flex items-center gap-1.5 rounded-full border border-[color:var(--liv-border-subtle)] bg-[color:var(--liv-bg-elevated)] px-2.5 py-1 text-12 text-[color:var(--liv-text-secondary)] transition-colors hover:bg-[color:var(--liv-bg-deep)]/50',
				className,
			)}
		>
			<IconBrain size={12} className='text-[color:var(--liv-accent-cyan)]' />
			<span>Liv Agent · {model}</span>
		</button>
	)
}
