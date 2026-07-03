import {trpcReact} from '@/trpc/trpc'

// Backup-completeness P2 — the positive "what to include" selection for the
// out-of-tree stores the snapshot folds in (Postgres DB incl. Liv's memory,
// and the Liv AI data dir). Files + bind-mount app data are always included
// (they ARE the dataDirectory snapshot; exclusions handle skipping pieces).
export function useBackupScope() {
	const utils = trpcReact.useUtils()
	const scopeQ = trpcReact.backups.getBackupScope.useQuery()

	const setMut = trpcReact.backups.setBackupScope.useMutation({
		onMutate: async (next) => {
			// Optimistic — the toggle should feel instant.
			await utils.backups.getBackupScope.cancel()
			const prev = utils.backups.getBackupScope.getData()
			if (prev) utils.backups.getBackupScope.setData(undefined, {...prev, ...next})
			return {prev}
		},
		onError: (_err, _next, ctx) => {
			if (ctx?.prev) utils.backups.getBackupScope.setData(undefined, ctx.prev)
		},
		onSettled: () => utils.backups.getBackupScope.invalidate(),
	})

	return {
		scope: scopeQ.data,
		isLoading: scopeQ.isLoading,
		setScope: (patch: {systemDatabase?: boolean; livAssistantData?: boolean}) => setMut.mutate(patch),
		isSaving: setMut.isPending,
	}
}
