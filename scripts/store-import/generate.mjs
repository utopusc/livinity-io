// CapRover + Coolify → Livinity Store import generator.
// Outputs: livinity-apps/apps/<slug>/manifest.json + out/sql/batch-*.sql + out/report.{json,md}
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
const yaml = createRequire(import.meta.url)('js-yaml')

const WS = process.cwd()
const COOLIFY_SHA = 'e7dff30'
const CAPROVER_SHA = 'bd357c9'
const IMPORT_DATE = '2026-07-02'
const PORT_BASE = 42000

const existing = new Set(JSON.parse(fs.readFileSync('existing-slugs.json', 'utf8')))
// Curated drops: templates that semantically require user input / platform magic
// (game servers with no web UI, licensed download URLs, external pairing IDs,
// COOLIFY_* runtime vars) — a generated default would produce a broken install.
const CURATED_DROP = new Set([
	'denokv', 'electricsql', 'foundryvtt', 'hatchet', 'newt-pangolin', 'palworld', 'satisfactory',
	// functional duplicate of the existing 'whoogle-search' catalog entry
	'whoogle',
])
// HEAD-checked 2026-07-02: these upstream logo files 404 → no icon_url (blank-tile guard)
const BAD_ICONS = new Set(['goatcounter', 'pgbackweb'])
const existingSquashed = new Set([...existing].map((s) => s.replace(/-/g, '')))

const skips = [] // {source, slug, reason}
const candidates = new Map() // slug -> candidate

const hex = (seed, n) => crypto.createHash('sha256').update(seed).digest('hex').slice(0, n)

function sanitizeSlug(raw) {
	let s = raw.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
	return s.length >= 2 && s.length <= 40 ? s : null
}

function isDupe(slug) {
	return existing.has(slug) || existingSquashed.has(slug.replace(/-/g, '')) || candidates.has(slug)
}

function isCuratedDrop(slug) {
	return CURATED_DROP.has(slug)
}

