import type Livinityd from '../index.js'
import {$} from 'execa'
import fse from 'fs-extra'
import {escapeSpecialRegExpLiterals} from './utilities/regexp.js'

// Override hostname used in development
export async function overrideDevelopmentHostname(livinityd: Livinityd, hostname: string) {
	try {
		// Update static hostname and hosts mapping
		await fse.writeFile('/etc/hostname', `${hostname}\n`)
		const etcHosts = await fse.readFile('/etc/hosts', 'utf8')
		const hostnameInEtcHostsRe = new RegExp(
			`^\\s*${escapeSpecialRegExpLiterals('127.0.0.1')}\\s+${escapeSpecialRegExpLiterals(hostname)}\\s*$`,
			'm',
		)
		if (!hostnameInEtcHostsRe.test(etcHosts)) {
			await fse.writeFile('/etc/hosts', `${etcHosts.trimEnd()}\n127.0.0.1       ${hostname}\n`)
		}
		// Apply new hostname
		await $`hostname ${hostname}`
		// Restart hostname-dependent services
		await $`systemctl restart avahi-daemon`
		livinityd.logger.log(`Applied development hostname '${hostname}'`)
		return true
	} catch (error) {
		livinityd.logger.error(`Failed to apply development hostname`, error)
	}
	return false
}
