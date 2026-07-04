import {TbDeviceUsb, TbServer2} from 'react-icons/tb'

import LivinityLogo from '@/assets/livinity-logo'
import {getDeviceType} from '@/features/backups/utils/backup-location-helpers'
import {useNetworkDeviceType} from '@/features/files/hooks/use-network-device-type'
import {cn} from '@/shadcn-lib/utils'

// De-Umbrel P1 (2026-07-03): the backup destination icons were Umbrel-style
// raster PNGs. They now render as theme-aware Tabler SVGs (Livinity design
// language). A NAS detected as a Livinity device shows the Livinity mark. The
// component API (path/connected/className) is unchanged so every caller is
// untouched.
export function BackupDeviceIcon({
	path,
	connected = true,
	className = '',
}: {
	path: string
	connected?: boolean
	className?: string
}) {
	const kind = getDeviceType(path)
	const {deviceType} = useNetworkDeviceType(path)

	if (kind === 'NAS') {
		// A NAS confirmed to be a Livinity device → the Livinity mark.
		if (deviceType === 'livinity') {
			return <LivinityLogo className={className} />
		}
		// Generic NAS/server; dim when disconnected (mirrors the old active/inactive PNGs).
		return <TbServer2 className={cn(className, !connected && 'opacity-40')} />
	}

	// A plugged-in external / USB drive.
	return <TbDeviceUsb className={cn(className, !connected && 'opacity-40')} />
}
