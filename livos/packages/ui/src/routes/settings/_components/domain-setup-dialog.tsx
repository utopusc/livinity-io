import {lazy, Suspense} from 'react'
import {Loader2} from 'lucide-react'

import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/shadcn-components/ui/dialog'

const DomainSetupDialogContent = lazy(() =>
	import('@/routes/settings/domain-setup').then((m) => ({default: m.DomainSetupDialogContent})),
)

export function DomainSetupDialog({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-lg'>
				<DialogHeader>
					<DialogTitle>Domain & HTTPS Setup</DialogTitle>
				</DialogHeader>
				<Suspense
					fallback={
						<div className='flex items-center justify-center py-12'>
							<Loader2 className='size-6 animate-spin text-white/30' />
						</div>
					}
				>
					<DomainSetupDialogContent onClose={() => onOpenChange(false)} />
				</Suspense>
			</DialogContent>
		</Dialog>
	)
}
