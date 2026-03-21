import {useEffect, useState} from 'react'
import {type To} from 'react-router-dom'

import {useQueryParams} from '@/hooks/use-query-params'
import {SettingsDialogKey} from '@/routes/settings'
import {sleep} from '@/utils/misc'

/** Duration in ms to wait after a dialog closes before cleaning up URL params */
export const DIALOG_CLOSE_DELAY = 150

export type GlobalDialogKey = 'logout' | 'live-usage' | 'whats-new'
export type AppStoreDialogKey = 'updates' | 'add-community-store' | 'default-credentials' | 'app-settings'
export type FilesDialogKey =
	| 'files-share-info'
	| 'files-empty-trash-confirmation'
	| 'files-extension-change-confirmation'
	| 'files-permanently-delete-confirmation'
	| 'files-external-storage-unsupported'
	| 'files-add-network-share'
	| 'files-format-drive'
export type DialogKey = GlobalDialogKey | AppStoreDialogKey | SettingsDialogKey | FilesDialogKey

/**
 * Returns an onOpenChange handler that runs a callback after the dialog close animation completes.
 */
export function afterDelayedClose(callback?: () => void) {
	return (isOpen: boolean) => {
		if (!isOpen) sleep(DIALOG_CLOSE_DELAY).then(callback)
	}
}

/** Runs callback after dialog close animation when `isOpen` transitions to false */
export function useAfterDelayedClose(isOpen: boolean, callback: () => void) {
	useEffect(() => {
		const timer = setTimeout(() => {
			if (!isOpen) callback()
		}, DIALOG_CLOSE_DELAY)
		return () => clearTimeout(timer)
	}, [isOpen, callback])
}

/** Sync dialog open state with URL query params */
export function useDialogOpenProps(key: DialogKey) {
	const {params, add, filter} = useQueryParams()
	const [isOpen, setIsOpen] = useState(false)

	useEffect(() => {
		setIsOpen(params.get('dialog') === key)
	}, [params, key])

	const onOpenChange = (nextOpen: boolean) => {
		setIsOpen(nextOpen)
		if (nextOpen) {
			add('dialog', key)
		} else {
			sleep(DIALOG_CLOSE_DELAY).then(() => {
				filter(([paramKey]) => paramKey !== 'dialog' && !paramKey.startsWith(key))
			})
		}
	}

	return {open: isOpen, onOpenChange}
}

/** Build a react-router link that opens a dialog via query params */
export function useLinkToDialog() {
	const {addLinkSearchParams} = useQueryParams()

	return (dialogKey: DialogKey, extraParams?: Record<string, string>): To => {
		const prefixed: Record<string, string> = {}
		if (extraParams) {
			for (const [k, v] of Object.entries(extraParams)) {
				prefixed[`${dialogKey}-${k}`] = v
			}
		}
		return {search: addLinkSearchParams({dialog: dialogKey, ...prefixed})}
	}
}
