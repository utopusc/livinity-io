import Fuse from 'fuse.js'

/** Configuration for fuzzy search fields */
export interface SearchKey {
	name: string
	weight: number
}

const DEFAULT_FUSE_OPTIONS: Fuse.IFuseOptions<unknown> = {
	isCaseSensitive: false,
	shouldSort: true,
	threshold: 0.35,
	distance: 120,
	minMatchCharLength: 2,
	ignoreLocation: false,
	fieldNormWeight: 1,
}

/**
 * Create a reusable fuzzy search function over a collection.
 * Returns a function that accepts a query string and optional result limit.
 */
export function createSearch<T>(collection: T[], keys: SearchKey[]) {
	const index = new Fuse<T>(collection, {...DEFAULT_FUSE_OPTIONS, keys})

	return function search(query: string, maxResults = 60): T[] {
		const normalized = query.trim().replace(/\s+/g, ' ')
		if (!normalized) return collection.slice(0, maxResults)
		return index.search(normalized, {limit: maxResults}).map((r) => r.item)
	}
}
