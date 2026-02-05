import {exec} from 'node:child_process'
import {promisify} from 'node:util'

const execAsync = promisify(exec)

// ─── Firewall Utility ────────────────────────────────────────────
// Ensures ports 80 and 443 are open for Caddy/Let's Encrypt.
// Supports UFW (Ubuntu/Debian) and iptables (fallback).
// ─────────────────────────────────────────────────────────────────

interface FirewallResult {
	success: boolean
	method: 'ufw' | 'iptables' | 'none'
	message: string
}

/**
 * Check if a command exists on the system.
 */
async function commandExists(cmd: string): Promise<boolean> {
	try {
		await execAsync(`command -v ${cmd}`)
		return true
	} catch {
		return false
	}
}

/**
 * Check if UFW is active.
 */
async function isUfwActive(): Promise<boolean> {
	try {
		const {stdout} = await execAsync('ufw status')
		return stdout.includes('Status: active')
	} catch {
		return false
	}
}

/**
 * Open ports 80 and 443 using UFW.
 */
async function openPortsUfw(): Promise<void> {
	await execAsync('ufw allow 80/tcp')
	await execAsync('ufw allow 443/tcp')
	await execAsync('ufw reload')
}

/**
 * Open ports 80 and 443 using iptables.
 */
async function openPortsIptables(): Promise<void> {
	// Check if rules already exist to avoid duplicates
	try {
		const {stdout} = await execAsync('iptables -L INPUT -n')
		const has80 = stdout.includes('dpt:80')
		const has443 = stdout.includes('dpt:443')

		if (!has80) {
			await execAsync('iptables -I INPUT -p tcp --dport 80 -j ACCEPT')
		}
		if (!has443) {
			await execAsync('iptables -I INPUT -p tcp --dport 443 -j ACCEPT')
		}

		// Try to persist rules
		if (await commandExists('netfilter-persistent')) {
			await execAsync('netfilter-persistent save').catch(() => {})
		}
	} catch {
		// If listing fails, just try to add the rules
		await execAsync('iptables -I INPUT -p tcp --dport 80 -j ACCEPT').catch(() => {})
		await execAsync('iptables -I INPUT -p tcp --dport 443 -j ACCEPT').catch(() => {})
	}
}

/**
 * Ensure firewall allows ports 80 and 443 for HTTPS.
 * Automatically detects UFW or iptables and configures appropriately.
 */
export async function ensureFirewallPorts(): Promise<FirewallResult> {
	// Try UFW first (most common on Ubuntu/Debian)
	if (await commandExists('ufw')) {
		if (await isUfwActive()) {
			try {
				await openPortsUfw()
				return {
					success: true,
					method: 'ufw',
					message: 'Firewall ports 80/443 opened via UFW',
				}
			} catch (err) {
				return {
					success: false,
					method: 'ufw',
					message: `UFW error: ${err instanceof Error ? err.message : 'Unknown error'}`,
				}
			}
		}
	}

	// Fallback to iptables
	if (await commandExists('iptables')) {
		try {
			await openPortsIptables()
			return {
				success: true,
				method: 'iptables',
				message: 'Firewall ports 80/443 opened via iptables',
			}
		} catch (err) {
			return {
				success: false,
				method: 'iptables',
				message: `iptables error: ${err instanceof Error ? err.message : 'Unknown error'}`,
			}
		}
	}

	// No firewall detected
	return {
		success: true,
		method: 'none',
		message: 'No firewall detected, ports should be open',
	}
}

/**
 * Check if port 80 is accessible from outside.
 * Uses a simple TCP connection test.
 */
export async function checkPortAccessible(port: number): Promise<boolean> {
	try {
		// Use timeout to avoid hanging
		await execAsync(`timeout 5 bash -c "echo > /dev/tcp/localhost/${port}" 2>/dev/null`)
		return true
	} catch {
		return false
	}
}
