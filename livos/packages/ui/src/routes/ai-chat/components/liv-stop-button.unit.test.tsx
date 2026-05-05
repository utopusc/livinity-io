/** Vitest tests for LivStopButton state machine + LivModelBadge text helper.
 * Phase 70-06 — covers CONTEXT D-22 (stop-button states) + D-31 (model badge fallback).
 *
 * Pure-helper extraction approach (P67-04 D-25 / 70-04 / 70-05 precedent):
 * `getStopButtonState` and `getModelBadgeText` are exported as side-effect-free
 * functions so tests hammer them deterministically without DOM/RTL.
 * D-NO-NEW-DEPS preserved (no @testing-library/react). */

import {describe, expect, it} from 'vitest'

import {getModelBadgeText} from './liv-model-badge'
import {getStopButtonState} from './liv-stop-button'

describe('getStopButtonState (D-22)', () => {
	it('returns streaming when isStreaming=true and not disabled (no content)', () => {
		expect(getStopButtonState({isStreaming: true, hasContent: false, disabled: false})).toBe('streaming')
	})

	it('returns streaming when isStreaming=true and not disabled (with content)', () => {
		// Streaming priority: even if hasContent true, isStreaming wins.
		expect(getStopButtonState({isStreaming: true, hasContent: true, disabled: false})).toBe('streaming')
	})

	it('returns send when not streaming + has content + not disabled', () => {
		expect(getStopButtonState({isStreaming: false, hasContent: true, disabled: false})).toBe('send')
	})

	it('returns disabled when no content + not streaming', () => {
		expect(getStopButtonState({isStreaming: false, hasContent: false, disabled: false})).toBe('disabled')
	})

	it('returns disabled when disabled prop set, even if streaming', () => {
		// Explicit disabled wins even over streaming — user can't stop a stream they don't own.
		expect(getStopButtonState({isStreaming: true, hasContent: false, disabled: true})).toBe('disabled')
	})

	it('returns disabled when disabled prop set, even with content', () => {
		expect(getStopButtonState({isStreaming: false, hasContent: true, disabled: true})).toBe('disabled')
	})

	it('returns disabled when disabled prop set + streaming + content (3-way explicit)', () => {
		expect(getStopButtonState({isStreaming: true, hasContent: true, disabled: true})).toBe('disabled')
	})

	it('handles undefined disabled (treats as false)', () => {
		expect(getStopButtonState({isStreaming: false, hasContent: true})).toBe('send')
		expect(getStopButtonState({isStreaming: false, hasContent: false})).toBe('disabled')
		expect(getStopButtonState({isStreaming: true, hasContent: false})).toBe('streaming')
	})
})

describe('getModelBadgeText (D-31, P77-01: default Claude)', () => {
	it('returns env value when set to a real model name', () => {
		expect(getModelBadgeText('Sonnet 4.5')).toBe('Sonnet 4.5')
		expect(getModelBadgeText('kimi-for-coding')).toBe('kimi-for-coding')
	})

	it('falls back to Claude when env undefined', () => {
		expect(getModelBadgeText(undefined)).toBe('Claude')
	})

	it('falls back to Claude when env null', () => {
		expect(getModelBadgeText(null)).toBe('Claude')
	})

	it('falls back to Claude when env empty string', () => {
		expect(getModelBadgeText('')).toBe('Claude')
	})

	it('falls back to Claude for whitespace-only env', () => {
		expect(getModelBadgeText('   ')).toBe('Claude')
		expect(getModelBadgeText('\t\n')).toBe('Claude')
	})
})
