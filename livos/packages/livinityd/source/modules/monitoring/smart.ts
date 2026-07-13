import {execa} from 'execa'

import {getBlockDevices} from '../files/external-storage.js'

// =========================================================================
// SMART disk-health core (Phase 313 SMART-01 / SMART-04).
//
// Stateless module (mirrors monitoring.ts — plain exported async fns, no class,
// no held state). Enumerates every block device (internal SATA/NVMe + USB),
// invokes `smartctl -a -j` per transport with a defensive fallback chain,
// parses the JSON, and maps each drive to an HONEST three-state health model —
// 'healthy' / 'failing' / 'unavailable' — plus an internal 'permission-denied'
// diagnostic.
//
// ★ SMART-04 (no false-healthy): 'healthy' is assigned in EXACTLY ONE place,
// and only after a SMART read genuinely resolved and its evaluator returned a
// clean bill. Every read/parse failure maps to 'unavailable'/'permission-denied'
// — never 'healthy'.
//
// All threshold logic (evaluateSataHealth / evaluateNvmeHealth /
// evaluateTemperature) is PURE and unit-testable with fixture JSON, mirroring
// scheduler/jobs.ts:diskSeverityFor (exported pure fn, no I/O).
// =========================================================================

// The underlying binary the wrapper wraps (documented for reference).
export const SMARTCTL_BIN = '/usr/sbin/smartctl'
// HIGH-01: livinityd invokes smartctl ONLY through this root-owned wrapper, never
// the raw binary. The wrapper validates the device id + a fixed mode enum and
// builds the smartctl argv itself, so the sudoers grant carries no argument glob
// and no caller flag can reach smartctl. Installed by deploy-livinityd.sh +
// update.sh; granted NOPASSWD via sudoers.d/livos-smart.
export const SMARTCTL_WRAPPER = '/usr/local/lib/livos/livos-smartctl.sh'

export type SmartHealthStatus = 'healthy' | 'failing' | 'unavailable'
export type SmartSeverity = 'warning' | 'critical'
export type SmartDetectionMethod = 'ata' | 'nvme' | 'sat' | 'unsupported' | 'permission-denied'
export type SmartTemperatureStatus = 'ok' | 'warm' | 'hot'

export interface SmartAttribute {
	key: string
	label: string
	raw: number
	status: 'ok' | 'warning' | 'critical'
}

export interface SmartDrive {
	deviceId: string // kernel name, e.g. 'sda'
	transport: string // raw lsblk transport ('usb' reliable; else treat as internal)
	model: string
	healthStatus: SmartHealthStatus
	severity: SmartSeverity | null // populated only when healthStatus === 'failing'
	temperature: number | null
	temperatureStatus: SmartTemperatureStatus
	detectionMethod: SmartDetectionMethod
	reasons: string[]
	attributes: SmartAttribute[]
	selfTestInProgress: boolean
	lastSelfTest: {status: string; passed: boolean | null} | null
}

export interface SmartHealthEval {
	severity: SmartSeverity | null
	reasons: string[]
	attributes: SmartAttribute[]
	// ★ SMART-04 (H-02): TRUE only when the read carried GENUINE positive health
	// evidence — a real firmware PASS bit or a populated Backblaze-5 table (SATA),
	// or a parseable critical_warning field (NVMe). A technically-present-but-empty
	// smart_status/attributes/health-log payload yields FALSE, so 'healthy' can
	// never be inferred from mere key-presence (the H-02 false-healthy gap).
	positiveEvidence: boolean
}

// Backblaze's 5 failure-predicting SATA attributes (by ATA attribute id).
const SATA_ATTR_IDS = {
	reallocated: 5,
	reportedUncorrect: 187,
	commandTimeout: 188,
	pendingSector: 197,
	offlineUncorrectable: 198,
}

// severity lattice: critical dominates warning dominates null.
function maxSeverity(current: SmartSeverity | null, next: SmartSeverity): SmartSeverity {
	if (current === 'critical' || next === 'critical') return 'critical'
	return 'warning'
}

type SataAttrRow = {
	id?: number
	name?: string
	raw?: {value?: number; string?: string}
	when_failed?: string
}

