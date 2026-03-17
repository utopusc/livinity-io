import {$} from 'execa'
import fse from 'fs-extra'

const CLOUDFLARED_SERVICE = 'livos-tunnel'
const CLOUDFLARED_SERVICE_PATH = `/etc/systemd/system/${CLOUDFLARED_SERVICE}.service`

export type TunnelStatus = {
	installed: boolean
	running: boolean
	token: string | null
}

/** Check if cloudflared binary is available */
export async function isCloudflaredInstalled(): Promise<boolean> {
	try {
		await $`which cloudflared`
		return true
	} catch {
		return false
	}
}

/** Get tunnel status */
export async function getTunnelStatus(): Promise<TunnelStatus> {
	const installed = await isCloudflaredInstalled()
	let running = false
	let token: string | null = null

	if (installed) {
		try {
			const result = await $`systemctl is-active ${CLOUDFLARED_SERVICE}`
			running = result.stdout.trim() === 'active'
		} catch {
			running = false
		}

		// Read token from service file
		try {
			if (await fse.pathExists(CLOUDFLARED_SERVICE_PATH)) {
				const content = await fse.readFile(CLOUDFLARED_SERVICE_PATH, 'utf8')
				const match = content.match(/--token\s+(\S+)/)
				if (match) token = match[1]
			}
		} catch {
			// ignore
		}
	}

	return {installed, running, token}
}

/** Configure and start cloudflared tunnel with the given token */
export async function configureTunnel(token: string): Promise<{success: boolean; error?: string}> {
	if (!(await isCloudflaredInstalled())) {
		return {success: false, error: 'cloudflared is not installed. Run the installer again.'}
	}

	try {
		// Write systemd service
		const serviceContent = `[Unit]
Description=LivOS Cloudflare Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
TimeoutStartSec=15
ExecStart=/usr/bin/cloudflared --no-autoupdate tunnel run --token ${token}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
`
		await fse.writeFile(CLOUDFLARED_SERVICE_PATH, serviceContent)
		await $`systemctl daemon-reload`
		await $`systemctl enable ${CLOUDFLARED_SERVICE}`
		await $`systemctl restart ${CLOUDFLARED_SERVICE}`

		// Wait a moment and verify
		await new Promise((r) => setTimeout(r, 3000))
		const result = await $`systemctl is-active ${CLOUDFLARED_SERVICE}`
		if (result.stdout.trim() !== 'active') {
			return {success: false, error: 'Tunnel service started but is not active. Check: journalctl -u livos-tunnel'}
		}

		return {success: true}
	} catch (error) {
		return {success: false, error: `Failed to configure tunnel: ${(error as Error).message}`}
	}
}

/** Stop and remove tunnel */
export async function removeTunnel(): Promise<void> {
	try {
		await $`systemctl stop ${CLOUDFLARED_SERVICE}`.catch(() => {})
		await $`systemctl disable ${CLOUDFLARED_SERVICE}`.catch(() => {})
		await fse.remove(CLOUDFLARED_SERVICE_PATH).catch(() => {})
		await $`systemctl daemon-reload`
	} catch {
		// ignore errors during cleanup
	}
}
