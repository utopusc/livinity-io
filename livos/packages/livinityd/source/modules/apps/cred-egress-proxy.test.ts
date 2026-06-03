import assert from 'node:assert/strict'
import {test} from 'node:test'
import os from 'node:os'
import path from 'node:path'

import {mkdtemp} from 'node:fs/promises'

import fse from 'fs-extra'

import {
	CREDPROXY_HOST,
	CREDPROXY_PORT,
	CREDPROXY_HOST_GATEWAY,
	isInjectableHost,
	readBearerFor,
	injectAuthHeader,
	isFromBridge,
} from './cred-egress-proxy.js'

// ── Test 1: host allowlist ─────────────────────────────────────────────────
test('Test 1: isInjectableHost allowlists only the AI provider hosts', () => {
	assert.equal(isInjectableHost('api.anthropic.com'), true)
	assert.equal(isInjectableHost('generativelanguage.googleapis.com'), true)
	assert.equal(isInjectableHost('attacker.example'), false)
	// Host:port forms (CONNECT targets carry the port) must still match.
	assert.equal(isInjectableHost('api.anthropic.com:443'), true)
	assert.equal(isInjectableHost('evil.api.anthropic.com.attacker.example'), false)
})

// ── Test 2: bearer source (read-only token from host cred file) ─────────────
test('Test 2: readBearerFor reads the OAuth token from the host cred file; null on garbage', async () => {
	const tmp = await mkdtemp(path.join(os.tmpdir(), 'credproxy-test-'))
	const claudeDir = path.join(tmp, '.claude')
	const geminiDir = path.join(tmp, '.gemini')
	await fse.mkdirp(claudeDir)
	await fse.mkdirp(geminiDir)

	// Anthropic OAuth credential file shape (claudeAiOauth.accessToken).
	await fse.writeFile(
		path.join(claudeDir, '.credentials.json'),
		JSON.stringify({claudeAiOauth: {accessToken: 'sk-ant-oat-REALTOKEN', refreshToken: 'r'}}),
	)
	const anthropicTok = await readBearerFor('anthropic', {claudeDir, geminiDir: null})
	assert.equal(anthropicTok, 'sk-ant-oat-REALTOKEN')

	// Gemini oauth_creds.json shape (access_token).
	await fse.writeFile(
		path.join(geminiDir, 'oauth_creds.json'),
		JSON.stringify({access_token: 'ya29.GEMINI-TOKEN', token_type: 'Bearer'}),
	)
	const geminiTok = await readBearerFor('gemini', {claudeDir: null, geminiDir})
	assert.equal(geminiTok, 'ya29.GEMINI-TOKEN')

	// Missing file → null (no throw).
	const missing = await readBearerFor('anthropic', {claudeDir: path.join(tmp, 'nope'), geminiDir: null})
	assert.equal(missing, null)

	// Garbage file → null (no throw).
	await fse.writeFile(path.join(claudeDir, '.credentials.json'), 'not json at all {')
	const garbage = await readBearerFor('anthropic', {claudeDir, geminiDir: null})
	assert.equal(garbage, null)

	await fse.remove(tmp)
})

// ── Test 3: header injection only for allowlisted hosts ─────────────────────
test('Test 3: injectAuthHeader sets Authorization for AI hosts, leaves non-allowlisted unmutated', async () => {
	const tokenSource = async () => 'sk-ant-oat-WIRE'

	// Allowlisted host with NO Authorization header → injected.
	const headersAllow: Record<string, string> = {host: 'api.anthropic.com'}
	const allowResult = await injectAuthHeader('api.anthropic.com', headersAllow, {
		readBearer: tokenSource,
	})
	assert.equal(allowResult.injected, true)
	assert.equal(headersAllow['authorization'], 'Bearer sk-ant-oat-WIRE')

	// Non-allowlisted host → never injected, headers untouched, egress denied.
	const headersDeny: Record<string, string> = {host: 'attacker.example'}
	const denyResult = await injectAuthHeader('attacker.example', headersDeny, {
		readBearer: tokenSource,
	})
	assert.equal(denyResult.injected, false)
	assert.equal(denyResult.denied, true)
	assert.equal(headersDeny['authorization'], undefined)
})

// ── Test 4: source-IP gate to the docker bridge subnet ──────────────────────
test('Test 4: isFromBridge accepts docker-bridge IPs, rejects everything else', () => {
	// docker default bridge range 172.16.0.0/12.
	assert.equal(isFromBridge('172.17.0.2', '172.16.0.0/12'), true)
	assert.equal(isFromBridge('172.18.0.5', '172.16.0.0/12'), true)
	// Outside the subnet → refused.
	assert.equal(isFromBridge('10.0.0.5', '172.16.0.0/12'), false)
	assert.equal(isFromBridge('8.8.8.8', '172.16.0.0/12'), false)
	// IPv4-mapped IPv6 form docker sometimes presents.
	assert.equal(isFromBridge('::ffff:172.17.0.2', '172.16.0.0/12'), true)
})

// ── Test 5: no token leak — proxy never writes back to the cred file ────────
test('Test 5: readBearerFor opens the cred file read-only (no write-back / overwrite path)', async () => {
	const tmp = await mkdtemp(path.join(os.tmpdir(), 'credproxy-ro-'))
	const claudeDir = path.join(tmp, '.claude')
	await fse.mkdirp(claudeDir)
	const credFile = path.join(claudeDir, '.credentials.json')
	const original = JSON.stringify({claudeAiOauth: {accessToken: 'tok-RO'}})
	await fse.writeFile(credFile, original)
	const before = await fse.stat(credFile)

	await readBearerFor('anthropic', {claudeDir, geminiDir: null})
	await readBearerFor('anthropic', {claudeDir, geminiDir: null})

	const after = await fse.stat(credFile)
	const content = await fse.readFile(credFile, 'utf8')
	// mtime unchanged + content byte-identical → the proxy never wrote back.
	assert.equal(after.mtimeMs, before.mtimeMs)
	assert.equal(content, original)

	await fse.remove(tmp)
})

// ── Constants sanity (the inject-local-ai-clis contract) ────────────────────
test('Test 6: exported constants match the container wiring contract', () => {
	assert.equal(CREDPROXY_HOST, 'livinity-credproxy')
	assert.equal(CREDPROXY_PORT, 13129)
	assert.equal(CREDPROXY_HOST_GATEWAY, 'livinity-credproxy:host-gateway')
})
