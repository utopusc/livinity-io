/**
 * Schema validation test for the Plan 43-03 MiroFish manifest draft.
 * Catches manifest typos / schema violations BEFORE the operator copies
 * the draft to the sibling repo `utopusc/livinity-apps`.
 */

import {expect, test} from 'vitest'
import path from 'node:path'
import fse from 'fs-extra'
import yaml from 'js-yaml'

import {AppManifestSchema} from './schema.js'

// Resolve relative to the repo root (vitest cwd is the package; walk up to repo root)
const draftPath = path.resolve(
	process.cwd(),
	'../../../.planning/phases/43-marketplace-integration-anchor-mirofish/draft-mirofish-manifest/livinity-app.yml',
)

test('Plan 43-03 MiroFish manifest passes AppManifestSchema validation', async () => {
	const raw = await fse.readFile(draftPath, 'utf8')
	const parsed = yaml.load(raw) as any
	const result = AppManifestSchema.safeParse(parsed)
	if (!result.success) {
		throw new Error(
			`Schema validation failed: ${JSON.stringify(result.error.issues, null, 2)}`,
		)
	}
	expect(result.data.id).toBe('mirofish')
	expect(result.data.requiresAiProvider).toBe(true)
	expect(result.data.gallery).toBeDefined()
})

test('Plan 43-03 MiroFish manifest has all FR-MARKET-02-required fields', async () => {
	const raw = await fse.readFile(draftPath, 'utf8')
	const parsed = yaml.load(raw) as any
	expect(parsed.id).toBe('mirofish')
	expect(parsed.name).toBe('MiroFish')
	expect(parsed.requiresAiProvider).toBe(true)
	expect(typeof parsed.port).toBe('number')
	expect(parsed.repo).toMatch(/^https:\/\//)
})
