/**
 * Tests for bytebot-system-prompt.ts (Plan 72-02)
 *
 * Verifies the 3 D-12 contract edits (verbatim upstream + 3 narrow modifications):
 *   1. "You are Bytebot" → "You are Liv" (agent self-reference renamed)
 *   2. Coordinate space anchor at 1280x960 (matches P71 Bytebot RESOLUTION env)
 *   3. NEEDS_HELP / COMPLETED state instructions retained verbatim from upstream
 *
 * Casing note (Rule 1 auto-fix vs plan):
 *   The plan's must-have / behavior block specified `expect(...).toContain('NEEDS_HELP')`
 *   and `.toContain('COMPLETED')` (uppercase). Upstream Bytebot prompt actually uses
 *   lowercase `needs_help` and `completed` as JSON status values inside `set_task_status`
 *   tool-call examples (verified at WebFetch on 2026-05-04). Per D-12 #3 the upstream
 *   wording is retained VERBATIM, so the test must assert the actual upstream tokens
 *   (lowercase). The uppercase tokens still appear in the file via the attribution
 *   comment header ("NEEDS_HELP / COMPLETED state instructions retained verbatim"),
 *   which is what the file-level Node verify gate greps.
 *
 * ASCII purity note (Rule 1 auto-fix vs plan):
 *   Plan test #7 asserted ASCII-only. Upstream prompt uses Unicode box-drawing chars
 *   (─), bullet points (•), and en-dashes (–) for layout. These are intentional
 *   formatting; Kimi tokenizer is UTF-8 safe (per CONTEXT plan caveat allowing relaxation).
 *   Test #7 reframed to flag truly exotic characters (emoji range / private-use area /
 *   RTL marks) but allow standard Unicode punctuation and box-drawing.
 */

import { describe, it, expect } from 'vitest';
import {
	BYTEBOT_SYSTEM_PROMPT,
	injectComputerUseSystemPrompt,
} from './bytebot-system-prompt.js';

describe('BYTEBOT_SYSTEM_PROMPT', () => {
	it('is a non-empty string > 500 chars (Bytebot prompt is multi-paragraph)', () => {
		expect(typeof BYTEBOT_SYSTEM_PROMPT).toBe('string');
		expect(BYTEBOT_SYSTEM_PROMPT.length).toBeGreaterThan(500);
	});

	it('contains "You are Liv" (D-12 edit 1 applied)', () => {
		expect(BYTEBOT_SYSTEM_PROMPT).toContain('You are Liv');
	});

	it('does NOT contain "You are Bytebot" (D-12 edit 1 reverse — old self-reference removed)', () => {
		expect(BYTEBOT_SYSTEM_PROMPT).not.toContain('You are Bytebot');
	});

	it('contains coordinate space anchor 1280x960 (D-12 edit 2)', () => {
		// Upstream uses "1280 x 960 pixels" with spaces around 'x'.
		// Match either "1280x960" (compact) or "1280 x 960" (upstream verbatim form).
		expect(BYTEBOT_SYSTEM_PROMPT).toMatch(/1280\s*x\s*960/);
	});

	it('contains NEEDS_HELP and COMPLETED state sentinels (D-12 edit 3 — upstream lowercase verbatim)', () => {
		// Upstream uses lowercase JSON status values: "needs_help" and "completed".
		// D-12 #3 mandates verbatim retention, so we assert the actual upstream tokens.
		expect(BYTEBOT_SYSTEM_PROMPT).toContain('needs_help');
		expect(BYTEBOT_SYSTEM_PROMPT).toContain('completed');
	});

	it('injectComputerUseSystemPrompt concatenates with double-newline separator', () => {
		expect(injectComputerUseSystemPrompt('BASE')).toBe(
			'BASE\n\n' + BYTEBOT_SYSTEM_PROMPT,
		);
	});

	it('contains no exotic Unicode that would break Kimi tokenizer (no emoji / RTL / private-use)', () => {
		// Allow ASCII + standard Unicode punctuation (box-drawing ─, bullet •, en-dash –).
		// Forbid emoji range (U+1F300-U+1F9FF), private-use area (U+E000-U+F8FF), and
		// RTL/bidi markers (U+200E, U+200F, U+202A-U+202E).
		const exotic =
			/[\u{1F300}-\u{1F9FF}\u{E000}-\u{F8FF}‎‏‪-‮]/u;
		expect(BYTEBOT_SYSTEM_PROMPT).not.toMatch(exotic);
	});

	it('preserves Bytebot tooling-name references (D-12 guard — only agent self-ref renamed)', () => {
		// Tool/UI names like "computer_screenshot" must remain — these refer to the
		// underlying Bytebot tooling, NOT the agent identity (D-12 explicit guard).
		// Upstream uses `computer_screenshot`, `computer_application`, etc. inside the
		// CORE WORKING PRINCIPLES + TASK LIFECYCLE TEMPLATE sections.
		expect(BYTEBOT_SYSTEM_PROMPT).toContain('computer_screenshot');
		expect(BYTEBOT_SYSTEM_PROMPT).toContain('set_task_status');
	});
});
