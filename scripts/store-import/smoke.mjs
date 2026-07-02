// Local smoke-test: up -d → poll container states (healthy/running) → HTTP probe → down -v
import {execSync, exec} from 'node:child_process'
import fs from 'node:fs'

const APPS = process.argv.slice(2)
const results = []

const sh = (cmd) => execSync(cmd, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim()

for (const slug of APPS) {
	const file = `out/compose/${slug}.yml`
	const m = JSON.parse(fs.readFileSync(`livinity-apps/apps/${slug}/manifest.json`, 'utf8'))
	const proj = `smoke-${slug}`
	let verdict = 'unknown', http = null, detail = ''
	try {
		execSync(`docker compose -f ${file} -p ${proj} up -d --quiet-pull`, {stdio: ['ignore', 'ignore', 'pipe'], timeout: 420_000})
		const deadline = Date.now() + 120_000
		let states = []
		while (Date.now() < deadline) {
			const out = sh(`docker compose -f ${file} -p ${proj} ps --format json`)
			states = out.split('\n').filter(Boolean).map((l) => JSON.parse(l))
			const bad = states.find((s) => ['exited', 'dead'].includes(s.State))
			const unhealthy = states.find((s) => s.Health === 'unhealthy')
			const allGood = states.length && states.every((s) => s.State === 'running' && (s.Health === '' || s.Health === 'healthy' || s.Health === undefined))
			if (bad) { verdict = 'failed'; detail = bad.Service + '=' + bad.State; break }
			if (unhealthy) { verdict = 'unhealthy'; detail = unhealthy.Service; break }
			if (allGood) { verdict = 'running'; break }
			await new Promise((r) => setTimeout(r, 4000))
		}
		if (verdict === 'unknown') verdict = 'timeout:' + states.map((s) => s.Service + '=' + s.State + '/' + (s.Health || '-')).join(',')
		if (verdict === 'running') {
			// HTTP probe on the published port — any HTTP status = the daemon answers
			for (let i = 0; i < 10 && http === null; i++) {
				try {
					const res = await fetch(`http://127.0.0.1:${m.port}/`, {redirect: 'manual', signal: AbortSignal.timeout(4000)})
					http = res.status
				} catch { await new Promise((r) => setTimeout(r, 3000)) }
			}
		}
	} catch (e) {
		verdict = 'up-failed'
		detail = String(e.message).slice(0, 120)
	} finally {
		try { execSync(`docker compose -f ${file} -p ${proj} down -v --remove-orphans`, {stdio: 'ignore', timeout: 120_000}) } catch {}
	}
	results.push({slug, verdict, http, detail})
	console.log(`${slug}: ${verdict}${http !== null ? ' http=' + http : ''}${detail ? ' (' + detail + ')' : ''}`)
}
fs.writeFileSync('out/smoke-results.json', JSON.stringify(results, null, 1))
