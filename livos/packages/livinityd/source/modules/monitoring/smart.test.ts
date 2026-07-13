import {beforeEach, describe, expect, test, vi} from 'vitest'

import {execa} from 'execa'

import {getBlockDevices} from '../files/external-storage.js'

import {evaluateNvmeHealth, evaluateSataHealth, evaluateTemperature, listDrives} from './smart.js'

// Fully isolate the pipeline: no real subprocess, no real lsblk/sudo.
vi.mock('execa', () => ({execa: vi.fn()}))
vi.mock('../files/external-storage.js', () => ({getBlockDevices: vi.fn()}))

beforeEach(() => {
	vi.mocked(execa).mockReset()
	vi.mocked(getBlockDevices).mockReset()
})

// ─────────────────────────────────────────────────────────────────────────
// Task 1 — PURE threshold evaluators (no disk I/O, no subprocess).
// These are the Backblaze-5 SATA + NVMe critical-warning rules, plus the
// DISPLAY-ONLY temperature dimension (never a health-severity input).
// ─────────────────────────────────────────────────────────────────────────

describe('evaluateSataHealth', () => {
	test('Reallocated_Sector_Ct raw > 0 (but <= 50) → warning', () => {
		const evalResult = evaluateSataHealth({
			smart_status: {passed: true},
			ata_smart_attributes: {table: [{id: 5, name: 'Reallocated_Sector_Ct', raw: {value: 3}, when_failed: ''}]},
		})
		expect(evalResult.severity).toBe('warning')
		expect(evalResult.reasons.join(' ')).toMatch(/Reallocated_Sector_Ct/)
		// Temperature must NEVER leak into the health-severity reasons.
		expect(evalResult.reasons.join(' ')).not.toMatch(/temperature/i)
	})

	test('smart_status.passed === false → critical (drive firmware own aggregate FAIL)', () => {
		const evalResult = evaluateSataHealth({
			smart_status: {passed: false},
			ata_smart_attributes: {table: [{id: 5, name: 'Reallocated_Sector_Ct', raw: {value: 0}, when_failed: ''}]},
		})
		expect(evalResult.severity).toBe('critical')
	})

	test('an attribute with when_failed set → critical', () => {
		const evalResult = evaluateSataHealth({
			smart_status: {passed: true},
			ata_smart_attributes: {table: [{id: 197, name: 'Current_Pending_Sector', raw: {value: 2}, when_failed: 'now'}]},
		})
		expect(evalResult.severity).toBe('critical')
	})

	test('Reallocated_Sector_Ct raw > 50 → critical', () => {
		const evalResult = evaluateSataHealth({
			smart_status: {passed: true},
			ata_smart_attributes: {table: [{id: 5, name: 'Reallocated_Sector_Ct', raw: {value: 120}, when_failed: ''}]},
		})
		expect(evalResult.severity).toBe('critical')
	})

	test('Command_Timeout has a noise floor of 5 (raw 3 → null, raw 9 → warning)', () => {
		const quiet = evaluateSataHealth({
			smart_status: {passed: true},
			ata_smart_attributes: {table: [{id: 188, name: 'Command_Timeout', raw: {value: 3}, when_failed: ''}]},
		})
		expect(quiet.severity).toBeNull()
		const noisy = evaluateSataHealth({
			smart_status: {passed: true},
			ata_smart_attributes: {table: [{id: 188, name: 'Command_Timeout', raw: {value: 9}, when_failed: ''}]},
		})
		expect(noisy.severity).toBe('warning')
	})

	test('all Backblaze-5 attrs clean + passed=true → null severity (healthy input)', () => {
		const evalResult = evaluateSataHealth({
			smart_status: {passed: true},
			ata_smart_attributes: {
				table: [
					{id: 5, name: 'Reallocated_Sector_Ct', raw: {value: 0}, when_failed: ''},
					{id: 187, name: 'Reported_Uncorrect', raw: {value: 0}, when_failed: ''},
					{id: 197, name: 'Current_Pending_Sector', raw: {value: 0}, when_failed: ''},
					{id: 198, name: 'Offline_Uncorrectable', raw: {value: 0}, when_failed: ''},
				],
			},
		})
		expect(evalResult.severity).toBeNull()
	})
})

