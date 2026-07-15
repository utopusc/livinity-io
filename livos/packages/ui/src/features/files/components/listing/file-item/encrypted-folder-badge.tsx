import {TbLock, TbLockOpen} from 'react-icons/tb'

import {useEncryptedFolders} from '@/features/files/hooks/use-encrypted-folders'
import {useEncryptedFolderStore} from '@/features/files/store/use-encrypted-folder-store'
import type {FileSystemItem} from '@/features/files/types'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'

// STOR-01 (D-04): a Synology-style Locked/Unlocked badge shown on directory rows that
// are registered encrypted folders (325-05 `storage.encryptedFolders`). Clicking it
// opens the shared EncryptedFolderDialog — unlock when Locked, lock when Unlocked.
// Admin-only (the underlying cryptoStatus query is admin-gated); renders nothing for
// everyone else and for non-encrypted rows.
export function EncryptedFolderBadge({item}: {item: FileSystemItem}) {
	const {findByName} = useEncryptedFolders()
	const openEncryptedFolder = useEncryptedFolderStore((s) => s.openEncryptedFolder)

	if (item.type !== 'directory') return null
	const entry = findByName(item.name)
	if (!entry) return null

	const unlocked = entry.status.ok
	const Icon = unlocked ? TbLockOpen : TbLock

	return (
		<button
			type='button'
			onClick={(e) => {
				// Don't let the click bubble to the row's open/select handlers.
				e.stopPropagation()
				openEncryptedFolder(
					unlocked
						? {mode: 'lock', name: entry.name, plainDir: entry.plainDir}
						: {mode: 'unlock', name: entry.name, cipherDir: entry.cipherDir, plainDir: entry.plainDir},
				)
			}}
			title={unlocked ? t('storage.encryption.lock') : t('storage.encryption.unlock')}
			className={cn(
				'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-12 font-medium leading-none transition-colors',
				unlocked
					? 'bg-green-100 text-green-700 hover:bg-green-200'
					: 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300',
			)}
		>
			<Icon className='size-3' strokeWidth={2.5} />
			{unlocked ? t('storage.encryption.badge.unlocked') : t('storage.encryption.badge.locked')}
		</button>
	)
}
