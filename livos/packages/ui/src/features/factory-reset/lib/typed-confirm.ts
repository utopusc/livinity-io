// Phase 38 — D-CF-02: STRICT equality for the type-to-confirm gate.
// NO trim, NO lowercase, NO regex, NO normalization. The user must type the
// exact phrase 'FACTORY RESET' (case-sensitive, single space, no leading or
// trailing whitespace) to enable the destructive Confirm button.

export const EXPECTED_CONFIRM_PHRASE = 'FACTORY RESET'

export function isFactoryResetTrigger(input: string): boolean {
	return input === EXPECTED_CONFIRM_PHRASE
}
