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

export const SMARTCTL_BIN = '/usr/sbin/smartctl'

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

	return {severity, reasons, attributes}
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

	return {severity, reasons, attributes}
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