describe('evaluateNvmeHealth', () => {
	test('critical_warning !== 0 → critical', () => {
		const evalResult = evaluateNvmeHealth({critical_warning: 4, percentage_used: 10, media_errors: 0, available_spare: 100, available_spare_threshold: 10})
		expect(evalResult.severity).toBe('critical')
		expect(evalResult.reasons.join(' ')).toMatch(/critical_warning/)
	})

	test('percentage_used >= 90 → warning, >= 100 → critical', () => {
		const warn = evaluateNvmeHealth({critical_warning: 0, percentage_used: 95, media_errors: 0, available_spare: 100, available_spare_threshold: 10})
		expect(warn.severity).toBe('warning')
		const crit = evaluateNvmeHealth({critical_warning: 0, percentage_used: 100, media_errors: 0, available_spare: 100, available_spare_threshold: 10})
		expect(crit.severity).toBe('critical')
	})

	test('media_errors > 0 → warning', () => {
		const evalResult = evaluateNvmeHealth({critical_warning: 0, percentage_used: 5, media_errors: 3, available_spare: 100, available_spare_threshold: 10})
		expect(evalResult.severity).toBe('warning')
	})

	test('available_spare <= available_spare_threshold → critical', () => {
		const evalResult = evaluateNvmeHealth({critical_warning: 0, percentage_used: 5, media_errors: 0, available_spare: 8, available_spare_threshold: 10})
		expect(evalResult.severity).toBe('critical')
	})

	test('healthy NVMe input → null severity', () => {
		const evalResult = evaluateNvmeHealth({critical_warning: 0, percentage_used: 5, media_errors: 0, available_spare: 100, available_spare_threshold: 10})
		expect(evalResult.severity).toBeNull()
	})
})

describe('evaluateTemperature (display-only)', () => {
	test('66 → hot, 56 → warm, 40 → ok', () => {
		expect(evaluateTemperature(66)).toBe('hot')
		expect(evaluateTemperature(56)).toBe('warm')
		expect(evaluateTemperature(40)).toBe('ok')
	})

	test('boundary 65 → hot, 55 → warm', () => {
		expect(evaluateTemperature(65)).toBe('hot')
		expect(evaluateTemperature(55)).toBe('warm')
	})

	test('null/undefined → ok (never throws)', () => {
		expect(evaluateTemperature(null)).toBe('ok')
		expect(evaluateTemperature(undefined)).toBe('ok')
	})
})

// ─────────────────────────────────────────────────────────────────────────
// Task 3 — FIXTURE-driven assembly pipeline (all 5 detection outcomes).
// execa + getBlockDevices are mocked so no real disk/sudo is ever touched.
// ─────────────────────────────────────────────────────────────────────────

// Canned smartctl -a -j JSON fixtures.
const SATA_HEALTHY = {
	smart_status: {passed: true},
	ata_smart_attributes: {
		table: [
			{id: 5, name: 'Reallocated_Sector_Ct', raw: {value: 0}, when_failed: ''},
			{id: 187, name: 'Reported_Uncorrect', raw: {value: 0}, when_failed: ''},
			{id: 197, name: 'Current_Pending_Sector', raw: {value: 0}, when_failed: ''},
			{id: 198, name: 'Offline_Uncorrectable', raw: {value: 0}, when_failed: ''},
		],
	},
	temperature: {current: 38},
}

const SATA_FAILING = {
	smart_status: {passed: false},
	ata_smart_attributes: {
		table: [{id: 5, name: 'Reallocated_Sector_Ct', raw: {value: 120}, when_failed: ''}],
	},
	temperature: {current: 44},
}

const NVME_CRITICAL = {
	nvme_smart_health_information_log: {
		critical_warning: 4,
		percentage_used: 97,
		media_errors: 0,
		available_spare: 80,
		available_spare_threshold: 5,
	},
	temperature: 50,
}

// USB-SATA bridge that smartctl cannot resolve — no health fields, only an error.
const USB_BRIDGE_UNRESOLVED = {
	smartctl: {
		exit_status: 4,
		messages: [{string: "Unknown USB bridge [0x1234:0x5678 (0x0100)]. Please try adding '-d sat'.", severity: 'error'}],
	},
}

