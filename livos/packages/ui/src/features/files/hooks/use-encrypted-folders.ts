import {useCurrentUser} from '@/hooks/use-current-user'
import {trpcReact} from '@/trpc/trpc'

// STOR-01: read the encrypted-folder registry + live Locked/Unlocked state from the
// 325-05 `system.cryptoStatus` admin route. Gated on `isAdmin` so a member/guest never
// fires the admin query (it would 401). Degrades silently to an empty list when the
// wrapper is undeployed (the route is never-throw → {ok:false} per-folder), so the file
// list keeps rendering with no badge instead of erroring.
export type EncryptedFolderEntry = {
	name: string
	cipherDir: string
	plainDir: string
	/** ok:true => mounted (Unlocked); ok:false => not mounted (Locked) or wrapper absent. */
	status: {ok: boolean}
}

export function useEncryptedFolders() {
	const {isAdmin} = useCurrentUser()
	const {data} = trpcReact.system.cryptoStatus.useQuery(undefined, {
		enabled: isAdmin,
		// Lock state can change out of band (a lock/unlock elsewhere, a reboot); a short
		// staleness keeps the badge fresh without hammering the sudo wrapper.
		staleTime: 15_000,
		retry: false,
	})

	const folders: EncryptedFolderEntry[] = data?.folders ?? []

	// The file list exposes VIRTUAL paths (e.g. /Home/Secret) while the registry stores
	// HOST paths; match on the folder basename (D-18 — exact live-mount visibility is a
	// human-UAT concern, the UI only needs to surface the badge on the matching row).
	const findByName = (name: string): EncryptedFolderEntry | undefined =>
		isAdmin ? folders.find((f) => f.name === name) : undefined

	return {folders, findByName, isAdmin}
}
