/**
 * Phase 275 — regression tests for the "Liv launches installed/auto-created
 * WebApps by name" path. Locks the three live-UAT-discovered fixes:
 *   1. webappMatchScore / defaultLivosAppResolver tolerate noisy captured titles
 *      and match on the URL hostname (the bug: exact title-equality never matched
 *      a real WebApp whose title was "Reddit - Please wait for verification").
 *   2. normalizeWebAppUrl distinguishes a website (→ create + open as WebApp) from
 *      a plain app name (→ APP_MAP fallback).
 */

import {describe, expect, test} from 'vitest'
import {hostnameBase, webappMatchScore, defaultLivosAppResolver} from './native/window.js'
import {normalizeWebAppUrl} from './mcp/tools.js'

describe('hostnameBase', () => {
	test('strips scheme + www, takes first label', () => {
		expect(hostnameBase('https://www.reddit.com/r/x')).toBe('reddit')
		expect(hostnameBase('https://youtube.com')).toBe('youtube')
		expect(hostnameBase('http://news.ycombinator.com')).toBe('news')
	})
	test('empty / unparseable → ""', () => {
		expect(hostnameBase(undefined)).toBe('')
		expect(hostnameBase('not a url')).toBe('')
	})
})

describe('webappMatchScore', () => {
	const labels = (over: Partial<{title: string; name: string; sub: string; host: string}>) => ({
		title: '',
		name: '',
		sub: '',
		host: '',
		...over,
	})

	test('hostname base equality scores high even with a noisy title', () => {
		// The live bug: title is reddit\'s bot-check page, exact match fails.
		const score = webappMatchScore(
			'reddit',
			labels({title: 'reddit - please wait for verification', host: 'reddit'}),
		)
		expect(score).toBeGreaterThanOrEqual(80)
	})
	test('exact label equality is the top score', () => {
		expect(webappMatchScore('google', labels({title: 'google', host: 'google'}))).toBe(100)
	})
	test('no relation → 0', () => {
		expect(webappMatchScore('reddit', labels({title: 'home | bruce oz', host: 'bruceoz'}))).toBe(0)
	})
})

describe('defaultLivosAppResolver', () => {
	const deps = (webapps: Array<{id: string; url?: string; title?: string}>) => ({
		listWebApps: async () => webapps,
		listNativeApps: async () => [],
		userSlug: 'everything',
		domainRoot: 'livinity.io',
	})

	test('matches a WebApp with a noisy title via its url + routes to the real url', async () => {
		const match = await defaultLivosAppResolver('reddit', deps([
			{id: 'home-id', url: 'https://bruceoz.com/', title: 'Home | Bruce OZ'},
			{id: 'reddit-id', url: 'https://reddit.com/', title: 'Reddit - Please wait for verification'},
		]))
		expect(match).not.toBeNull()
		expect(match?.kind).toBe('webapp')
		expect(match?.appId).toBe('reddit-id')
		expect(match?.route).toBe('https://reddit.com/')
	})

	test('no match → null (so the handler can auto-create or fall through)', async () => {
		const match = await defaultLivosAppResolver('spotify', deps([
			{id: 'reddit-id', url: 'https://reddit.com/', title: 'Reddit'},
		]))
		expect(match).toBeNull()
	})
})

describe('normalizeWebAppUrl', () => {
	test('bare domain → https url', () => {
		expect(normalizeWebAppUrl('youtube.com')).toBe('https://youtube.com/')
		expect(normalizeWebAppUrl('www.example.co.uk/feed')).toBe('https://www.example.co.uk/feed')
	})
	test('explicit url is kept', () => {
		expect(normalizeWebAppUrl('https://news.ycombinator.com')).toBe('https://news.ycombinator.com/')
	})
	test('plain app names + phrases → null (APP_MAP fallback)', () => {
		expect(normalizeWebAppUrl('reddit')).toBeNull()
		expect(normalizeWebAppUrl('libreoffice')).toBeNull()
		expect(normalizeWebAppUrl('open youtube')).toBeNull()
		expect(normalizeWebAppUrl('')).toBeNull()
	})
})
