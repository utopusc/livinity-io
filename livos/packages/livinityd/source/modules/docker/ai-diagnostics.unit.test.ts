// Phase 23 (AID-01/03/04) — ai-diagnostics pure-function unit tests.
//
// Covers the redaction utility, payload builder, and the two response
// parsers (diagnose / compose). The Kimi-bound integration paths
// (callKimi, diagnoseContainer, generateComposeFromPrompt,
// explainVulnerabilities) are exercised end-to-end on the server in the
// Phase 23 manual smoke checklist; they're skipped here because they
// depend on a live nexus-core + Kimi auth.

import {describe, expect, test} from 'vitest'

import {
	redactSecrets,
	buildContainerDiagnosticPayload,
	parseDiagnosticResponse,
	parseComposeResponse,
} from './ai-diagnostics.js'

// ---------------------------------------------------------------------------
// redactSecrets
// ---------------------------------------------------------------------------

describe('redactSecrets', () => {
	test('redacts KEY=value patterns for secret-like keys', () => {
		const input = [
			'POSTGRES_PASSWORD=hunter2',
			'API_KEY=sk-abc123',
			'DB_TOKEN=xyz',
			'MY_SECRET=foo',
			'PRIVATE_KEY=----BEGIN----',
			'CREDENTIAL=admin:admin',
			'AWS_ACCESS_KEY=AKIA...',
			'PASSWD=qwerty',
			'PWD=root',
		].join('\n')

		const out = redactSecrets(input)

		expect(out).toContain('POSTGRES_PASSWORD=[REDACTED]')
		expect(out).toContain('API_KEY=[REDACTED]')
		expect(out).toContain('DB_TOKEN=[REDACTED]')
		expect(out).toContain('MY_SECRET=[REDACTED]')
		expect(out).toContain('PRIVATE_KEY=[REDACTED]')
		expect(out).toContain('CREDENTIAL=[REDACTED]')
		expect(out).toContain('AWS_ACCESS_KEY=[REDACTED]')
		expect(out).toContain('PASSWD=[REDACTED]')
		expect(out).toContain('PWD=[REDACTED]')

		// no plaintext values
		expect(out).not.toContain('hunter2')
		expect(out).not.toContain('sk-abc123')
		expect(out).not.toContain('xyz')
		expect(out).not.toContain('AKIA...')
	})

	test('does not touch non-secret keys', () => {
		const input = ['LOG_LEVEL=debug', 'PORT=8080', 'NODE_ENV=production'].join('\n')
		const out = redactSecrets(input)
		expect(out).toBe(input)
	})

	test('redacts JSON-shaped secret values', () => {
		const input = '{"password":"foo","api_key":"bar","name":"alice"}'
		const out = redactSecrets(input)
		expect(out).toContain('"password":"[REDACTED]"')
		expect(out).toContain('"api_key":"[REDACTED]"')
		expect(out).toContain('"name":"alice"') // non-secret untouched
		expect(out).not.toContain('"foo"')
		expect(out).not.toContain('"bar"')
	})

	test('is idempotent — applying twice produces identical output', () => {
		const input = [
			'POSTGRES_PASSWORD=hunter2',
			'API_KEY=sk-123',
			'LOG_LEVEL=debug',
			'{"token":"abc"}',
		].join('\n')
		const once = redactSecrets(input)
		const twice = redactSecrets(once)
		expect(twice).toBe(once)
	})

	test('handles empty input', () => {
		expect(redactSecrets('')).toBe('')
	})
})

// ---------------------------------------------------------------------------
// buildContainerDiagnosticPayload
// ---------------------------------------------------------------------------

