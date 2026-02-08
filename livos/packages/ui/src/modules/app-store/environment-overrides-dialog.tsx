import {useState} from 'react'

import {Button} from '@/shadcn-components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/shadcn-components/ui/dialog'
import {Input, PasswordInput} from '@/shadcn-components/ui/input'

type EnvironmentOverride = {
	name: string
	label: string
	type: 'string' | 'password'
	default?: string
	required?: boolean
}

export function EnvironmentOverridesDialog({
	open,
	onOpenChange,
	appName,
	overrides,
	onNext,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	appName: string
	overrides: EnvironmentOverride[]
	onNext: (values: Record<string, string>) => void
}) {
	const [values, setValues] = useState<Record<string, string>>(() => {
		const initial: Record<string, string> = {}
		for (const override of overrides) {
			initial[override.name] = override.default ?? ''
		}
		return initial
	})

	const allRequiredFilled = overrides.every(
		(o) => !o.required || (values[o.name] && values[o.name].trim().length > 0),
	)

	const handleSubmit = () => {
		// Only include non-empty values
		const result: Record<string, string> = {}
		for (const [key, value] of Object.entries(values)) {
			if (value.trim()) result[key] = value.trim()
		}
		onNext(result)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				onOpenAutoFocus={(e) => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Configure {appName}</DialogTitle>
				</DialogHeader>
				<div className='space-y-4 py-2'>
					{overrides.map((override) => (
						<div key={override.name}>
							<label className='mb-1.5 block px-[5px] text-caption -tracking-2 text-text-secondary'>
								{override.label}
								{override.required && <span className='text-destructive2-lightest'> *</span>}
							</label>
							{override.type === 'password' ? (
								<PasswordInput
									value={values[override.name]}
									onValueChange={(v) => setValues((prev) => ({...prev, [override.name]: v}))}
									label={override.label}
									sizeVariant='default'
								/>
							) : (
								<Input
									type='text'
									value={values[override.name]}
									onValueChange={(v) => setValues((prev) => ({...prev, [override.name]: v}))}
									placeholder={override.default || override.label}
								/>
							)}
						</div>
					))}
				</div>
				<DialogFooter>
					<DialogFooter>
						<Button
							variant='primary'
							size='dialog'
							disabled={!allRequiredFilled}
							onClick={handleSubmit}
						>
							Install {appName}
						</Button>
						<Button size='dialog' onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
					</DialogFooter>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
