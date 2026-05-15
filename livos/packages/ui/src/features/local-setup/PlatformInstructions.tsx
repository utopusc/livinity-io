// livos/packages/ui/src/features/local-setup/PlatformInstructions.tsx
// Phase 104 plan 104-05 — local-lan step 3: per-OS CA install instructions.
import {useState} from 'react'
import {
	IconAlertTriangle,
	IconArrowLeft,
	IconBrandAndroid,
	IconBrandApple,
	IconBrandUbuntu,
	IconBrandWindows,
	IconCheck,
} from '@tabler/icons-react'

import {cn} from '@/shadcn-lib/utils'

type Platform = 'linux' | 'macos' | 'ios' | 'windows' | 'android'

export interface PlatformInstructionsProps {
	hostIp: string
	onNext: () => void
	onBack: () => void
}

const TABS: Array<{id: Platform; label: string; icon: React.ComponentType<{className?: string}>; broken?: boolean}> = [
	{id: 'linux', label: 'Linux', icon: IconBrandUbuntu},
	{id: 'macos', label: 'macOS', icon: IconBrandApple, broken: true},
	{id: 'ios', label: 'iOS', icon: IconBrandApple, broken: true},
	{id: 'windows', label: 'Windows', icon: IconBrandWindows},
	{id: 'android', label: 'Android (Firefox)', icon: IconBrandAndroid},
]

export function PlatformInstructions({hostIp, onNext, onBack}: PlatformInstructionsProps) {
	const [tab, setTab] = useState<Platform>('linux')
	const caUrl = `http://${hostIp}/api/local/ca.crt`

	return (
		<div className='space-y-4' data-testid='platform-instructions'>
			<h3 className='text-lg font-semibold'>Install the CA on each device</h3>

			<div className='flex gap-2 border-b'>
				{TABS.map((t) => {
					const Icon = t.icon
					return (
						<button
							key={t.id}
							data-testid={`tab-${t.id}`}
							onClick={() => setTab(t.id)}
							className={cn(
								'flex items-center gap-1 px-3 py-2 text-sm',
								tab === t.id ? 'border-b-2 border-accent font-semibold' : 'text-text-secondary',
							)}
						>
							<Icon className='h-4 w-4' />
							{t.label}
							{t.broken && <IconAlertTriangle className='h-3 w-3 text-accent-amber' />}
						</button>
					)
				})}
			</div>

			{tab === 'linux' && (
				<pre className='rounded bg-bg-secondary p-3 text-sm'>{`# Debian / Ubuntu
curl -fsSL ${caUrl} -o /usr/local/share/ca-certificates/livos-local.crt
sudo update-ca-certificates
# Chrome / Firefox pick up system CA store on next restart.`}</pre>
			)}

			{tab === 'macos' && (
				<div className='space-y-3'>
					<div className='rounded bg-accent-red/10 p-3 text-sm text-accent-red' role='alert'>
						<strong>macOS does NOT support .local TLDs.</strong> Even after CA install, Safari/Chrome will not
						resolve <code>*.livinity.local</code> due to RFC 6762 mDNS interception (and macOS 26 extends this to
						ALL custom TLDs). Use <em> hybrid mode</em> instead.
					</div>
					<pre className='rounded bg-bg-secondary p-3 text-sm'>{`# If you still want to try (your devices won't resolve .local; cert install only):
curl -fsSL ${caUrl} -o ~/Downloads/livos-local-ca.crt
open ~/Downloads/livos-local-ca.crt   # Keychain Access opens
# Mark as "Always Trust" in System keychain.`}</pre>
				</div>
			)}

			{tab === 'ios' && (
				<div className='space-y-3'>
					<div className='rounded bg-accent-red/10 p-3 text-sm text-accent-red' role='alert'>
						<strong>iOS does NOT support .local TLDs.</strong> Use hybrid mode.
					</div>
					<pre className='rounded bg-bg-secondary p-3 text-sm'>{`# iOS — if you still want to try:
# 1. Scan the QR (step above) — iOS downloads the .crt as a "profile"
# 2. Settings -> General -> VPN & Device Management -> install the profile
# 3. Settings -> General -> About -> Certificate Trust Settings -> toggle ON for LivOS Local CA
# But .local still won't resolve. Use hybrid.`}</pre>
				</div>
			)}

			{tab === 'windows' && (
				<pre className='rounded bg-bg-secondary p-3 text-sm'>{`# PowerShell (run as Administrator)
$cert = Invoke-WebRequest -Uri "${caUrl}" -OutFile "$env:TEMP\\livos-local.crt"
certutil -addstore -f "ROOT" "$env:TEMP\\livos-local.crt"
# Chrome / Edge restart picks up the trust.`}</pre>
			)}

			{tab === 'android' && (
				<div className='space-y-3'>
					<div className='rounded bg-accent-amber/10 p-3 text-sm text-accent-amber'>
						<strong>Android 14+:</strong> stock Chrome ignores user-installed CAs. Use Firefox for Android (it has
						its own CA store).
					</div>
					<pre className='rounded bg-bg-secondary p-3 text-sm'>{`# Firefox on Android:
# 1. Scan the QR (step above) — Firefox downloads the .crt
# 2. Firefox -> Settings -> Security & Privacy -> Certificates -> Trusted Roots -> Add`}</pre>
				</div>
			)}

			<div className='flex justify-between pt-4'>
				<button onClick={onBack} className='px-4 py-2'>
					<IconArrowLeft className='inline' /> Back
				</button>
				<button onClick={onNext} className='rounded bg-accent px-4 py-2 text-white'>
					<IconCheck className='inline' /> Done, verify install
				</button>
			</div>
		</div>
	)
}
