// Phase 38 Plan 01 — D-MD-01 verbatim deletion list.
//
// The 7 items below are the EXACT consent surface of the factory-reset modal.
// They are rendered as a `<ul>` with one `<li>` per entry. The strings are
// VERBATIM from `.planning/phases/38-ui-factory-reset/38-CONTEXT.md` D-MD-01 —
// ZERO paraphrasing. If you need to change wording, update CONTEXT.md FIRST,
// then mirror the change here, then update the unit test.

export const DELETION_LIST: readonly string[] = [
	'All installed apps and their data',
	'All user accounts (admin, members, guests)',
	'All sessions, JWT tokens, and stored secrets',
	'All AI keys (Anthropic, OpenAI, Kimi, etc.)',
	'All schedules and automations',
	'All Docker volumes managed by LivOS',
	'All system settings and preferences',
] as const