function rawValue(row: SataAttrRow | undefined): number {
	const raw = row?.raw?.value
	return typeof raw === 'number' ? raw : 0
}

// ── evaluateSataHealth ─────────────────────────────────────────────────────
// Pure. Destructures ONLY {smart_status, ata_smart_attributes}. Backblaze-5 raw
// counters drive warning/critical; smart_status.passed===false and any attr's
// when_failed are automatic-critical. (No display-dimension inputs live here.)
export function evaluateSataHealth({
	smart_status,
	ata_smart_attributes,
}: {
	smart_status?: {passed?: boolean}
	ata_smart_attributes?: {table?: SataAttrRow[]}
}): SmartHealthEval {
	const table = ata_smart_attributes?.table
	const reasons: string[] = []
	const attributes: SmartAttribute[] = []
	let severity: SmartSeverity | null = null
	// H-02: count how many Backblaze-5 rows were ACTUALLY present in the table
	// (distinguish "0 rows read → uninformative" from "5 rows read, all clean").
	let attrRowsFound = 0

	// Drive firmware's own aggregate FAIL → automatic critical.
	if (smart_status?.passed === false) {
		severity = maxSeverity(severity, 'critical')
		reasons.push('smart_status.passed=false')
	}

	// Each Backblaze-5 attribute: warnRaw is the warning floor; critRaw (if set)
	// escalates a materially-high raw count to critical.
	const specs: {id: number; key: string; label: string; warnRaw: number; critRaw: number | null}[] = [
		{id: SATA_ATTR_IDS.reallocated, key: 'reallocated_sector_ct', label: 'Reallocated_Sector_Ct', warnRaw: 0, critRaw: 50},
		{id: SATA_ATTR_IDS.reportedUncorrect, key: 'reported_uncorrect', label: 'Reported_Uncorrect', warnRaw: 0, critRaw: null},
		{id: SATA_ATTR_IDS.commandTimeout, key: 'command_timeout', label: 'Command_Timeout', warnRaw: 5, critRaw: null},
		{id: SATA_ATTR_IDS.pendingSector, key: 'current_pending_sector', label: 'Current_Pending_Sector', warnRaw: 0, critRaw: 50},
		{id: SATA_ATTR_IDS.offlineUncorrectable, key: 'offline_uncorrectable', label: 'Offline_Uncorrectable', warnRaw: 0, critRaw: null},
	]

	for (const spec of specs) {
		const row = table?.find((entry) => entry?.id === spec.id)
		if (row !== undefined) attrRowsFound++
		const raw = rawValue(row)
		const whenFailed = typeof row?.when_failed === 'string' ? row.when_failed.trim() : ''
		let status: SmartAttribute['status'] = 'ok'

		// when_failed non-empty ⇒ this attribute already crossed ITS OWN threshold.
		if (whenFailed !== '') {
			status = 'critical'
			severity = maxSeverity(severity, 'critical')
			reasons.push(`${spec.label} when_failed=${whenFailed}`)
		}

		if (spec.critRaw !== null && raw > spec.critRaw) {
			status = 'critical'
			severity = maxSeverity(severity, 'critical')
			reasons.push(`${spec.label} raw=${raw}`)
		} else if (raw > spec.warnRaw) {
			if (status === 'ok') status = 'warning'
			severity = maxSeverity(severity, 'warning')
			reasons.push(`${spec.label} raw=${raw}`)
		}

		attributes.push({key: spec.key, label: spec.label, raw, status})
	}

	// H-02 positive-evidence gate: 'healthy' is only ever inferable when the read
	// actually asserted a PASS (smart_status.passed===true) OR returned at least
	// one Backblaze-5 attribute row. An empty {smart_status:{}, table:[]} shape has
	// neither → positiveEvidence=false → assembleDrive maps it to 'unavailable'.
	const positiveEvidence = smart_status?.passed === true || attrRowsFound > 0

	return {severity, reasons, attributes, positiveEvidence}
}