describe('buildContainerDiagnosticPayload', () => {
	const stats = {
		cpuPercent: 12.5,
		memoryUsage: 524_288_000, // 500 MB
		memoryLimit: 1_073_741_824, // 1 GB
		memoryPercent: 48.83,
		networkRx: 1_536_000, // 1500 KB
		networkTx: 768_000, // 750 KB
		pids: 5,
	}

	const inspectInfo = {
		id: 'abc123def456',
		name: 'mycontainer',
		image: 'nginx:1.21',
		state: 'running',
		status: 'running',
		created: '2026-04-24T00:00:00Z',
		platform: 'linux/amd64',
		restartPolicy: 'unless-stopped',
		restartCount: 2,
		healthStatus: 'healthy',
		ports: [],
		volumes: [],
		envVars: [],
		networks: [],
		mounts: [],
	}

	test('redacts logs and converts memory/network units', () => {
		const logs = 'POSTGRES_PASSWORD=hunter2\n[INFO] starting up\n'
		const out = buildContainerDiagnosticPayload({logs, stats, inspectInfo})

		expect(out.logsTrimmed).toContain('POSTGRES_PASSWORD=[REDACTED]')
		expect(out.logsTrimmed).not.toContain('hunter2')
		expect(out.logsTrimmed).toContain('[INFO] starting up')

		expect(out.stats.cpuPercent).toBe(12.5)
		expect(out.stats.memoryUsageMb).toBeCloseTo(500.0, 1)
		expect(out.stats.memoryLimitMb).toBeCloseTo(1024.0, 1)
		expect(out.stats.memoryPercent).toBe(48.83)
		expect(out.stats.networkRxKb).toBeCloseTo(1500.0, 1)
		expect(out.stats.networkTxKb).toBeCloseTo(750.0, 1)
		expect(out.stats.pids).toBe(5)

		expect(out.container.state).toBe('running')
		expect(out.container.restartCount).toBe(2)
		expect(out.container.healthStatus).toBe('healthy')
		expect(out.container.image).toBe('nginx:1.21')
	})

	test('handles null healthStatus and missing exitCode gracefully', () => {
		const out = buildContainerDiagnosticPayload({
			logs: 'no errors',
			stats,
			inspectInfo: {...inspectInfo, healthStatus: null},
		})
		expect(out.container.healthStatus).toBeNull()
		// exitCode should be present (null or number) regardless
		expect('exitCode' in out.container).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// parseDiagnosticResponse
// ---------------------------------------------------------------------------

describe('parseDiagnosticResponse', () => {
	test('extracts the three sections from a clean response', () => {
		const raw = [
			'Likely cause: The container ran out of memory and was killed by the OOM reaper.',
			'Suggested action: Increase memory limit to 2g or investigate memory leak in app.js.',
			'Confidence: high',
		].join('\n')

		const out = parseDiagnosticResponse(raw)
		expect(out.likelyCause).toContain('out of memory')
		expect(out.suggestedAction).toContain('Increase memory limit')
		expect(out.confidence).toBe('high')
	})

	test('handles markdown headers and uppercase variants', () => {
		const raw = [
			'## Likely Cause',
			'Database connection refused.',
			'## Suggested Action',
			'Verify postgres host is reachable.',
			'## CONFIDENCE',
			'MEDIUM',
		].join('\n')

		const out = parseDiagnosticResponse(raw)
		expect(out.likelyCause).toContain('Database connection refused')
		expect(out.suggestedAction).toContain('postgres')
		expect(out.confidence).toBe('medium')
	})

	test('returns empty strings and unknown confidence for missing sections', () => {
		const out = parseDiagnosticResponse('Random text with no labels')
		expect(out.likelyCause).toBe('')
		expect(out.suggestedAction).toBe('')
		expect(out.confidence).toBe('unknown')
	})

	test('clamps unrecognised confidence values to unknown', () => {
		const raw =
			'Likely cause: Foo.\nSuggested action: Bar.\nConfidence: extremely-high-omg'
		const out = parseDiagnosticResponse(raw)
		expect(out.confidence).toBe('unknown')
	})
})

// ---------------------------------------------------------------------------
// parseComposeResponse
// ---------------------------------------------------------------------------

describe('parseComposeResponse', () => {
	test('extracts contents of a fenced ```yaml ... ``` block', () => {
		const raw = [
			'Here is your compose file:',
			'',
			'```yaml',
			"version: '3.8'",
			'services:',
			'  web:',
			'    image: nginx:1.27-alpine',
			'```',
			'',
			'Save this as docker-compose.yml.',
		].join('\n')

		const out = parseComposeResponse(raw)
		expect(out.yaml).toContain('services:')
		expect(out.yaml).toContain('nginx:1.27-alpine')
		expect(out.yaml).not.toContain('```')
		expect(out.yaml).not.toContain('Here is your compose file')
		expect(out.warnings).toEqual([])
	})

	test('also accepts ```yml fences', () => {
		const raw = ['```yml', 'services:', '  app:', '    image: alpine:3.19', '```'].join('\n')
		const out = parseComposeResponse(raw)
		expect(out.yaml).toContain('alpine:3.19')
		expect(out.warnings).toEqual([])
	})

	test('falls back to heuristic and warns when no fence present', () => {
		const raw = ["version: '3.8'", 'services:', '  redis:', '    image: redis:7-alpine'].join(
			'\n',
		)
		const out = parseComposeResponse(raw)
		expect(out.yaml).toContain('services:')
		expect(out.warnings).toContain('no fenced code block found')
	})

	test('returns empty yaml + warning when no recognisable compose found', () => {
		const out = parseComposeResponse('Sorry, I cannot generate compose for that.')
		expect(out.yaml).toBe('')
		expect(out.warnings.length).toBeGreaterThan(0)
	})
})
