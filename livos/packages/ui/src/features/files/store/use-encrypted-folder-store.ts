import {create} from 'zustand'

// STOR-01 (D-04): the single source of truth for which encrypted-folder dialog is
// open. Kept OUT of the composed useFilesStore so it can be triggered from anywhere
// (a file-list badge, the listing context menu) while the dialog is mounted once at
// the Files window root. Holds ONLY non-secret targeting metadata — the passphrase
// and recovery key live exclusively in the dialog's transient component state and are
// NEVER placed here (D-02).
export type EncryptedFolderMode = 'create' | 'unlock' | 'lock'

export type EncryptedFolderTarget = {
	mode: EncryptedFolderMode
	/** Basename shown in the dialog title (unlock/lock). */
	name?: string
	/** Absolute host path of the ciphertext dir (create/unlock). */
	cipherDir?: string
	/** Absolute host mount path (create/unlock/lock). */
	plainDir?: string
}

type EncryptedFolderStore = {
	target: EncryptedFolderTarget | null
	openEncryptedFolder: (target: EncryptedFolderTarget) => void
	closeEncryptedFolder: () => void
}

export const useEncryptedFolderStore = create<EncryptedFolderStore>((set) => ({
	target: null,
	openEncryptedFolder: (target) => set({target}),
	closeEncryptedFolder: () => set({target: null}),
}))
