import {trpcReact} from '@/trpc/trpc'

/**
 * Phase 340-02 USBIMP-01 — thin wrapper over the adminProcedure usbImport routes
 * (files.usbImportList / usbImportSet / usbImportRemove, added in 340-01). Mirrors
 * the shape of use-external-storage: a React-Query list plus mutations that
 * invalidate the list on success. The rule type is inferred from the tRPC query
 * (no cross-package import), so consumers get {id, enabled, destinationVirtualPath,
 * ownerUsername, ownerRole, lastRun?} for free.
 *
 * v1 exposes a single global rule (D-340-2 A1); the list is an array to stay
 * future-proof for per-device rules.
 */
export function useUsbImport() {
	const utils = trpcReact.useUtils()
	const listQ = trpcReact.files.usbImportList.useQuery()
	const setMut = trpcReact.files.usbImportSet.useMutation({
		onSuccess: () => utils.files.usbImportList.invalidate(),
	})
	const removeMut = trpcReact.files.usbImportRemove.useMutation({
		onSuccess: () => utils.files.usbImportList.invalidate(),
	})

	return {
		rules: listQ.data ?? [],
		isLoading: listQ.isLoading,
		saveRule: setMut.mutateAsync,
		isSaving: setMut.isPending,
		removeRule: removeMut.mutateAsync,
		isRemoving: removeMut.isPending,
	}
}