// ── evaluateNvmeHealth ─────────────────────────────────────────────────────
// Pure. critical_warning bitmask (any nonzero ⇒ critical) is the firmware's own
// aggregate signal; percentage_used / media_errors / available_spare add the
// endurance + spare rules.
export function evaluateNvmeHealth(
	log:
		| {
				critical_warning?: number
				percentage_used?: number
				media_errors?: number
				available_spare?: number
				available_spare_threshold?: number
		  }
		| undefined,
): SmartHealthEval {
	const reasons: string[] = []
	const attributes: SmartAttribute[] = []
	let severity: SmartSeverity | null = null

	const criticalWarning = typeof log?.critical_warning === 'number' ? log.critical_warning : 0
	const percentageUsed = typeof log?.percentage_used === 'number' ? log.percentage_used : 0
	const mediaErrors = typeof log?.media_errors === 'number' ? log.media_errors : 0
	const availableSpare = typeof log?.available_spare === 'number' ? log.available_spare : null
	const spareThreshold = typeof log?.available_spare_threshold === 'number' ? log.available_spare_threshold : null

	if (criticalWarning !== 0) {
		severity = maxSeverity(severity, 'critical')
		reasons.push(`critical_warning=${criticalWarning}`)
	}
	attributes.push({key: 'critical_warning', label: 'Critical Warning', raw: criticalWarning, status: criticalWarning !== 0 ? 'critical' : 'ok'})

	let pctStatus: SmartAttribute['status'] = 'ok'
	if (percentageUsed >= 100) {
		pctStatus = 'critical'
		severity = maxSeverity(severity, 'critical')
		reasons.push(`percentage_used=${percentageUsed}`)
	} else if (percentageUsed >= 90) {
		pctStatus = 'warning'
		severity = maxSeverity(severity, 'warning')
		reasons.push(`percentage_used=${percentageUsed}`)
	}
	attributes.push({key: 'percentage_used', label: 'Percentage Used', raw: percentageUsed, status: pctStatus})

	let meStatus: SmartAttribute['status'] = 'ok'
	if (mediaErrors > 0) {
		meStatus = 'warning'
		severity = maxSeverity(severity, 'warning')
		reasons.push(`media_errors=${mediaErrors}`)
	}
	attributes.push({key: 'media_errors', label: 'Media Errors', raw: mediaErrors, status: meStatus})

	if (availableSpare !== null && spareThreshold !== null && availableSpare <= spareThreshold) {
		severity = maxSeverity(severity, 'critical')
		reasons.push(`available_spare=${availableSpare}<=threshold=${spareThreshold}`)
		attributes.push({key: 'available_spare', label: 'Available Spare', raw: availableSpare, status: 'critical'})
	} else if (availableSpare !== null) {
		attributes.push({key: 'available_spare', label: 'Available Spare', raw: availableSpare, status: 'ok'})
	}

	// H-02 positive-evidence gate: the NVMe SMART/Health log page always carries a
	// critical_warning byte. If it is unreadable (log absent or an empty {} object),
	// we have no genuine health signal → positiveEvidence=false → 'unavailable'.
	const positiveEvidence = typeof log?.critical_warning === 'number'

	return {severity, reasons, attributes, positiveEvidence}
}

// ── evaluateTemperature ────────────────────────────────────────────────────
// DISPLAY-ONLY dimension. Deliberately kept OUT of the health-severity path
// (SMART-02 "no alert-fatigue defaults"): a warm/hot reading is surfaced as
// temperatureStatus, never as healthStatus='failing'. NVMe over-temperature is
// instead caught via the critical_warning bit inside evaluateNvmeHealth.
export function evaluateTemperature(celsius: number | null | undefined): SmartTemperatureStatus {
	if (typeof celsius !== 'number') return 'ok'
	if (celsius >= 65) return 'hot'
	if (celsius >= 55) return 'warm'
	return 'ok'
}

// =========================================================================
// Runtime layer: smartctl invocation + defensive detection chain + assembly.
// =========================================================================

