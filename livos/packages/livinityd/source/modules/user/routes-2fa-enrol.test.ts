/**
 * Phase 368.7 — user.enable2fa enrolment contract.
 *
 * Pins the two server behaviours the setup wizard silently broke:
 *
 *   1. On a DB-backed session enable2fa ALWAYS returns one-time recovery codes.
 *      That return shape is what use-2fa keys its completion callback off, so a
 *      consumer that ignores `recoveryCodes` never learns the enrol succeeded.
 *      Onboarding ignored it and dead-ended (see 368.7-CONTEXT.md).
 *
 *   2. A second enrol attempt is rejected by the `alreadyEnabled` guard BEFORE
 *      the token is ever verified, with a message distinct from a wrong code.
 *      This is why retrying with a freshly scanned QR could never work, and why
 *      the UI must tell those two failures apart rather than shaking identically.
 *
 * Strategy mirrors stepup/routes.test.ts: createCallerFactory + a stubbed ctx,
 * DB DAOs mocked, TOTP real (so a genuine code is genuinely verified).
 */
import {describe, expect, test, vi, beforeEach} from 'vitest'

vi.mock('../security-audit/events.js', () => ({
	recordAuthLoginEvent: vi.fn(),
	recordStepUpEvent: vi.fn(),
}))

// Keep the real TOTP maths — only observe whether verify() is consulted at all.
vi.mock('../utilities/totp.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../utilities/totp.js')>()
	return {...actual, verify: vi.fn(actual.verify)}
})

// Only the enrolment DAOs are stubbed; everything else stays real so the router
// module still imports exactly as it does in production.
vi.mock('../database/index.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../database/index.js')>()
	return {
		...actual,
		isUserTotpEnabled: vi.fn(),
		enableUserTotp: vi.fn(),
	}
})

import {isUserTotpEnabled, enableUserTotp} from '../database/index.js'
import {generateUri, generateToken, verify} from '../utilities/totp.js'
import {t} from '../server/trpc/trpc.js'
import userRouter from './routes.js'

const createCaller = t.createCallerFactory(userRouter)

const USER_ID = 'user-A'
const RECOVERY_CODES = Array.from({length: 10}, (_, i) => `deadbeefcafe000${i}`)

function makeCtx() {
	return {
		dangerouslyBypassAuthentication: true,
		transport: 'http',
		currentUser: {id: USER_ID, username: 'alice', role: 'admin'},
		user: {is2faEnabled: async () => false, enable2fa: async () => true},
		livinityd: {store: {get: async () => undefined}},
		logger: {log() {}, error() {}, verbose() {}},
	} as never
}

beforeEach(() => {
	vi.mocked(isUserTotpEnabled).mockReset()
	vi.mocked(enableUserTotp).mockReset()
	vi.mocked(verify).mockClear()
})

describe('user.enable2fa — enrolment contract', () => {
	test('a valid code on the DB path returns one-time recovery codes', async () => {
		vi.mocked(isUserTotpEnabled).mockResolvedValue(false)
		vi.mocked(enableUserTotp).mockResolvedValue(RECOVERY_CODES)

		const totpUri = generateUri('Livinity', 'livinity.local')
		const result = await createCaller(makeCtx()).enable2fa({totpUri, totpToken: generateToken(totpUri)})

		// The shape the onboarding consumer must handle. A caller that only checks
		// for a falsy/empty `recoveryCodes` will never see a successful enrol here.
		expect(result).toEqual({recoveryCodes: RECOVERY_CODES})
		expect(vi.mocked(enableUserTotp)).toHaveBeenCalledWith(USER_ID, totpUri)
	})

	test('a wrong code is rejected as an incorrect code and enrols nothing', async () => {
		vi.mocked(isUserTotpEnabled).mockResolvedValue(false)

		const totpUri = generateUri('Livinity', 'livinity.local')
		await expect(createCaller(makeCtx()).enable2fa({totpUri, totpToken: '000000'})).rejects.toMatchObject({
			message: 'Incorrect 2FA code',
		})
		expect(vi.mocked(enableUserTotp)).not.toHaveBeenCalled()
	})

	test('a second enrol is refused BEFORE the code is verified, with its own message', async () => {
		// The state every stuck tester was in: the first code already enrolled them.
		vi.mocked(isUserTotpEnabled).mockResolvedValue(true)

		const totpUri = generateUri('Livinity', 'livinity.local')
		const perfectlyGoodCode = generateToken(totpUri)

		await expect(
			createCaller(makeCtx()).enable2fa({totpUri, totpToken: perfectlyGoodCode}),
		).rejects.toMatchObject({message: '2FA is already enabled'})

		// The distinction the UI relies on: this is NOT 'Incorrect 2FA code', and no
		// amount of re-scanning can change the outcome because the token is never
		// even looked at. Retrying here is futile by construction.
		expect(vi.mocked(verify)).not.toHaveBeenCalled()
		expect(vi.mocked(enableUserTotp)).not.toHaveBeenCalled()
	})
})