const FORBIDDEN = [
	[/privileged\s*:\s*true/i, 'privileged'],
	[/network_mode\s*:\s*["']?host/i, 'host-network'],
	[/pid\s*:\s*["']?host/i, 'host-pid'],
	[/\/var\/run\/docker\.sock/i, 'docker-sock'],
	[/cap_add/i, 'cap_add'],
	[/devices\s*:/i, 'devices'],
]

const CATEGORY_MAP = {
	// coolify category / keywords -> our live categories
	analytics: 'monitoring', monitoring: 'monitoring', dashboard: 'dashboards', dashboards: 'dashboards',
	database: 'developer-tools', databases: 'developer-tools', 'developer-tools': 'developer-tools',
	development: 'development', devops: 'developer-tools', git: 'development', cicd: 'developer-tools',
	media: 'media', video: 'media', music: 'media', photos: 'photography', gallery: 'photography',
	files: 'files', storage: 'cloud-storage', backup: 'files', sync: 'cloud-storage',
	communication: 'communication', chat: 'communication', email: 'communication', social: 'social',
	automation: 'automation', iot: 'automation', 'smart-home': 'automation',
	security: 'security', privacy: 'privacy', vpn: 'networking', network: 'networking', networking: 'networking', dns: 'networking', proxy: 'networking',
	productivity: 'productivity', notes: 'notes', wiki: 'notes', documents: 'productivity', cms: 'productivity', blog: 'productivity',
	finance: 'finance', accounting: 'finance', crm: 'productivity', erp: 'productivity', ecommerce: 'productivity',
	ai: 'ai', llm: 'ai', 'machine-learning': 'ai', bitcoin: 'bitcoin', crypto: 'crypto',
	games: 'media', gaming: 'media', rss: 'productivity', bookmarks: 'productivity', search: 'privacy',
}
function mapCategory(raw, textForKeywords) {
	if (raw && CATEGORY_MAP[String(raw).toLowerCase()]) return CATEGORY_MAP[String(raw).toLowerCase()]
	const t = (textForKeywords || '').toLowerCase()
	for (const [kw, cat] of Object.entries(CATEGORY_MAP)) {
		if (new RegExp(`\\b${kw.replace(/[-]/g, '[-\\s]')}\\b`).test(t)) return cat
	}
	return 'productivity'
}

function forbiddenHit(composeText) {
	for (const [re, name] of FORBIDDEN) if (re.test(composeText)) return name
	return null
}

const NON_MAIN_NAMES = /^(db|database|postgres|postgresql|mysql|mariadb|redis|valkey|mongo|mongodb|clickhouse|minio|rabbitmq|nats|memcached|elasticsearch|meilisearch|typesense|worker|cron|queue|migrate|init)/

// returns null on success, or a skip-reason string
function normalizeCompose(doc, {slug, mainService, internalPort, hostPort}) {
	const services = doc.services || {}
	for (const [name, svc] of Object.entries(services)) {
		if (!svc || typeof svc !== 'object') continue
		delete svc.ports
		delete svc.container_name // LivOS patchComposeFile forces its own legacy naming
		delete svc.labels
		delete svc.networks
		svc.restart = 'unless-stopped'
		for (const k of Object.keys(svc)) if (k.startsWith('x-') || k === 'caproverExtra' || k === 'exclude_from_hc') delete svc[k]
		// FQDN-line drops can leave empty sections behind
		for (const k of ['environment', 'volumes', 'depends_on', 'command']) {
			if (svc[k] === null || (Array.isArray(svc[k]) && svc[k].length === 0)) delete svc[k]
		}
		if (Array.isArray(svc.volumes)) {
			for (const v of svc.volumes) {
				// coolify file-content mounts are platform magic we can't reproduce
				if (v && typeof v === 'object' && ('content' in v || (v.type === 'bind' && v.content !== undefined))) return 'content-mount'
				if (v && typeof v === 'object') delete v.is_directory // coolify create-as-dir hint
			}
			// object-form bind mounts with relative sources → named volumes
			svc.volumes = svc.volumes.map((v) => {
				if (v && typeof v === 'object' && v.type === 'bind' && typeof v.source === 'string' && v.source.startsWith('./')) {
					const volName = (name + '-' + v.source.slice(2)).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '')
					return {type: 'volume', source: volName, target: v.target}
				}
				return v
			})
			for (const v of svc.volumes) {
				if (v && typeof v === 'object' && v.type === 'volume' && v.source) {
					doc.volumes = doc.volumes || {}
					if (!(v.source in doc.volumes)) doc.volumes[v.source] = null
				}
				if (v && typeof v === 'object' && v.type === 'bind' && typeof v.source === 'string' && v.source.startsWith('/')) return 'host-bind'
			}
			// bind mounts: './x' → named volume; then ensure every named-volume
			// reference is DECLARED top-level (coolify auto-creates; compose won't)
			svc.volumes = svc.volumes.map((v) => {
				if (typeof v === 'string' && v.startsWith('./')) {
					const tail = v.slice(2)
					const [src, ...rest] = tail.split(':')
					const volName = (name + '-' + src).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '')
					return [volName, ...rest].join(':')
				}
				return v
			})
			for (const v of svc.volumes) {
				if (typeof v === 'string' && !v.startsWith('/') && !v.startsWith('.')) {
					const src = v.split(':')[0]
					if (src && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(src)) {
						doc.volumes = doc.volumes || {}
						if (!(src in doc.volumes)) doc.volumes[src] = null
					}
				} else if (typeof v === 'string' && v.startsWith('/')) {
					return 'host-bind'
				}
			}
		}
	}
	if (services[mainService]) services[mainService].ports = [`${hostPort}:${internalPort}`]
	delete doc.networks
	delete doc.configs
	for (const k of Object.keys(doc)) if (k.startsWith('x-')) delete doc[k]
	if (doc.volumes) for (const k of Object.keys(doc.volumes)) if (doc.volumes[k] === undefined) doc.volumes[k] = null
	return null
}

// ── Coolify adapter ────────────────────────────────────────────────
function runCoolify() {
	const templates = JSON.parse(fs.readFileSync('coolify-service-templates.json', 'utf8'))
	for (const [key, entry] of Object.entries(templates)) {
		const slug = sanitizeSlug(key)
		if (!slug) { skips.push({source: 'coolify', slug: key, reason: 'bad-slug'}); continue }
		if (isDupe(slug)) { skips.push({source: 'coolify', slug, reason: 'duplicate'}); continue }
		if (isCuratedDrop(slug)) { skips.push({source: 'coolify', slug, reason: 'curated-drop'}); continue }
		let composeText
		try { composeText = Buffer.from(entry.compose, 'base64').toString('utf8') } catch { skips.push({source: 'coolify', slug, reason: 'b64-decode'}); continue }

		const fb = forbiddenHit(composeText)
		if (fb) { skips.push({source: 'coolify', slug, reason: 'forbidden:' + fb}); continue }
		if (/content\s*:\s*[|>]/.test(composeText) && /type\s*:\s*bind/.test(composeText)) { skips.push({source: 'coolify', slug, reason: 'content-mount'}); continue }
		if (/^\s*\/[a-z]/im.test(composeText) && /volumes:/.test(composeText) && /-\s+\/(etc|var|usr|opt|home|root|sys|proc)\b/.test(composeText)) { skips.push({source: 'coolify', slug, reason: 'host-bind'}); continue }

		// Find which service declares the FQDN (that's the web-facing main service)
		let mainService = null
		{
			let cur = null
			for (const line of composeText.split('\n')) {
				const svcM = line.match(/^  ([A-Za-z0-9._-]+):\s*$/)
				if (svcM) cur = svcM[1]
				if (/SERVICE_FQDN_|SERVICE_URL_/.test(line) && cur && !mainService) mainService = cur
			}
		}
		// Drop pure FQDN/URL declaration lines (coolify magic keys)
		composeText = composeText.split('\n').filter((l) => !/^\s*-\s*SERVICE_(FQDN|URL)_[A-Z0-9_]+(=[^=]*)?\s*$/.test(l)).join('\n')
		// Resolve magic secret/user vars to deterministic literals
		composeText = composeText
			.replace(/\$\{?SERVICE_PASSWORD_([A-Z0-9_]+)\}?/g, (_, v) => hex(slug + ':pw:' + v, 32))
			.replace(/\$\{?SERVICE_USER_([A-Z0-9_]+)\}?/g, (_, v) => 'u' + hex(slug + ':user:' + v, 10))
			.replace(/\$\{?SERVICE_(?:REAL)?BASE64(?:_\d+)?_([A-Z0-9_]+)\}?/g, (_, v) => Buffer.from(hex(slug + ':b64:' + v, 24)).toString('base64'))
			.replace(/\$\{?SERVICE_HEX(?:_\d+)?_([A-Z0-9_]+)\}?/g, (_, v) => hex(slug + ':hex:' + v, 32))
		// Remaining URL/FQDN references in VALUES → app needs its public URL baked → defer
		if (/SERVICE_(FQDN|URL)_/.test(composeText)) { skips.push({source: 'coolify', slug, reason: 'needs-url'}); continue }
		// Plain ${VAR} / ${VAR:?err} without a default would land EMPTY at install
		// (coolify's UI normally supplies these). Give every one a deterministic
		// default so the one-click rule holds: secret-ish names get generated
		// values, everything else gets a slug-derived literal. Consistent across
		// all occurrences within the app by construction.
		composeText = composeText.replace(/\$\{([A-Z][A-Z0-9_]*)(:\?[^}]*)?\}/g, (m, v, bad) => {
			if (m.includes(':-')) return m
			let def
			if (/PASSWORD|SECRET|KEY|TOKEN|PASS\b/.test(v)) def = hex(slug + ':def:' + v, 32)
			else if (/USER(NAME)?$/.test(v)) def = 'liv' + hex(slug + ':def:' + v, 8)
			else if (/(_DB|DATABASE|_NAME)$/.test(v)) def = slug.replace(/-/g, '_')
			else if (/EMAIL/.test(v)) def = `admin@${slug}.local`
			else if (/PORT$/.test(v)) return m // leave port vars; compose warns but they're usually internal defaults
			else def = ''
			return def === '' ? m : '${' + v + ':-' + def + '}'
		})

		let doc
		try { doc = yaml.load(composeText) } catch (e) { skips.push({source: 'coolify', slug, reason: 'yaml:' + String(e.message).slice(0, 60)}); continue }
		if (!doc || !doc.services || !Object.keys(doc.services).length) { skips.push({source: 'coolify', slug, reason: 'no-services'}); continue }

		const svcNames = Object.keys(doc.services)
		if (!mainService || !doc.services[mainService]) mainService = svcNames.find((n) => !NON_MAIN_NAMES.test(n)) || svcNames[0]
		const internalPort = parseInt(entry.port, 10) || 80

		// every service must have a pinned image
		let version = '1.0.0'
		let badImage = null
		for (const [n, svc] of Object.entries(doc.services)) {
			if (!svc.image) { badImage = 'no-image:' + n; break }
			if (n === mainService) {
				const tag = String(svc.image).split(':').pop()
				if (tag && !tag.includes('/')) version = tag.slice(0, 40)
			}
		}
		if (badImage) { skips.push({source: 'coolify', slug, reason: badImage}); continue }

		candidates.set(slug, {
			source: 'coolify', slug, doc, mainService, internalPort,
			name: key.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '),
			tagline: (entry.slogan || '').slice(0, 158),
			category: mapCategory(entry.category, (entry.tags || []).join(' ')),
			version,
			iconUrl: entry.logo && !BAD_ICONS.has(slug) ? `https://raw.githubusercontent.com/coollabsio/coolify/${COOLIFY_SHA}/public/${entry.logo}` : null,
			upstream: entry.documentation || null,
			importSource: `coolify@${COOLIFY_SHA}`,
		})
	}
}

// ── CapRover adapter ───────────────────────────────────────────────
function runCaprover() {
	const dir = 'one-click-apps/public/v4/apps'
	for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.yml'))) {
		const stem = file.replace(/\.yml$/, '')
		const slug = sanitizeSlug(stem)
		if (!slug) { skips.push({source: 'caprover', slug: stem, reason: 'bad-slug'}); continue }
		if (isDupe(slug)) { skips.push({source: 'caprover', slug, reason: 'duplicate'}); continue }
		let raw = fs.readFileSync(path.join(dir, file), 'utf8')
		if (/dockerfileLines/.test(raw)) { skips.push({source: 'caprover', slug, reason: 'dockerfile-build'}); continue }
		const fb = forbiddenHit(raw)
		if (fb) { skips.push({source: 'caprover', slug, reason: 'forbidden:' + fb}); continue }

		let meta
		try { meta = yaml.load(raw) } catch (e) { skips.push({source: 'caprover', slug, reason: 'yaml:' + String(e.message).slice(0, 60)}); continue }
		const oneClick = meta && meta.caproverOneClickApp
		const vars = (oneClick && oneClick.variables) || []
		// resolve variables → literal defaults (one-click rule); missing default → skip
		const resolved = {}
		let missing = null
		for (const v of vars) {
			let dv = v.defaultValue
			if (dv === undefined || dv === null || dv === '') { missing = v.id; break }
			dv = String(dv).replace(/\$\$cap_gen_random_hex\((\d+)\)/g, (_, n) => hex(slug + ':' + v.id, parseInt(n, 10)))
			resolved[v.id] = dv
		}
		if (missing) { skips.push({source: 'caprover', slug, reason: 'required-input:' + missing}); continue }

		let text = raw.replace(/\$\$cap_appname/g, slug)
		// longest ids first so $$cap_db_pass doesn't clobber $$cap_db_passwd
		for (const id of Object.keys(resolved).sort((a, b) => b.length - a.length)) {
			text = text.split(id).join(String(resolved[id]).replace(/\$/g, '$$'))
		}
		text = text.replace(/\$\$cap_gen_random_hex\((\d+)\)/g, (_, n) => hex(slug + ':inline', parseInt(n, 10)))
		if (/\$\$cap_/.test(text)) { skips.push({source: 'caprover', slug, reason: 'unresolved-var'}); continue }
		text = text.replace(/srv-captain--/g, '')

		let doc
		try { doc = yaml.load(text) } catch (e) { skips.push({source: 'caprover', slug, reason: 'yaml2:' + String(e.message).slice(0, 60)}); continue }
		if (!doc || !doc.services) { skips.push({source: 'caprover', slug, reason: 'no-services'}); continue }

		let mainService = null, internalPort = 80, version = '1.0.0'
		let badImage = null
		for (const [n, svc] of Object.entries(doc.services)) {
			if (!svc || !svc.image) { badImage = 'no-image:' + n; break }
			const extra = svc.caproverExtra || {}
			const notWeb = String(extra.notExposeAsWebApp || '').toLowerCase() === 'true'
			if (!notWeb && !mainService) {
				mainService = n
				internalPort = parseInt(extra.containerHttpPort, 10) || 80
				const tag = String(svc.image).split(':').pop()
				if (tag && !tag.includes('/')) version = tag.slice(0, 40)
			}
		}
		if (badImage) { skips.push({source: 'caprover', slug, reason: badImage}); continue }
		if (!mainService) { skips.push({source: 'caprover', slug, reason: 'no-web-service'}); continue }

		delete doc.caproverOneClickApp
		delete doc.captainVersion

		const displayName = (oneClick && oneClick.displayName) || stem.split(/[-_]/).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
		const startTxt = (oneClick && oneClick.instructions && oneClick.instructions.start) || ''
		candidates.set(slug, {
			source: 'caprover', slug, doc, mainService, internalPort,
			name: String(displayName).slice(0, 120),
			tagline: startTxt.replace(/\s+/g, ' ').slice(0, 158),
			category: mapCategory(null, stem + ' ' + startTxt),
			version,
			iconUrl: `https://raw.githubusercontent.com/caprover/one-click-apps/${CAPROVER_SHA}/public/v4/logos/${stem}.png`,
			upstream: null,
			importSource: `caprover@${CAPROVER_SHA}`,
		})
	}
}

