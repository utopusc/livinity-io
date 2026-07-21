/**
 * Phase 350-03 (VMLIFE-02/03, T-350-17) — VM structural-boundary guard.
 *
 * DECISION (resolving the 349 handoff Research-Q2): VM instances are
 * structurally ABSENT from BOTH (a) the Apps#instances registry that
 * oom-watch.ts:165 and health-monitor.ts:59 iterate, and (b) the
 * app-subdomain / public-exposure system. The never-public posture is the
 * ABSENCE ITSELF — there is no runtime isPublicForbidden integration wired for
 * VMs because there is no code path that could ever expose one: no vm module
 * iterates the vmInstances registry into a Caddy vhost / forward_auth / public
 * dashboard entry, and no VM container is ever pushed into Apps#instances.
 *
 * This file is the TRIPWIRE against a future "unify apps and VMs" refactor:
 *   · If someone makes VmManager push a container into Apps#instances (so
 *     oom-watch/health-monitor would auto-restart a stateful VM disk, or a
 *     unified loop would emit a public subdomain), the source-text assertions
 *     below fail immediately.
 *   · The template's neverPublic:true structural fact (349 VMSEC-03) is
 *     re-pinned here at the lifecycle layer.
 *
 * These are SOURCE-LEVEL / DATA assertions on purpose: the guarantee is the
 * structural absence of a code path, which a behavioral test cannot prove a
 * negative of — a grep of the orchestrator source can.
 */

import {readFileSync} from 'node:fs'
import {describe, expect, test} from 'vitest'

import {getVmTemplate} from './vm-template.js'

// The orchestrator is the ONLY file that could plausibly reach into the apps
// registry or emit a public-exposure entry — it is where the guard bites.
const vmManagerSrc = readFileSync(new URL('./vm-manager.ts', import.meta.url), 'utf8')

describe('VMs never enter Apps#instances (oom-watch / health-monitor scope) — T-350-17', () => {
	test('vm-manager.ts never accesses a `.instances` array', () => {
		// A `.instances` property access is how apps.ts exposes the array
		// oom-watch.ts:165 / health-monitor.ts:59 iterate. VmManager owns its own
		// vmInstances registry (via VmRegistry) and must NEVER push a VM container
		// into that apps array — a stateful VM disk auto-restarted by the app
		// health monitor is data corruption.
		expect(vmManagerSrc).not.toMatch(/\.instances\b/)
	})
	test('vm-manager.ts never references apps.instances explicitly', () => {
		expect(vmManagerSrc).not.toMatch(/apps\s*\.\s*instances/)
	})
})

describe('VMs are structurally absent from the public-exposure path — T-350-17', () => {
	// No vm lifecycle code emits a subdomain / Caddy vhost / forward_auth /
	// public-dashboard entry. This phase adds ZERO Caddy surface (353's job).
	const FORBIDDEN_PUBLIC = [
		'caddy',
		'Caddyfile',
		'forward_auth',
		'subdomain',
		'publicDashboard',
		'isPublicForbidden',
		'cf-saas',
		'cf-local',
	]
	for (const needle of FORBIDDEN_PUBLIC) {
		test(`vm-manager.ts contains NO reference to '${needle}' (no public-exposure path)`, () => {
			expect(vmManagerSrc.toLowerCase().includes(needle.toLowerCase())).toBe(false)
		})
	}
})

describe('the 349 template neverPublic posture holds at the lifecycle layer — VMSEC-03', () => {
	test("getVmTemplate('windows').neverPublic === true", () => {
		expect(getVmTemplate('windows').neverPublic).toBe(true)
	})
	test("getVmTemplate('linux').neverPublic === true", () => {
		expect(getVmTemplate('linux').neverPublic).toBe(true)
	})
	test('neverPublic is data-compatible with isPublicForbidden (structural never-public)', () => {
		// A VM template shape ({neverPublic:true}) is exactly what the apps
		// public-forbidden gate would reject if a VM ever reached that path — the
		// posture is compatible by construction even though no VM code invokes it.
		for (const kind of ['windows', 'linux'] as const) {
			expect(getVmTemplate(kind).neverPublic).toBe(true)
		}
	})
})
