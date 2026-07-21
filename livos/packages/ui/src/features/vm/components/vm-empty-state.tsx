// Phase 352-01 (VMAPP-01) — empty-state for the VM app: an admin with no VMs
// sees a prominent "Create VM" button + a short explainer line. Composes the
// NoApiKeyMessage layout (icon + heading + body, app-store-content.tsx) plus a
// shadcn primary Button styled like add-webapp-dialog's submit action.
import {MonitorPlay} from 'lucide-react'

import {Button} from '@/shadcn-components/ui/button'
import {t} from '@/utils/i18n'

export function VmEmptyState({onCreate}: {onCreate: () => void}) {
	return (
		<div className='flex h-full flex-col items-center justify-center gap-3 p-8 text-center'>
			<MonitorPlay className='h-12 w-12 text-text-tertiary' aria-hidden='true' />
			<h2 className='text-lg font-semibold text-text-primary'>{t('vm.empty.title')}</h2>
			<p className='max-w-md text-sm text-text-secondary'>{t('vm.empty.body')}</p>
			<Button variant='primary' size='dialog' onClick={onCreate}>
				{t('vm.empty.create-button')}
			</Button>
		</div>
	)
}
