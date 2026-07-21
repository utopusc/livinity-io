// Phase 352-02 (VMAPP-02, T-352-06) — destructive delete-confirm dialog.
//
// A near-verbatim copy of uninstall-confirmation-dialog.tsx. The backend requires
// a literal `confirm: true` (trpc-router.ts deleteInput z.literal(true)), so the
// explicit destructive-button click IS the acknowledgement — no "type DELETE"
// text field. The mutation fires ONLY {id, confirm: true} on that click; nothing
// destructive happens on mere open. onError surfaces the server message verbatim.
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/shadcn-components/ui/alert-dialog'
import type {RouterOutput} from '@/trpc/trpc'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'
import {toast} from 'sonner'

type VmView = RouterOutput['vm']['list'][number]

export function DeleteVmDialog({
	open,
	onOpenChange,
	vm,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	vm: VmView | null
}) {
	const utils = trpcReact.useUtils()
	const deleteMut = trpcReact.vm.delete.useMutation({
		onSuccess: () => {
			utils.vm.list.invalidate()
			onOpenChange(false)
		},
		onError: (error) => toast.error(error.message),
	})

	// No VM selected — render nothing (the open-state owner clears it on close).
	if (!vm) return null

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t('vm.delete.confirm.title', {name: vm.name})}</AlertDialogTitle>
					<AlertDialogDescription>{t('vm.delete.confirm.description')}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogAction
						variant='destructive'
						disabled={deleteMut.isPending}
						onClick={() => deleteMut.mutate({id: vm.id, confirm: true})}
					>
						{t('vm.delete.confirm.submit')}
					</AlertDialogAction>
					<AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
