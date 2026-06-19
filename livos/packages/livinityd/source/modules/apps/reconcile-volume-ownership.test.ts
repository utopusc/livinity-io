import {describe, it, expect} from 'vitest'

import {
	resolveServiceUidGid,
	classifyVolumeEntry,
	expandVolumeTokens,
	namedVolumeRuntimeName,
} from './reconcile-volume-ownership.js'

describe('namedVolumeRuntimeName', () => {
	it('formats the docker-compose runtime volume name as `${project}_${key}`', () => {
		expect(namedVolumeRuntimeName('n8n', 'n8n_data')).toBe('n8n_n8n_data')
		expect(namedVolumeRuntimeName('n8n-user-bruce', 'data')).toBe('n8n-user-bruce_data')
	})
})

describe('resolveServiceUidGid', () => {
	it('uses a numeric `user:` directive (uid only -> gid = uid)', () => {
		expect(resolveServiceUidGid({user: '927'}, undefined)).toEqual({uid: 927, gid: 927})
	})

	it('uses a numeric `user: uid:gid` directive', () => {
		expect(resolveServiceUidGid({user: '1001:1001'}, undefined)).toEqual({uid: 1001, gid: 1001})
	})

	it('defaults to 1000 when `user:` is a NAME (not numeric)', () => {
		expect(resolveServiceUidGid({user: 'node'}, undefined)).toEqual({uid: 1000, gid: 1000})
	})

	it('skips (null) when no `user:` and image Config.User is empty (root)', () => {
		expect(resolveServiceUidGid({}, '')).toBeNull()
	})

	it('falls back to numeric image Config.User when no `user:`', () => {
		expect(resolveServiceUidGid({}, '1000')).toEqual({uid: 1000, gid: 1000})
	})

	it('defaults to 1000 when image Config.User is a NAME', () => {
		expect(resolveServiceUidGid({}, 'postgres')).toEqual({uid: 1000, gid: 1000})
	})

	it('uses a numeric uid:gid image Config.User', () => {
		expect(resolveServiceUidGid({}, '5001:5001')).toEqual({uid: 5001, gid: 5001})
	})

	it('skips (null) when `user: 0` (root)', () => {
		expect(resolveServiceUidGid({user: '0'}, undefined)).toBeNull()
	})

	it('skips (null) when no `user:` and no image info at all', () => {
		expect(resolveServiceUidGid({}, undefined)).toBeNull()
	})
})

describe('classifyVolumeEntry', () => {
	const named = new Set(['n8n_data'])
	const appDataDir = '/opt/livos/data/app-data/n8n'

	it('classifies a top-level named volume reference', () => {
		expect(classifyVolumeEntry('n8n_data:/home/node/.n8n', named, appDataDir)).toEqual({kind: 'named', key: 'n8n_data'})
	})

	it('classifies a bind under the app data dir', () => {
		expect(classifyVolumeEntry('/opt/livos/data/app-data/n8n/data:/x', named, appDataDir)).toEqual({
			kind: 'bind',
			hostPath: '/opt/livos/data/app-data/n8n/data',
		})
	})

	it('skips a system path (docker.sock)', () => {
		expect(classifyVolumeEntry('/var/run/docker.sock:/var/run/docker.sock', named, appDataDir)).toEqual({kind: 'skip'})
	})

	it('skips a bind OUTSIDE the app data dir', () => {
		expect(classifyVolumeEntry('/some/other/path:/x', named, appDataDir)).toEqual({kind: 'skip'})
	})

	it('classifies a long-form named volume', () => {
		expect(classifyVolumeEntry({type: 'volume', source: 'n8n_data', target: '/x'}, named, appDataDir)).toEqual({
			kind: 'named',
			key: 'n8n_data',
		})
	})
})

describe('expandVolumeTokens', () => {
	const dataDir = '/opt/livos/data/app-data/n8n'
	const rootDir = '/opt/livos/data'

	it('expands ${APP_DATA_DIR} then classifies as a bind (not skip)', () => {
		const expanded = expandVolumeTokens('${APP_DATA_DIR}/data:/home/node/.n8n', dataDir, rootDir)
		expect(expanded).toBe('/opt/livos/data/app-data/n8n/data:/home/node/.n8n')
		expect(classifyVolumeEntry(expanded, new Set(), dataDir)).toEqual({
			kind: 'bind',
			hostPath: '/opt/livos/data/app-data/n8n/data',
		})
	})

	it('expands ${UMBREL_ROOT} and ${LIVINITY_ROOT}', () => {
		expect(expandVolumeTokens('${UMBREL_ROOT}/x:/y', dataDir, rootDir)).toBe('/opt/livos/data/x:/y')
		expect(expandVolumeTokens('${LIVINITY_ROOT}/x:/y', dataDir, rootDir)).toBe('/opt/livos/data/x:/y')
	})

	it('leaves a named-volume entry (no token) unchanged', () => {
		expect(expandVolumeTokens('n8n_data:/x', dataDir, rootDir)).toBe('n8n_data:/x')
	})

	it('returns a non-string entry as-is', () => {
		const obj = {type: 'volume', source: 'n8n_data', target: '/x'}
		expect(expandVolumeTokens(obj, dataDir, rootDir)).toBe(obj)
	})
})
