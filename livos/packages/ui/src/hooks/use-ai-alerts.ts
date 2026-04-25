// Phase 23 AID-02 — React hook bundling the AlertsBell tRPC surface.
// 30-second poll on listAiAlerts so the bell badge updates without
// requiring the user to interact. Both dismiss mutations invalidate
// the listAiAlerts query so the badge updates instantly on click.

import {trpcReact} from '@/trpc/trpc'

export function useAiAlerts() {
	const utils = trpcReact.useUtils()

	const listQuery = trpcReact.docker.listAiAlerts.useQuery(undefined, {
		refetchInterval: 30_000,
	})

	const dismissOne = trpcReact.docker.dismissAiAlert.useMutation({
		onSuccess: () => {
			utils.docker.listAiAlerts.invalidate()
		},
	})

	const dismissAll = trpcReact.docker.dismissAllAiAlerts.useMutation({
		onSuccess: () => {
			utils.docker.listAiAlerts.invalidate()
		},
	})

	const alerts = listQuery.data ?? []

	return {
		alerts,
		unreadCount: alerts.length,
		isLoading: listQuery.isLoading,
		dismissAlert: (id: string) => dismissOne.mutate({id}),
		dismissAllAlerts: () => dismissAll.mutate(),
		isDismissing: dismissOne.isPending || dismissAll.isPending,
	}
}
