// Phase 92-01 stub — metadata-extractor.ts.
//
// Replaced in 92-08 with the full validate→cache→fetch→parse→resolve→cache
// pipeline. The stub exists so 92-01's module scaffold typechecks before the
// pure-function helpers (92-03..92-07) land.

export type MetadataResult = {
	title: string | null
	faviconUrl: string | null
	description: string | null
	ogImage: string | null
}

export async function extractMetadata(_args: {url: string; isAdmin: boolean}): Promise<MetadataResult> {
	throw new Error('extractMetadata not yet implemented (Phase 92-08)')
}
