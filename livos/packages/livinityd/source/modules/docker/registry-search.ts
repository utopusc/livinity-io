// Phase 29 Plan 29-02 — Registry image search (DOC-16).
//
// Two paths:
//   - PUBLIC (no registryId): Docker Hub /v2/search/repositories — anonymous,
//     no auth header. Rate-limited by Docker Hub (~25 req/min/IP).
//   - PRIVATE (registryId): decrypt credential, hit `${registryUrl}/v2/_catalog`
//     with `Authorization: Basic base64(user:pass)`. Filter results by query
//     substring client-side (the catalog endpoint is not searchable).
//
// Threat model (T-29-13/15): query.slice(0,200) cap before fetch + 30s
// AbortController timeout. T-29-12: Docker Hub public path is intentional —
// no LivOS-side info disclosed.

import {decryptCredentialData} from './registry-credentials.js'

export interface RegistrySearchResult {
	name: string
	description: string
	starCount: number
	official: boolean
	automated: boolean
	source: 'docker-hub' | 'private'
	pullableRef: string // image ref usable in `docker pull`
}

const DOCKER_HUB_SEARCH = 'https://hub.docker.com/v2/search/repositories'
const TIMEOUT_MS = 30_000

function abortable(): {signal: AbortSignal; cancel: () => void} {
	const ctrl = new AbortController()
	const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
	return {signal: ctrl.signal, cancel: () => clearTimeout(t)}
}

/**
 * Strip protocol + trailing slash from a registry_url so we can build a
 * pullable ref like `registry.example.com/repo:tag`.
 */
function registryHost(registryUrl: string): string {
	try {
		const u = new URL(registryUrl)
		return u.host
	} catch {
		// Last-ditch — strip leading scheme manually
		return registryUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')
	}
}

export async function searchImages(opts: {
	query: string
	registryId?: string | null
}): Promise<RegistrySearchResult[]> {
	// T-29-13 query length cap (sliced BEFORE encode/fetch)
	const q = opts.query.slice(0, 200).trim()
	if (q.length === 0) return []

	if (!opts.registryId) {
		return await searchDockerHub(q)
	}
	return await searchPrivateRegistry(q, opts.registryId)
}

async function searchDockerHub(q: string): Promise<RegistrySearchResult[]> {
	const url = `${DOCKER_HUB_SEARCH}?query=${encodeURIComponent(q)}&page_size=25`
	const {signal, cancel} = abortable()
	let res: Response
	try {
		res = await fetch(url, {signal})
	} catch (err: any) {
		throw new Error(`[search-failed] ${err?.message ?? 'unknown'}`)
	} finally {
		cancel()
	}
	if (!res.ok) {
		throw new Error(`[search-failed] Docker Hub returned ${res.status}`)
	}
	let body: any
	try {
		body = await res.json()
	} catch (err: any) {
		throw new Error(`[search-failed] invalid Docker Hub JSON`)
	}
	const results: any[] = Array.isArray(body?.results) ? body.results : []
	return results.map((r) => ({
		name: r.repo_name ?? r.name ?? '',
		description: r.short_description ?? r.description ?? '',
		starCount: typeof r.star_count === 'number' ? r.star_count : 0,
		official: Boolean(r.is_official),
		automated: Boolean(r.is_automated),
		source: 'docker-hub' as const,
		pullableRef: r.repo_name ?? r.name ?? '',
	}))
}

async function searchPrivateRegistry(
	q: string,
	registryId: string,
): Promise<RegistrySearchResult[]> {
	const cred = await decryptCredentialData(registryId)
	if (!cred) {
		throw new Error(`[credential-not-found] ${registryId}`)
	}
	const auth = Buffer.from(`${cred.username}:${cred.password}`).toString('base64')
	const base = cred.registryUrl.replace(/\/+$/, '')
	const url = `${base}/v2/_catalog?n=25`
	const {signal, cancel} = abortable()
	let res: Response
	try {
		res = await fetch(url, {
			signal,
			headers: {Authorization: `Basic ${auth}`},
		})
	} catch (err: any) {
		throw new Error(`[search-failed] ${err?.message ?? 'unknown'}`)
	} finally {
		cancel()
	}
	if (res.status === 401 || res.status === 403) {
		throw new Error(`[auth-failed] check credential username/password`)
	}
	if (!res.ok) {
		throw new Error(`[search-failed] registry returned ${res.status}`)
	}
	let body: any
	try {
		body = await res.json()
	} catch (err: any) {
		throw new Error(`[search-failed] invalid registry JSON`)
	}
	const repos: string[] = Array.isArray(body?.repositories) ? body.repositories : []
	const filtered = repos.filter((r) => r.toLowerCase().includes(q.toLowerCase()))
	const host = registryHost(cred.registryUrl)
	return filtered.map((repo) => ({
		name: repo,
		description: '',
		starCount: 0,
		official: false,
		automated: false,
		source: 'private' as const,
		pullableRef: `${host}/${repo}`,
	}))
}