// device-list fixtures (only {id,name,transport} are read by assembleDrive).
const dev = (id: string, name: string, transport: string) => ({
	id,
	name,
	transport,
	size: 1_000_204_886_016,
	isMounted: false,
	isFormatting: false,
	partitions: [],
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asExeca = (result: {stdout?: string; stderr?: string; exitCode?: number}): any => ({
	stdout: result.stdout ?? '',
	stderr: result.stderr ?? '',
	exitCode: result.exitCode ?? 0,
})

describe('listDrives — 5-state detection pipeline (offline fixtures)', () => {
	test('1) SATA-healthy → healthy / ata / null severity', async () => {
		vi.mocked(getBlockDevices).mockResolvedValue([dev('sda', 'WDC Blue', 'sata')] as never)
		vi.mocked(execa).mockResolvedValue(asExeca({stdout: JSON.stringify(SATA_HEALTHY)}))

		const [drive] = await listDrives()
		expect(drive.healthStatus).toBe('healthy')
		expect(drive.detectionMethod).toBe('ata')
		expect(drive.severity).toBeNull()
		expect(drive.temperature).toBe(38)
	})

	test('2) SATA-failing (reallocated>50 + passed=false) → failing / critical', async () => {
		vi.mocked(getBlockDevices).mockResolvedValue([dev('sda', 'WDC Blue', 'sata')] as never)
		vi.mocked(execa).mockResolvedValue(asExeca({stdout: JSON.stringify(SATA_FAILING)}))

		const [drive] = await listDrives()
		expect(drive.healthStatus).toBe('failing')
		expect(drive.severity).toBe('critical')
		expect(drive.reasons.length).toBeGreaterThan(0)
	})

	test('3) NVMe-critical (critical_warning=4, used=97) → failing / critical / nvme', async () => {
		vi.mocked(getBlockDevices).mockResolvedValue([dev('nvme0n1', 'Samsung 980', 'nvme')] as never)
		vi.mocked(execa).mockResolvedValue(asExeca({stdout: JSON.stringify(NVME_CRITICAL)}))

		const [drive] = await listDrives()
		expect(drive.healthStatus).toBe('failing')
		expect(drive.severity).toBe('critical')
		expect(drive.detectionMethod).toBe('nvme')
	})

	test('4) USB-unavailable (auto + -d sat both unresolved) → unavailable / unsupported, NEVER healthy', async () => {
		vi.mocked(getBlockDevices).mockResolvedValue([dev('sdb', 'USB Enclosure', 'usb')] as never)
		// Both the auto-detect read AND the -d sat retry return the same bridge error.
		vi.mocked(execa).mockResolvedValue(asExeca({stdout: JSON.stringify(USB_BRIDGE_UNRESOLVED), exitCode: 4}))

		const [drive] = await listDrives()
		expect(drive.healthStatus).toBe('unavailable')
		expect(drive.detectionMethod).toBe('unsupported')
		// SMART-04 regression guard: an unreadable enclosure must NEVER read healthy.
		expect(drive.healthStatus).not.toBe('healthy')
		// The -d sat fallback must actually have been attempted (2 reads).
		expect(vi.mocked(execa).mock.calls.length).toBe(2)
	})

	test('5) permission-denied (internal, sudo password required) → unavailable / permission-denied, NEVER healthy', async () => {
		vi.mocked(getBlockDevices).mockResolvedValue([dev('sdc', 'Internal HDD', 'sata')] as never)
		vi.mocked(execa).mockResolvedValue(asExeca({stdout: '', stderr: 'sudo: a password is required', exitCode: 1}))

		const [drive] = await listDrives()
		expect(drive.healthStatus).toBe('unavailable')
		expect(drive.detectionMethod).toBe('permission-denied')
		// SMART-04 regression guard: a missing sudo grant must NEVER read healthy.
		expect(drive.healthStatus).not.toBe('healthy')
	})
})

// ─────────────────────────────────────────────────────────────────────────
// H-02 regression — 'healthy' requires POSITIVE evidence, not mere key-presence.
// These are the exact deterministic shapes the code review named: a smartctl
// payload can technically carry a health key while proving NOTHING, and such a
// read must resolve to 'unavailable', never 'healthy'.
// ─────────────────────────────────────────────────────────────────────────
describe('listDrives — H-02 no-false-healthy hardening (positive-evidence gate)', () => {
	test('empty SATA shape {smart_status:{}, ata_smart_attributes:{table:[]}} → unavailable, NEVER healthy', async () => {
		vi.mocked(getBlockDevices).mockResolvedValue([dev('sda', 'Ghost Drive', 'sata')] as never)
		// A key is present (readSucceeded=true) but there is ZERO genuine evidence:
		// no passed bit, no attribute rows. This is the core H-02 false-healthy trap.
		vi.mocked(execa).mockResolvedValue(
			asExeca({stdout: JSON.stringify({smart_status: {}, ata_smart_attributes: {table: []}})}),
		)

		const [drive] = await listDrives()
		expect(drive.healthStatus).not.toBe('healthy')
		expect(drive.healthStatus).toBe('unavailable')
	})

	test('SATA passed===true + clean Backblaze-5 → healthy (positive PASS + populated table)', async () => {
		vi.mocked(getBlockDevices).mockResolvedValue([dev('sda', 'WDC Blue', 'sata')] as never)
		vi.mocked(execa).mockResolvedValue(
			asExeca({
				stdout: JSON.stringify({
					smart_status: {passed: true},
					ata_smart_attributes: {
						table: [
							{id: 5, name: 'Reallocated_Sector_Ct', raw: {value: 0}, when_failed: ''},
							{id: 187, name: 'Reported_Uncorrect', raw: {value: 0}, when_failed: ''},
							{id: 197, name: 'Current_Pending_Sector', raw: {value: 0}, when_failed: ''},
							{id: 198, name: 'Offline_Uncorrectable', raw: {value: 0}, when_failed: ''},
						],
					},
				}),
			}),
		)

		const [drive] = await listDrives()
		expect(drive.healthStatus).toBe('healthy')
	})

	test('SATA passed===false → failing (a real fail still wins over the positive-evidence gate)', async () => {
		vi.mocked(getBlockDevices).mockResolvedValue([dev('sda', 'WDC Blue', 'sata')] as never)
		vi.mocked(execa).mockResolvedValue(
			asExeca({stdout: JSON.stringify({smart_status: {passed: false}, ata_smart_attributes: {table: []}})}),
		)

		const [drive] = await listDrives()
		expect(drive.healthStatus).toBe('failing')
		expect(drive.severity).toBe('critical')
	})

	test('NVMe with an empty/absent health log {nvme_smart_health_information_log:{}} → unavailable, NEVER healthy', async () => {
		vi.mocked(getBlockDevices).mockResolvedValue([dev('nvme0n1', 'Samsung 980', 'nvme')] as never)
		// Detected as nvme (the log key is present) but the log is EMPTY — critical_warning
		// is unreadable, so there is no genuine health signal.
		vi.mocked(execa).mockResolvedValue(
			asExeca({stdout: JSON.stringify({nvme_smart_health_information_log: {}})}),
		)

		const [drive] = await listDrives()
		expect(drive.detectionMethod).toBe('nvme')
		expect(drive.healthStatus).not.toBe('healthy')
		expect(drive.healthStatus).toBe('unavailable')
	})

	test('JSON with an error-severity smartctl message → NEVER healthy even with a clean-looking payload', async () => {
		vi.mocked(getBlockDevices).mockResolvedValue([dev('sda', 'WDC Blue', 'sata')] as never)
		vi.mocked(execa).mockResolvedValue(
			asExeca({
				stdout: JSON.stringify({
					smart_status: {passed: true},
					ata_smart_attributes: {table: [{id: 5, name: 'Reallocated_Sector_Ct', raw: {value: 0}, when_failed: ''}]},
					smartctl: {messages: [{string: 'Read of ATA attribute table failed', severity: 'error'}]},
				}),
			}),
		)

		const [drive] = await listDrives()
		expect(drive.healthStatus).not.toBe('healthy')
		expect(drive.healthStatus).toBe('unavailable')
	})
})