// copied from files/external-storage.ts:36 — canonical kernel-device-name guard.
// Validated BEFORE every privileged smartctl argv is built (defence-in-depth
// against sudoers-glob argument injection; the sudoers /dev/* glob only
// constrains literal argument text, not a crafted id).
const DEVICE_ID_RE = /^(sd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/

// A smartctl read "resolved" iff the JSON carries at least one health surface.
// NOTE (H-02): this is a REACHABILITY signal only ("smartctl returned a health
// key"), NOT a health verdict. It gates whether the SUCCESS branch runs; the
// branch itself then demands genuine positive evidence before 'healthy' (mere
// key-presence is no longer sufficient — see assembleDrive).
function readSucceeded(json: SmartctlJson | null): boolean {
	return (
		!!json &&
		(json.smart_status !== undefined ||
			json.ata_smart_attributes !== undefined ||
			json.nvme_smart_health_information_log !== undefined)
	)
}

// H-02: TRUE if smartctl logged any error-severity diagnostic (checksum failure,
// partial/aborted read, etc.). Such a read must NEVER be trusted as 'healthy',
// even when a health key is technically present alongside the error.
function hasErrorMessage(json: SmartctlJson | null): boolean {
	const messages = Array.isArray(json?.smartctl?.messages) ? json!.smartctl!.messages! : []
	return messages.some((m) => typeof m?.severity === 'string' && m.severity.toLowerCase() === 'error')
}

interface SmartctlJson {
	smart_status?: {passed?: boolean}
	ata_smart_attributes?: {table?: SataAttrRow[]}
	nvme_smart_health_information_log?: {
		critical_warning?: number
		percentage_used?: number
		media_errors?: number
		available_spare?: number
		available_spare_threshold?: number
	}
	temperature?: number | {current?: number}
	smartctl?: {exit_status?: number; messages?: {string?: string; severity?: string}[]}
	ata_smart_self_test_log?: {standard?: {table?: {status?: {string?: string; remaining_percent?: number}}[]}}
	nvme_self_test_log?: {current_self_test_operation?: {value?: number}; table?: {self_test_result?: {string?: string}}[]}
}

// Invoke `sudo -n <wrapper> <id> read [sat]` and classify the outcome. The wrapper
// (HIGH-01) internally runs `smartctl -a -j [-d sat] /dev/<id>` — the argv shape is
// now hardcoded root-side, not passed as sudo args, so no flag can be appended.
// Never requests `-d nvme` — NVMe is read via auto-detect (the wrapper's `read` mode).
async function readSmart(
	id: string,
	dPassthrough?: 'sat',
): Promise<{json: SmartctlJson | null; sudoDenied: boolean; toolError: boolean}> {
	// Shape guard BEFORE any argv construction (T-313-01). The wrapper re-validates
	// the same regex root-side (defense-in-depth), but we never rely on that alone.
	if (!DEVICE_ID_RE.test(id)) throw new Error('[invalid-device-id]')

	const args = ['-n', SMARTCTL_WRAPPER, id, 'read', ...(dPassthrough ? [dPassthrough] : [])]

	let stdout = ''
	let stderr = ''
	try {
		// exit status is a bitmask — NEVER reject on nonzero; parse the body regardless.
		const res = await execa('sudo', args, {timeout: 20_000, reject: false})
		stdout = res.stdout ?? ''
		stderr = res.stderr ?? ''
	} catch (err) {
		stderr = err instanceof Error ? err.message : String(err)
	}

	// Distinguish a sudo/permission failure from a genuine device/tool error.
	const haystack = `${stderr}\n${stdout}`.toLowerCase()
	if (haystack.includes('sudo:') || haystack.includes('a password is required') || haystack.includes('not allowed to execute')) {
		return {json: null, sudoDenied: true, toolError: false}
	}

	let json: SmartctlJson | null = null
	try {
		json = JSON.parse(stdout) as SmartctlJson
	} catch {
		return {json: null, sudoDenied: false, toolError: true}
	}

	// Unresolved-enclosure signal: check smartctl.messages[] BEFORE trusting the
	// health fields exist ("Unknown USB bridge ... please try -d sat", etc.).
	const messages = Array.isArray(json?.smartctl?.messages) ? json.smartctl!.messages! : []
	const unresolved = messages.some(
		(m) => typeof m?.string === 'string' && /unknown usb bridge|unsupported|please try/i.test(m.string),
	)
	if (unresolved && !readSucceeded(json)) {
		return {json, sudoDenied: false, toolError: true}
	}

	return {json, sudoDenied: false, toolError: false}
}

// Defensive self-test-log read. Field names are MEDIUM-confidence (RESEARCH
// Open Q3) — every access is optional-chained; missing fields yield
// {selfTestInProgress:false, lastSelfTest:null} and NEVER throw.
function readSelfTest(
	json: SmartctlJson,
	isNvme: boolean,
): {selfTestInProgress: boolean; lastSelfTest: {status: string; passed: boolean | null} | null} {
	const classify = (statusStr: string): boolean | null => {
		if (/without error|completed without/i.test(statusStr)) return true
		if (/error|fail/i.test(statusStr)) return false
		return null
	}
	try {
		if (isNvme) {
			const current = json?.nvme_self_test_log?.current_self_test_operation?.value
			const selfTestInProgress = typeof current === 'number' && current !== 0
			const statusStr = json?.nvme_self_test_log?.table?.[0]?.self_test_result?.string
			const lastSelfTest = typeof statusStr === 'string' ? {status: statusStr, passed: classify(statusStr)} : null
			return {selfTestInProgress, lastSelfTest}
		}
		const row = json?.ata_smart_self_test_log?.standard?.table?.[0]
		const statusStr = row?.status?.string
		const remaining = row?.status?.remaining_percent
		const inProgress =
			(typeof statusStr === 'string' && /in progress/i.test(statusStr)) || (typeof remaining === 'number' && remaining > 0)
		const lastSelfTest =
			typeof statusStr === 'string' && !/in progress/i.test(statusStr) ? {status: statusStr, passed: classify(statusStr)} : null
		return {selfTestInProgress: inProgress, lastSelfTest}
	} catch {
		return {selfTestInProgress: false, lastSelfTest: null}
	}
}

// Map one enumerated block device to its honest SmartDrive shape.
async function assembleDrive(dev: {id: string; name: string; transport: string}): Promise<SmartDrive> {
	const deviceId = dev.id
	const transport = dev.transport // raw lsblk string ('usb' reliable; else internal)
	const model = dev.name

	// Defaults represent the failure posture: nothing is 'healthy' until proven.
	const base: SmartDrive = {
		deviceId,
		transport,
		model,
		healthStatus: 'unavailable',
		severity: null,
		temperature: null,
		temperatureStatus: 'ok',
		detectionMethod: 'unsupported',
		reasons: [],
		attributes: [],
		selfTestInProgress: false,
		lastSelfTest: null,
	}

	// 1) auto-detect (correct for all direct-attached SATA/NVMe).
	const first = await readSmart(deviceId)
	let json: SmartctlJson | null = first.json
	let detectionMethod: SmartDetectionMethod

	if (readSucceeded(json)) {
		detectionMethod = json!.nvme_smart_health_information_log !== undefined ? 'nvme' : 'ata'
	} else if (transport === 'usb') {
		// 2) USB-SATA bridge fallback — the ONLY case that warrants `-d sat`.
		const retry = await readSmart(deviceId, 'sat')
		if (readSucceeded(retry.json)) {
			json = retry.json
			detectionMethod = 'sat'
		} else {
			// Genuinely unreadable enclosure ⇒ honest 'unavailable' (NEVER healthy).
			return {...base, detectionMethod: 'unsupported', healthStatus: 'unavailable'}
		}
	} else {
		// Internal drive first-read failure: most likely the sudoers grant is
		// missing ⇒ 'permission-denied'; else a genuine unsupported device.
		// Either way 'unavailable' (NEVER healthy).
		return {...base, detectionMethod: first.sudoDenied ? 'permission-denied' : 'unsupported', healthStatus: 'unavailable'}
	}

	// ── SUCCESS BRANCH ────────────────────────────────────────────────────
	// A SMART read genuinely resolved. This is the ONLY place a drive may be
	// declared 'healthy' (SMART-04). Run the matching pure evaluator.
	const isNvme = detectionMethod === 'nvme'
	const evalResult: SmartHealthEval = isNvme
		? evaluateNvmeHealth(json!.nvme_smart_health_information_log)
		: evaluateSataHealth({smart_status: json!.smart_status, ata_smart_attributes: json!.ata_smart_attributes})

	const rawTemp = json!.temperature
	const tempCelsius =
		typeof rawTemp === 'number'
			? rawTemp
			: typeof rawTemp === 'object' && typeof rawTemp?.current === 'number'
				? rawTemp.current
				: null

	const {selfTestInProgress, lastSelfTest} = readSelfTest(json!, isNvme)

	// Default posture stays 'unavailable' — the read RESOLVED a key, but that alone
	// is NOT a clean bill of health (H-02). Only a genuine positive signal upgrades
	// it, and only a failing signal marks it 'failing'.
	const drive: SmartDrive = {
		deviceId,
		transport,
		model,
		healthStatus: 'unavailable',
		severity: null,
		temperature: tempCelsius,
		temperatureStatus: evaluateTemperature(tempCelsius),
		detectionMethod,
		reasons: evalResult.reasons,
		attributes: evalResult.attributes,
		selfTestInProgress,
		lastSelfTest,
	}

	if (evalResult.severity) {
		// Genuine failing evidence (passed===false / tripped Backblaze-5 counter /
		// nonzero NVMe critical_warning) — the strongest signal, always wins.
		drive.healthStatus = 'failing'
		drive.severity = evalResult.severity
	} else if (evalResult.positiveEvidence && !hasErrorMessage(json)) {
		// ★ SMART-04 (H-02): the ONE and ONLY 'healthy' assignment. Requires POSITIVE
		// evidence (a real PASS / populated health surface) AND no error-severity
		// smartctl message. A technically-present-but-empty payload, or one carrying a
		// read error, falls through to the 'unavailable' default below — never 'healthy'.
		drive.healthStatus = 'healthy'
	}
	// else: resolved a key but no positive evidence (empty/uninformative payload) or a
	// logged read error → keep the honest 'unavailable' default, NEVER 'healthy'.

	return drive
}

// ── Exported surface (mirrors monitoring.ts — plain async fns) ──────────────

// Enumerate every block device (reusing getBlockDevices) and evaluate each.
export async function listDrives(): Promise<SmartDrive[]> {
	const devices = await getBlockDevices()
	const drives: SmartDrive[] = []
	// Sequential: privileged smartctl calls should not be fired in a burst.
	for (const dev of devices) {
		drives.push(await assembleDrive(dev))
	}
	return drives
}

export async function getDrive(deviceId: string): Promise<SmartDrive> {
	if (!DEVICE_ID_RE.test(deviceId)) throw new Error('[invalid-device-id]')
	const devices = await getBlockDevices()
	const dev = devices.find((device) => device.id === deviceId)
	if (!dev) throw new Error('[unknown-device]')
	return assembleDrive(dev)
}

// Trigger a firmware self-test (fire-and-forget — the test runs async in the
// drive; its RESULT is read back later via a subsequent listDrives scan).
export async function runSelfTest(deviceId: string, mode: 'short' | 'long'): Promise<{started: boolean}> {
	if (!DEVICE_ID_RE.test(deviceId)) throw new Error('[invalid-device-id]')

	// Reuse the drive's resolved detectionMethod to decide the `-d sat` need.
	const drive = await getDrive(deviceId).catch(() => null)
	const needsSat = drive?.detectionMethod === 'sat'

	// Wrapper mode enum (HIGH-01): the wrapper maps this to `smartctl -t short|long
	// [-d sat] /dev/<id>` root-side. No smartctl flag is passed through sudo.
	const wrapperMode = mode === 'short' ? 'selftest-short' : 'selftest-long'
	const args = ['-n', SMARTCTL_WRAPPER, deviceId, wrapperMode, ...(needsSat ? ['sat'] : [])]

	let stdout = ''
	let stderr = ''
	let exitCode = 1
	try {
		const res = await execa('sudo', args, {timeout: 20_000, reject: false})
		stdout = res.stdout ?? ''
		stderr = res.stderr ?? ''
		exitCode = res.exitCode ?? 0
	} catch {
		return {started: false}
	}

	const started = exitCode === 0 && !/already .* in progress/i.test(`${stderr}\n${stdout}`)
	return {started}
}
