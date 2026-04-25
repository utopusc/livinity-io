// Phase 28 Plan 28-01 — log severity classifier (DOC-13).
//
// Heuristic-only — UI side filter, NOT a security boundary (T-28-04). The
// classifier returns null for unrecognized lines; the LogsViewer's severity
// filter shows ALL lines (including null) when the user picks 'ALL', and
// only matching-severity lines otherwise. Lines that classify to null when
// a non-ALL severity is selected are HIDDEN — documented inline in the
// viewer so it's an explicit decision, not a bug.
//
// Why word-boundary anchored regex? `errors_count=0` (a column name) is
// noise — should NOT trigger ERROR. `\b` matches between a word and non-word
// char, so 'errors_count' (where '_' is a word char) does NOT match `\berror\b`
// because there's no boundary on the right. The 'serror:' test guards
// against substring-style matches.
//
// Order matters: we check ERROR first so a line containing 'ERROR' AND
// 'INFO' classifies as ERROR (the more severe one wins).

export type Severity = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'

const ERROR_RE = /\b(error|err|fatal|panic|exception|failed|critical|crit)\b/i
const WARN_RE = /\b(warn|warning|deprecated)\b/i
const INFO_RE = /\b(info|notice)\b/i
const DEBUG_RE = /\b(debug|trace)\b/i

/**
 * Classify a log line by severity using the small word-boundary keyword set.
 * Returns null if no keyword matches (intentional — narrow heuristic per
 * CONTEXT decision: false positives are worse than false negatives here).
 */
export function classifySeverity(line: string): Severity | null {
	if (ERROR_RE.test(line)) return 'ERROR'
	if (WARN_RE.test(line)) return 'WARN'
	if (INFO_RE.test(line)) return 'INFO'
	if (DEBUG_RE.test(line)) return 'DEBUG'
	return null
}
