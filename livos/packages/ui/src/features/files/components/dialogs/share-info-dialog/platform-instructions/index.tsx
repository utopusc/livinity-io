import {IOSInstructions} from '@/features/files/components/dialogs/share-info-dialog/platform-instructions/ios-instructions'
import {MacOSInstructions} from '@/features/files/components/dialogs/share-info-dialog/platform-instructions/macos-instructions'
import {LivOSInstructions} from '@/features/files/components/dialogs/share-info-dialog/platform-instructions/livos-instructions'
import {WindowsInstructions} from '@/features/files/components/dialogs/share-info-dialog/platform-instructions/windows-instructions'
import {Platform} from '@/features/files/components/dialogs/share-info-dialog/platform-selector'

interface PlatformInstructionsProps {
	platform: Platform
	smbUrl: string
	username: string
	password: string
	name: string
	sharename?: string
}

export function PlatformInstructions({
	platform,
	smbUrl,
	username,
	password,
	name,
	sharename,
}: PlatformInstructionsProps) {
	if (platform.id === 'macos') {
		return <MacOSInstructions smbUrl={smbUrl} username={username} password={password} name={name} />
	}

	if (platform.id === 'windows') {
		return <WindowsInstructions smbUrl={smbUrl} username={username} password={password} />
	}

	if (platform.id === 'ios') {
		return <IOSInstructions smbUrl={smbUrl} username={username} password={password} />
	}

	if (platform.id === 'livos') {
		return <LivOSInstructions username={username} password={password} sharename={sharename} />
	}

	return null
}