runCoolify()
runCaprover()

// ── Port allocation (deterministic: sorted slugs from PORT_BASE) ───
const finalSlugs = [...candidates.keys()].sort()
const portOf = new Map(finalSlugs.map((s, i) => [s, PORT_BASE + i]))

// ── Emit manifests + SQL ───────────────────────────────────────────
fs.rmSync('livinity-apps/apps', {recursive: true, force: true})
fs.mkdirSync('livinity-apps/apps', {recursive: true})
fs.mkdirSync('out/sql', {recursive: true})
fs.mkdirSync('out/compose', {recursive: true})

const sqlEsc = (s) => String(s).replace(/'/g, "''")
const rows = []
for (const slug of finalSlugs) {
	const c = candidates.get(slug)
	const hostPort = portOf.get(slug)
	const normErr = normalizeCompose(c.doc, {slug, mainService: c.mainService, internalPort: c.internalPort, hostPort})
	if (normErr) { skips.push({source: c.source, slug, reason: normErr}); candidates.delete(slug); continue }
	const composeYaml = yaml.dump(c.doc, {lineWidth: 200, noRefs: true})
	if (composeYaml.length > 59000) { skips.push({source: c.source, slug, reason: 'compose-too-large'}); candidates.delete(slug); continue }
	const description = [
		c.tagline || c.name,
		'',
		c.upstream ? `Docs: ${c.upstream}` : null,
		'',
		`_Template derived from ${c.importSource.startsWith('coolify') ? 'coollabsio/coolify' : 'caprover/one-click-apps'} (${c.importSource}, Apache-2.0). Default credentials are generated per-app — check the compose environment values._`,
	].filter((x) => x !== null).join('\n')
	const manifest = {
		slug, name: c.name, section: 'app',
		tagline: c.tagline, description,
		category: c.category, version: c.version,
		port: hostPort, subdomain: slug, env: [],
		internalPort: c.internalPort, mainService: c.mainService,
		importSource: c.importSource, importedAt: IMPORT_DATE,
		icon_url: c.iconUrl,
		docker_compose: composeYaml,
	}
	fs.mkdirSync(`livinity-apps/apps/${slug}`, {recursive: true})
	fs.writeFileSync(`livinity-apps/apps/${slug}/manifest.json`, JSON.stringify(manifest, null, 1))
	fs.writeFileSync(`out/compose/${slug}.yml`, composeYaml)
	const dbManifest = {...manifest}
	delete dbManifest.docker_compose // compose lives in its own column; keep jsonb lean
	rows.push(
		`('${sqlEsc(slug)}','${sqlEsc(c.name)}','app','${sqlEsc(c.tagline)}','${sqlEsc(description)}','${sqlEsc(c.category)}','${sqlEsc(c.version)}','${sqlEsc(composeYaml)}','${sqlEsc(JSON.stringify(dbManifest))}'::jsonb,${c.iconUrl ? `'${sqlEsc(c.iconUrl)}'` : 'NULL'},false,false,500)`,
	)
}

const BATCH = 8
for (let i = 0; i < rows.length; i += BATCH) {
	const chunk = rows.slice(i, i + BATCH)
	const sql = `INSERT INTO apps (slug,name,section,tagline,description,category,version,docker_compose,manifest,icon_url,featured,verified,sort_order) VALUES\n${chunk.join(',\n')}\nON CONFLICT (slug) DO NOTHING;`
	fs.writeFileSync(`out/sql/batch-${String(Math.floor(i / BATCH) + 1).padStart(3, '0')}.sql`, sql)
}

const report = {
	generated: finalSlugs.filter((s) => candidates.has(s)).length,
	bySource: {coolify: [...candidates.values()].filter((c) => c.source === 'coolify').length, caprover: [...candidates.values()].filter((c) => c.source === 'caprover').length},
	skipped: skips.length,
	skipReasons: skips.reduce((a, s) => ((a[s.reason.split(':')[0]] = (a[s.reason.split(':')[0]] || 0) + 1), a), {}),
	portRange: [PORT_BASE, PORT_BASE + finalSlugs.length - 1],
	sqlBatches: Math.ceil(rows.length / BATCH),
}
fs.writeFileSync('out/report.json', JSON.stringify({report, skips}, null, 1))
console.log(JSON.stringify(report, null, 1))
