import i18next from 'i18next'
import prettyBytes from 'pretty-bytes'

import {LOADING_DASH} from '@/constants'

/** Format byte count to human-readable string with locale support. Returns loading dash for nullish values. */
export function formatBytes(bytes: number | undefined | null): string {
	if (bytes == null) return LOADING_DASH
	return prettyBytes(bytes, {locale: i18next.language, maximumFractionDigits: 1})
}

/** @deprecated Use formatBytes instead */
export const maybePrettyBytes = formatBytes
