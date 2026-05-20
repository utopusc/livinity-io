/**
 * Phase 169-02 — Graph builder.
 *
 * `buildGraph(files)` produces a `{nodes, edges}` graph from a `VaultFile[]`
 * snapshot (typically the output of `walkVault()` from 169-01).
 *
 *  - Nodes are 1:1 with VaultFile entries (every file becomes one node).
 *  - `id` = file path (relative, forward-slash); `label` = basename without `.md`.
 *  - Wikilink edges are built by resolving the link target against a fixed
 *    candidate path table (matches the on-disk vault layout in
 *    `/home/bruce/livinity-vault/`). Unresolved links are silently dropped —
 *    they would otherwise spawn orphan nodes that pollute the graph (see
 *    169-CONTEXT.md L161).
 *  - Directory edges are NOT built in v1 (deferred to v35.1).
 *
 * No I/O. Pure transform. All threat mitigations are upstream in walker.ts
 * (paths already relative + tombstones already excluded).
 */

import path from 'node:path'

import type {VaultFile} from './walker.js'
import {extractTags} from './parser.js'

export interface GraphNode {
	id: string
	label: string
	type: VaultFile['type']
	size: number
	mtime: number
	tags: string[]    // Phase 179-01: parsed from frontmatter YAML
	topDir: string    // Phase 179-01: first path segment
	degree: number    // Phase 187-01: total edge count (in + out, all types)
	wikiDegree: number  // Phase 187-01: wikilink-type edge count only
}

export interface GraphEdge {
	source: string
	target: string
	type: 'wikilink' | 'directory'
}

export function buildGraph(
	files: VaultFile[],
): {nodes: GraphNode[]; edges: GraphEdge[]} {
	const nodes: GraphNode[] = files.map((f) => ({
		id: f.path,
		label: path.basename(f.path, '.md'),
		type: f.type,
		size: f.size,
		mtime: f.mtime,
		tags: extractTags(f.frontmatter), // Phase 179-01 addition
		topDir: f.topDir,                 // Phase 179-01 addition
		degree: 0,                         // Phase 187-01: computed below
		wikiDegree: 0,                     // Phase 187-01: computed below
	}))

	const nodeIds = new Set(nodes.map((n) => n.id))
	const edges: GraphEdge[] = []

	for (const file of files) {
		for (const link of file.wikilinks) {
			// Candidate resolution order matches the vault layout — `memory/<link>.md`
			// is checked before bare `<link>.md` so wikilinks to memory entries
			// resolve correctly when authors omit the directory prefix.
			const targetCandidates = [
				`memory/${link}.md`,
				`memory/feedback/${link}.md`,
				`memory/projects/${link}.md`,
				`memory/references/${link}.md`,
				`memory/user/${link}.md`,
				`${link}.md`,
			]
			const target = targetCandidates.find((c) => nodeIds.has(c))
			if (target) {
				edges.push({source: file.path, target, type: 'wikilink'})
			}
			// Unresolved link: silently dropped (avoid orphan node spam — 169-CONTEXT L161).
		}
	}

	// Phase 187-01: degree + wikiDegree computation (additive post-edge pass).
	// Builds a degree map from the edge list and patches nodes in-place.
	const nodeMap = new Map<string, GraphNode>()
	for (const n of nodes) nodeMap.set(n.id, n)
	for (const e of edges) {
		const src = nodeMap.get(e.source)
		const tgt = nodeMap.get(e.target)
		if (src) {
			src.degree++
			if (e.type === 'wikilink') src.wikiDegree++
		}
		if (tgt) {
			tgt.degree++
			if (e.type === 'wikilink') tgt.wikiDegree++
		}
	}

	return {nodes, edges}
}
