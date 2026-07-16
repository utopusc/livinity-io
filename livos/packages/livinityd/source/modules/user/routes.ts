import crypto from 'node:crypto'

import {TRPCError} from '@trpc/server'
import {z} from 'zod'
import bcrypt from 'bcryptjs'

import {router, publicProcedure, privateProcedure, adminProcedure} from '../server/trpc/trpc.js'
import * as totp from '../utilities/totp.js'
import {
	getPool,
	findUserById,
	findUserByUsername,
	createUser,
	getAdminUser,
	listUsers,
	listUserQuotas,
	updateUserQuota,
	updateUserRole,
	toggleUserActive,
	updateUserDisplayName,
	createInvite,
	findValidInvite,
	markInviteUsed,
	getUserPreference,
	setUserPreference,
	getUserPreferences,
	deleteUserPreference,
	deleteUser,
	isUserTotpEnabled,
	validateUserTotpToken,
	enableUserTotp,
	disableUserTotp,
	consumeUserRecoveryCode,
	adminResetUserTotp,
} from '../database/index.js'
import {createSession, revokeSessionsForUser, listSessions as listUserSessions, revokeSession as revokeUserSession} from '../database/sessions.js'
import {recordAuthLoginEvent} from '../security-audit/events.js'
import {getRequire2fa, setRequire2fa} from '../security/policy.js'
// Phase 323-02 (IDENT-03) — additive passkey / WebAuthn ceremony routes.
import {
	generateRegistrationOptions,
	verifyRegistrationResponse,
	generateAuthenticationOptions,
	verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import {insertCredential, listCredentialsForUser, getCredentialById, updateCounter, deleteCredential} from '../database/webauthn.js'
import {resolveRpId} from './webauthn-rp.js'
import {assertVerificationPassed, assertCounterOk} from './webauthn-guards.js'

const ONE_SECOND = 1000
const ONE_MINUTE = 60 * ONE_SECOND
const ONE_HOUR = 60 * ONE_MINUTE
const ONE_DAY = 24 * ONE_HOUR
const ONE_WEEK = 7 * ONE_DAY

const DEFAULT_WALLPAPER = 'aurora'

// Phase 323-02 (IDENT-03) — WebAuthn ceremony helpers.
//
// The RP-ID / expectedOrigin / expectedRPID are ALL server-derived from the
// box's OWN configured mainDomain (Redis `livos:domain:config`, the same source
// buildCaddyConfig uses: `config.active ? config.domain : null`) — NEVER a
// client-supplied host header. A bare-LAN-IP box (mainDomain null) has no RP-ID
// and no secure context, so `resolveRpId` returns null and the ceremony is
// unavailable (fails closed). Single-use challenges live in Redis under this
// prefix, SETEX 60s, deleted BEFORE verify so a failed verify cannot retry.
const WEBAUTHN_CHALLENGE_PREFIX = 'webauthn:chal:'
const WEBAUTHN_CHALLENGE_TTL_SECONDS = 60
const WEBAUTHN_RP_NAME = 'Livinity'

// Read the box's active mainDomain (host-only) — null when unconfigured / on a
// bare-LAN-IP box. Mirrors the logout cookie-domain read + domain/routes.ts
// buildCaddyConfig. Fails closed to null on any parse / Redis error.
async function readMainDomain(redis: {get: (key: string) => Promise<string | null>}): Promise<string | null> {
	try {
		const raw = await redis.get('livos:domain:config')
		if (!raw) return null
		const dc = JSON.parse(raw) as {domain?: string; active?: boolean}
		return dc.active && dc.domain ? dc.domain : null
	} catch {
		return null
	}
}

// Phase 257-04 WS-A (LIVOS-023): the old `sessionCookieDomain()` helper widened
// the LIVINITY_SESSION cookie to the registrable parent (`.livinity.io`) so it
// would reach the hyphen-sibling app subdomains — but that leaked the session JWT
// to the shared platform host (livinity.io / apps.livinity.io) and sibling
// tenants. It has been REMOVED from the SET path: the session cookie is now
// host-only and cross-subdomain app auth goes through the 256-04 forward_auth
// gate. NOTE: the logout clear path below DELIBERATELY keeps the wide
// `.${dc.domain}` clear so an already-logged-in browser still holding a
// previously-widened stale `.livinity.io` session cookie can flush it (a
// host-only clearCookie would NOT remove a domain-scoped cookie).

export default router({
	// Registers a new user
	register: publicProcedure
		.input(
			z.object({
				name: z.string(),
				password: z.string().min(6, 'Password must be at least 6 characters'),
				language: z.string().optional().default('en'),
			}),
		)
		.mutation(async ({ctx, input}) => {
			// Check the user hasn't already signed up (YAML legacy check)
			if (await ctx.user.exists()) {
				throw new TRPCError({code: 'UNAUTHORIZED', message: 'Attempted to register when user is already registered'})
			}

			// Register new user in YAML (legacy)
			await ctx.user.register(input.name, input.password, input.language)

			// Also create in PostgreSQL if available
			const pool = getPool()
			if (pool) {
				try {
					const username = input.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'admin'
					const hashedPassword = await ctx.livinityd.store.get('user.hashedPassword' as any)

					// First user is always admin
					const existingUsers = await listUsers()
					const role = existingUsers.length === 0 ? 'admin' : 'member'

					await createUser({
						username,
						displayName: input.name,
						hashedPassword: hashedPassword || '',
						role,
					})
					ctx.logger.log(`Created user "${input.name}" in database as ${role}`)
				} catch (error) {
					// Log but don't fail -- YAML registration already succeeded
					ctx.logger.error('Failed to create user in database during registration', error)
				}
			}

			return true
		}),

	// Public method to check if a user exists (YAML legacy OR PostgreSQL)
	exists: publicProcedure.query(async ({ctx}) => {
		// Check YAML store first (legacy)
		if (await ctx.user.exists()) return true
		// Fall back to PostgreSQL — users exist there after multi-user migration
		const pool = getPool()
		if (pool) {
			const {rows} = await pool.query('SELECT 1 FROM users LIMIT 1')
			if (rows.length > 0) return true
		}
		return false
	}),

	// Given valid credentials returns a token for a user
	login: publicProcedure
		.input(
			z.object({
				password: z.string(),
				totpToken: z.string().optional(),
				// Optional username for multi-user login
				username: z.string().optional(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			let dbUserId: string | undefined
			let dbUserRole: string | undefined
			// SEC-01: resolvable actor for auth-login audit rows. Starts as the
			// NIL UUID; upgraded to the real account id the moment the user is
			// resolved so a wrong-password failure still attributes correctly.
			let auditUserId = '00000000-0000-0000-0000-000000000000'

			const pool = getPool()

			// If a username is provided and DB is available, try DB-based auth
			if (input.username && pool) {
				const dbUser = await findUserByUsername(input.username)
				if (!dbUser) {
					// SEC-01 Pitfall 2: login is publicProcedure so the adminProcedure audit middleware never sees it — record manually here (success AND failure). NEVER pass the password/totpToken.
					void recordAuthLoginEvent({userId: auditUserId, success: false, error: 'invalid_credentials'})
					throw new TRPCError({code: 'UNAUTHORIZED', message: 'Incorrect password'})
				}
				// Attribute later failures (disabled / bad password) to the resolved account.
				auditUserId = dbUser.id
				if (!dbUser.isActive) {
					void recordAuthLoginEvent({userId: auditUserId, success: false, error: 'account_disabled'})
					throw new TRPCError({code: 'UNAUTHORIZED', message: 'Account is disabled'})
				}

				const validPassword = await bcrypt.compare(input.password, dbUser.hashedPassword)
				if (!validPassword) {
					void recordAuthLoginEvent({userId: auditUserId, success: false, error: 'invalid_credentials'})
					throw new TRPCError({code: 'UNAUTHORIZED', message: 'Incorrect password'})
				}

				// IDENT-05 — DB-user 2FA (the legacy YAML check below only covers
				// no-username logins). Accept a valid TOTP OR a one-time recovery
				// code (escape hatch — a lost authenticator never bricks the account,
				// admin included). A DB user WITHOUT TOTP is NOT blocked here even when
				// the org policy is on: user.requires2faSetup drives a post-login enrol
				// redirect (D-328-3 grace period), never a hard lockout.
				if (await isUserTotpEnabled(dbUser.id)) {
					if (!input.totpToken) {
						void recordAuthLoginEvent({userId: dbUser.id, success: false, error: 'missing_2fa'})
						throw new TRPCError({code: 'UNAUTHORIZED', message: 'Missing 2FA code'})
					}
					const ok =
						(await validateUserTotpToken(dbUser.id, input.totpToken)) ||
						(await consumeUserRecoveryCode(dbUser.id, input.totpToken))
					if (!ok) {
						void recordAuthLoginEvent({userId: dbUser.id, success: false, error: 'incorrect_2fa'})
						throw new TRPCError({code: 'UNAUTHORIZED', message: 'Incorrect 2FA code'})
					}
				}

				dbUserId = dbUser.id
				dbUserRole = dbUser.role
			} else {
				// Legacy single-user login via YAML
				if (!(await ctx.user.validatePassword(input.password))) {
					void recordAuthLoginEvent({userId: auditUserId, success: false, error: 'invalid_credentials'})
					throw new TRPCError({code: 'UNAUTHORIZED', message: 'Incorrect password'})
				}

				// If DB is available, look up the admin user to include userId in token
				if (pool) {
					const adminUser = await getAdminUser()
					if (adminUser) {
						dbUserId = adminUser.id
						dbUserRole = adminUser.role
					}
				}
			}

			// 2FA (only for YAML-based users for now)
			if (!input.username && (await ctx.user.is2faEnabled())) {
				// Check we have a token
				if (!input.totpToken) {
					void recordAuthLoginEvent({userId: dbUserId ?? auditUserId, success: false, error: 'missing_2fa'})
					throw new TRPCError({code: 'UNAUTHORIZED', message: 'Missing 2FA code'})
				}

				// Verify the token
				if (!(await ctx.user.validate2faToken(input.totpToken))) {
					void recordAuthLoginEvent({userId: dbUserId ?? auditUserId, success: false, error: 'incorrect_2fa'})
					throw new TRPCError({code: 'UNAUTHORIZED', message: 'Incorrect 2FA code'})
				}
			}

			// At this point we have a valid login

			// Set proxy token cookie
			const proxyToken = await ctx.server.signProxyToken()
			const expires = new Date(Date.now() + ONE_WEEK)
			ctx.response!.cookie('LIVINITY_PROXY_TOKEN', proxyToken, {
				httpOnly: true,
				expires,
				sameSite: 'lax',
			})

			// Generate the API token
			const apiToken = dbUserId && dbUserRole
				? await ctx.server.signUserToken(dbUserId, dbUserRole)
				: await ctx.server.signToken()

			// Phase 257-04 (LIVOS-005): record a revocable session row keyed off
			// the token's jti so a later password change / deactivation can kill
			// this token. Only for DB-backed user tokens (legacy single-user
			// tokens carry no jti and there is no sessions table to write).
			if (dbUserId && pool) {
				try {
					const verified = await ctx.server.verifyToken(apiToken)
					if (verified?.jti) {
						await createSession({
							userId: dbUserId,
							jti: verified.jti,
							expiresAt: new Date(Date.now() + ONE_WEEK),
						})
					}
				} catch (error) {
					// Non-fatal: a failed session record must not block login.
					ctx.logger.error('Failed to record session for revocation tracking', error)
				}
			}

			// Phase 257-04 WS-A (LIVOS-023): the LIVINITY_SESSION cookie is now
			// HOST-ONLY. Previously it was widened to the registrable parent
			// (`.livinity.io`) so it would reach the hyphen-sibling app subdomains
			// (`<app>-<user>.livinity.io`) — but that also leaked the session JWT
			// to the SHARED platform host (livinity.io / apps.livinity.io on
			// Server5) and to every sibling tenant. Cross-subdomain app auth is
			// handled by the 256-04 forward_auth gate, NOT by a widened cookie, so
			// we drop the `domain` attribute entirely (sent only to the exact host
			// that set it). The LIVINITY_PROXY_TOKEN cookie (above) was already
			// host-only and is left unchanged.
			ctx.response!.cookie('LIVINITY_SESSION', apiToken, {
				httpOnly: true,
				secure: true,
				sameSite: 'lax',
				maxAge: 30 * ONE_DAY,
			})

			void recordAuthLoginEvent({userId: dbUserId ?? auditUserId, success: true})
			return apiToken
		}),

	// Checks if the request has a valid token
	isLoggedIn: publicProcedure.query(async ({ctx}) => {
		try {
			const token = ctx.request!.headers.authorization?.split(' ')[1]
			await ctx.server.verifyToken(token!)
			return true
		} catch {
			return false
		}
	}),

	// Returns a new token for a user
	renewToken: privateProcedure.mutation(async ({ctx}) => {
		// Renew proxy token cookie
		const proxyToken = await ctx.server.signProxyToken()
		const expires = new Date(Date.now() + ONE_WEEK)
		ctx.response!.cookie('LIVINITY_PROXY_TOKEN', proxyToken, {
			httpOnly: true,
			expires,
			sameSite: 'lax',
		})

		// If we have a current user from middleware, sign a user-scoped token
		if (ctx.currentUser) {
			return ctx.server.signUserToken(ctx.currentUser.id, ctx.currentUser.role)
		}

		// Otherwise return legacy API token
		return ctx.server.signToken()
	}),

	// Deletes the proxy token cookie
	// The JWT needs to be deleted from the client side
	logout: privateProcedure.mutation(async ({ctx}) => {
		// Read domain for cookie clearing
		let cookieDomain: string | undefined
		try {
			const domainConfigRaw = await ctx.livinityd.ai.redis.get('livos:domain:config')
			if (domainConfigRaw) {
				const dc = JSON.parse(domainConfigRaw)
				if (dc.active && dc.domain) cookieDomain = `.${dc.domain}`
			}
		} catch { /* ignore */ }

		ctx.response!.clearCookie('LIVINITY_PROXY_TOKEN')
		ctx.response!.clearCookie('LIVINITY_SESSION', {
			...(cookieDomain ? {domain: cookieDomain} : {}),
		})

		return true
	}),

	// Change the user's password
	changePassword: privateProcedure
		.input(
			z.object({
				oldPassword: z.string(),
				newPassword: z.string().min(6, 'Password must be at least 6 characters'),
			}),
		)
		.mutation(async ({ctx, input}) => {
			// Validate old password
			if (!(await ctx.user.validatePassword(input.oldPassword))) {
				throw new TRPCError({code: 'UNAUTHORIZED', message: 'Incorrect password'})
			}

			// Update in YAML
			await ctx.user.setPassword(input.newPassword)

			// Also update in PostgreSQL if current user is known
			const pool = getPool()
			if (pool && ctx.currentUser) {
				try {
					const saltRounds = 12
					const hashedPassword = (await bcrypt.hash(input.newPassword, saltRounds)).replace(/^\$2a\$/, '$2b$')
					await pool.query('UPDATE users SET hashed_password = $1, updated_at = NOW() WHERE id = $2', [
						hashedPassword,
						ctx.currentUser.id,
					])
					// Phase 257-04 (LIVOS-005): a password change revokes every
					// outstanding session for this user, so any previously-issued
					// JWT is rejected on its next request.
					await revokeSessionsForUser(ctx.currentUser.id)
				} catch (error) {
					ctx.logger.error('Failed to update password in database', error)
				}
			}

			return true
		}),

	// Generates a new random 2FA TOTP URI
	generateTotpUri: privateProcedure.query(async () => totp.generateUri('Livinity', 'livinity.local')),

	// Enables 2FA
	enable2fa: privateProcedure
		.input(
			z.object({
				totpUri: z.string(),
				totpToken: z.string(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			// IDENT-05 — currentUser-aware: a DB-backed session enrols per-user DB
			// TOTP (returns one-time recovery codes shown ONCE); the legacy YAML
			// single-owner path is preserved unchanged for no-DB boxes.
			const alreadyEnabled = ctx.currentUser
				? await isUserTotpEnabled(ctx.currentUser.id)
				: await ctx.user.is2faEnabled()
			if (alreadyEnabled) {
				throw new TRPCError({code: 'UNAUTHORIZED', message: '2FA is already enabled'})
			}

			// Verify the token
			if (!totp.verify(input.totpUri, input.totpToken)) {
				throw new TRPCError({code: 'UNAUTHORIZED', message: 'Incorrect 2FA code'})
			}

			if (ctx.currentUser) {
				const recoveryCodes = await enableUserTotp(ctx.currentUser.id, input.totpUri)
				return {recoveryCodes}
			}
			// Legacy YAML path (no-DB boxes) unchanged.
			return ctx.user.enable2fa(input.totpUri)
		}),

	is2faEnabled: publicProcedure.query(async ({ctx}) => {
		if (ctx.currentUser) return isUserTotpEnabled(ctx.currentUser.id)
		return ctx.user.is2faEnabled()
	}),

	// ─── Phase 323-02 (IDENT-03) — Passkey / WebAuthn ceremony routes ───────────
	//
	// ADDITIVE-NEVER-REPLACING (D-03): these four procedures are a NEW alternative
	// first factor. The password+TOTP `login` branches (above) stay fully intact
	// and reachable — a user who enrolled a passkey then lost the device STILL logs
	// in via password+TOTP. is-authenticated.ts / the apex gate / requireRole are
	// untouched because `loginWithPasskey` reuses the EXACT session-mint tail.

	// webauthnAvailable — CHECKER FIX 2: is WebAuthn usable on THIS box? True only
	// when resolveRpId(mainDomain) !== null (false on a bare-LAN-IP box). The
	// enroll/login UI (323-03/04) consumes this to HIDE the passkey button rather
	// than surface a dead one (D-02 "surfaced in UI"). Wired to the REAL
	// resolveRpId(mainDomain) server call — never a hardcoded true.
	webauthnAvailable: publicProcedure.query(async ({ctx}) => {
		const mainDomain = await readMainDomain(ctx.livinityd!.ai.redis)
		return {available: resolveRpId(mainDomain) !== null}
	}),

	// webauthnRegisterOptions — privateProcedure (D-03: enroll ONLY while already
	// authenticated). Generates registration options against the SERVER-derived
	// RP-ID and SETEXes the single-use challenge keyed on the current user.
	webauthnRegisterOptions: privateProcedure.query(async ({ctx}) => {
		if (!ctx.currentUser) {
			throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Passkey unavailable'})
		}
		const redis = ctx.livinityd!.ai.redis
		const mainDomain = await readMainDomain(redis)
		const rpID = resolveRpId(mainDomain)
		if (!rpID) {
			// LAN-IP box: no RP-ID, no secure context — ceremony unavailable.
			throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Passkey unavailable on this box'})
		}

		const existing = await listCredentialsForUser(ctx.currentUser.id)
		const options = await generateRegistrationOptions({
			rpName: WEBAUTHN_RP_NAME,
			rpID,
			userName: ctx.currentUser.username,
			userID: new TextEncoder().encode(ctx.currentUser.id),
			attestationType: 'none',
			authenticatorSelection: {residentKey: 'preferred', userVerification: 'preferred'},
			// Exclude already-enrolled credentials so the same authenticator is not
			// double-registered. transports omitted (optional hint only).
			excludeCredentials: existing.map((c) => ({id: c.credential_id})),
		})

		// SETEX single-use challenge. Redis WRITE fails OPEN (a Redis outage must
		// not brick enroll) — but the later verify still fails CLOSED on a missing
		// challenge. Never log the raw challenge.
		try {
			await redis.set(
				`${WEBAUTHN_CHALLENGE_PREFIX}${ctx.currentUser.id}`,
				options.challenge,
				'EX',
				WEBAUTHN_CHALLENGE_TTL_SECONDS,
			)
		} catch (error) {
			ctx.logger!.error('[webauthn] register challenge store failed — failing open', error)
		}

		return options
	}),

	// webauthnRegisterVerify — privateProcedure. Reads + DELETES the challenge
	// BEFORE verify (single-use, no stale-challenge retry), runs
	// verifyRegistrationResponse (exception -> UNAUTHORIZED), then the
	// fail-closed assertVerificationPassed guard, then persists the v13 NESTED
	// registrationInfo.credential.* . Audit fires on success AND failure (SEC-01).
	webauthnRegisterVerify: privateProcedure
		.input(z.object({response: z.any()}))
		.mutation(async ({ctx, input}) => {
			if (!ctx.currentUser) {
				throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Passkey unavailable'})
			}
			const userId = ctx.currentUser.id
			const redis = ctx.livinityd!.ai.redis
			const mainDomain = await readMainDomain(redis)
			const rpID = resolveRpId(mainDomain)
			if (!rpID) {
				throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Passkey unavailable on this box'})
			}

			const key = `${WEBAUTHN_CHALLENGE_PREFIX}${userId}`
			let verification
			try {
				// Single-use: read + DELETE the challenge BEFORE verify — a failed or
				// replayed verify finds no challenge and cannot retry a stale one.
				const stored = await redis.get(key)
				await redis.del(key)
				if (!stored) throw new TRPCError({code: 'UNAUTHORIZED', message: 'Passkey verification failed'})
				verification = await verifyRegistrationResponse({
					response: input.response,
					expectedChallenge: stored,
					expectedOrigin: `https://${rpID}`,
					expectedRPID: rpID,
				})
			} catch (error) {
				void recordAuthLoginEvent({userId, success: false, error: 'passkey_register_failed'})
				if (error instanceof TRPCError) throw error
				// NEVER fail open (CVE-2026-11883): any verify exception -> UNAUTHORIZED.
				throw new TRPCError({code: 'UNAUTHORIZED', message: 'Passkey verification failed'})
			}

			// Fail closed on verified!==true (belt-and-braces with the try/catch above).
			assertVerificationPassed(verification)
			const info = verification.registrationInfo
			if (!info) {
				void recordAuthLoginEvent({userId, success: false, error: 'passkey_register_failed'})
				throw new TRPCError({code: 'UNAUTHORIZED', message: 'Passkey verification failed'})
			}

			// Persist from the v13 NESTED registrationInfo.credential.* shape. The
			// public_key is a Uint8Array -> stored base64url (non-secret). Never log
			// the raw credential/response body.
			await insertCredential(userId, {
				credentialId: info.credential.id,
				publicKey: Buffer.from(info.credential.publicKey).toString('base64url'),
				counter: info.credential.counter,
				transports: info.credential.transports ?? null,
			})
			void recordAuthLoginEvent({userId, success: true})
			return {verified: true}
		}),

	// listPasskeys — privateProcedure (323-04 manage list). Returns ONLY the
	// current user's enrolled credentials (credential_id, nickname, created_at) —
	// never the public_key/counter. Wraps the 323-01 listCredentialsForUser DAO
	// (built explicitly for "the manage list UI") which is user-scoped, so a user
	// can only ever see their OWN passkeys (T-323-13). Fails open ([]) on no-DB /
	// legacy single-user boxes.
	listPasskeys: privateProcedure.query(async ({ctx}) => {
		if (!ctx.currentUser) return []
		const creds = await listCredentialsForUser(ctx.currentUser.id)
		return creds.map((c) => ({
			credentialId: c.credential_id,
			nickname: c.nickname,
			createdAt: c.created_at,
		}))
	}),

	// deletePasskey — privateProcedure (323-04 manage-list revoke). Deletes ONE of
	// the current user's credentials. deleteCredential is (credential_id, user_id)-
	// scoped in the 323-01 DAO, so the UI never sends a target userId and a user can
	// NEVER delete another user's passkey (T-323-13). Idempotent: {removed:false} on
	// a miss / wrong owner / no-DB.
	deletePasskey: privateProcedure
		.input(z.object({credentialId: z.string().min(1)}))
		.mutation(async ({ctx, input}) => {
			if (!ctx.currentUser) {
				throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Passkey unavailable'})
			}
			const removed = await deleteCredential(input.credentialId, ctx.currentUser.id)
			return {removed}
		}),

	// webauthnLoginOptions — publicProcedure (an UNAUTHENTICATED caller starts the
	// login ceremony). Discoverable-credential flow: no username required. The
	// single-use challenge is keyed on a server-issued nonce (challengeId) that is
	// returned to the client and echoed back on verify.
	webauthnLoginOptions: publicProcedure.query(async ({ctx}) => {
		const redis = ctx.livinityd!.ai.redis
		const mainDomain = await readMainDomain(redis)
		const rpID = resolveRpId(mainDomain)
		if (!rpID) {
			throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Passkey unavailable on this box'})
		}

		const options = await generateAuthenticationOptions({rpID, userVerification: 'preferred'})
		const challengeId = crypto.randomUUID()
		// SETEX single-use challenge (fails OPEN on a Redis write error; the verify
		// still fails CLOSED on a missing challenge). Never log the raw challenge.
		try {
			await redis.set(
				`${WEBAUTHN_CHALLENGE_PREFIX}${challengeId}`,
				options.challenge,
				'EX',
				WEBAUTHN_CHALLENGE_TTL_SECONDS,
			)
		} catch (error) {
			ctx.logger!.error('[webauthn] login challenge store failed — failing open', error)
		}

		return {options, challengeId}
	}),

	// loginWithPasskey — publicProcedure. Resolves the account ONLY via
	// getCredentialById(response.id) -> findUserById (an unknown credential fails
	// CLOSED, no fallthrough), verifies the assertion (never fail open), guards the
	// counter against clones, bumps it, then FALLS INTO the existing session-mint
	// tail VERBATIM (signProxyToken -> signUserToken -> createSession ->
	// LIVINITY_SESSION host-only cookie -> recordAuthLoginEvent). The password+TOTP
	// login branches are untouched — this is a NEW alternative first factor (D-03).
	loginWithPasskey: publicProcedure
		.input(z.object({challengeId: z.string(), response: z.any()}))
		.mutation(async ({ctx, input}) => {
			const NIL_UUID = '00000000-0000-0000-0000-000000000000'
			const redis = ctx.livinityd!.ai.redis
			const mainDomain = await readMainDomain(redis)
			const rpID = resolveRpId(mainDomain)
			if (!rpID) {
				throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Passkey unavailable on this box'})
			}

			// Resolve which user this credential belongs to. Unknown credential_id
			// (cross-box / never enrolled) -> null -> UNAUTHORIZED (fail closed).
			const credentialId = String((input.response as {id?: unknown})?.id ?? '')
			const cred = await getCredentialById(credentialId)
			if (!cred) {
				void recordAuthLoginEvent({userId: NIL_UUID, success: false, error: 'passkey_unknown_credential'})
				throw new TRPCError({code: 'UNAUTHORIZED', message: 'Passkey verification failed'})
			}

			const key = `${WEBAUTHN_CHALLENGE_PREFIX}${input.challengeId}`
			let verification
			try {
				// Single-use: read + DELETE the challenge BEFORE verify (no stale retry).
				const stored = await redis.get(key)
				await redis.del(key)
				if (!stored) throw new TRPCError({code: 'UNAUTHORIZED', message: 'Passkey verification failed'})
				verification = await verifyAuthenticationResponse({
					response: input.response,
					expectedChallenge: stored,
					expectedOrigin: `https://${rpID}`,
					expectedRPID: rpID,
					credential: {
						id: cred.credential_id,
						publicKey: Buffer.from(cred.public_key, 'base64url'),
						counter: Number(cred.counter),
					},
				})
			} catch (error) {
				void recordAuthLoginEvent({userId: cred.user_id, success: false, error: 'passkey_verify_failed'})
				if (error instanceof TRPCError) throw error
				// NEVER fail open (CVE-2026-11883): any verify exception -> UNAUTHORIZED.
				throw new TRPCError({code: 'UNAUTHORIZED', message: 'Passkey verification failed'})
			}

			// Fail closed on verified!==true; reject a cloned-authenticator counter
			// regression BEFORE the mint tail runs.
			assertVerificationPassed(verification)
			const newCounter = verification.authenticationInfo.newCounter
			assertCounterOk(Number(cred.counter), newCounter)
			await updateCounter(cred.credential_id, newCounter)

			// Resolve the account row; a dangling credential (user deleted) fails closed.
			const dbUser = await findUserById(cred.user_id)
			if (!dbUser) {
				void recordAuthLoginEvent({userId: cred.user_id, success: false, error: 'passkey_unknown_user'})
				throw new TRPCError({code: 'UNAUTHORIZED', message: 'Passkey verification failed'})
			}
			// WR-01: fail CLOSED on a deactivated account at the point of
			// authentication (mirrors the password path :185-188) — never mint a
			// token or record a success event for a disabled user. Audit shape is
			// identical (success:false, error:'account_disabled'); the message stays
			// the opaque 'Passkey verification failed' (no user-enumeration oracle).
			if (!dbUser.isActive) {
				void recordAuthLoginEvent({userId: dbUser.id, success: false, error: 'account_disabled'})
				throw new TRPCError({code: 'UNAUTHORIZED', message: 'Passkey verification failed'})
			}
			const dbUserId = dbUser.id
			const dbUserRole = dbUser.role

			// ─── session-mint tail (reused VERBATIM from `login`, :215-267) ──────────
			// Set proxy token cookie
			const proxyToken = await ctx.server!.signProxyToken()
			const expires = new Date(Date.now() + ONE_WEEK)
			ctx.response!.cookie('LIVINITY_PROXY_TOKEN', proxyToken, {
				httpOnly: true,
				expires,
				sameSite: 'lax',
			})

			// Generate the API token
			const apiToken = dbUserId && dbUserRole
				? await ctx.server!.signUserToken(dbUserId, dbUserRole)
				: await ctx.server!.signToken()

			// Record a revocable session row keyed off the token's jti (LIVOS-005).
			const pool = getPool()
			if (dbUserId && pool) {
				try {
					const verified = await ctx.server!.verifyToken(apiToken)
					if (verified?.jti) {
						await createSession({
							userId: dbUserId,
							jti: verified.jti,
							expiresAt: new Date(Date.now() + ONE_WEEK),
						})
					}
				} catch (error) {
					// Non-fatal: a failed session record must not block login.
					ctx.logger!.error('Failed to record session for revocation tracking', error)
				}
			}

			// LIVINITY_SESSION is HOST-ONLY (LIVOS-023) — no domain attribute.
			ctx.response!.cookie('LIVINITY_SESSION', apiToken, {
				httpOnly: true,
				secure: true,
				sameSite: 'lax',
				maxAge: 30 * ONE_DAY,
			})

			void recordAuthLoginEvent({userId: dbUserId, success: true})
			return apiToken
		}),

	// Disables 2FA
	disable2fa: privateProcedure
		.input(
			z.object({
				totpToken: z.string(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			// IDENT-05 — currentUser-aware. A DB user disables per-user DB TOTP;
			// accept a valid TOTP OR a one-time recovery code (escape hatch).
			const enabled = ctx.currentUser
				? await isUserTotpEnabled(ctx.currentUser.id)
				: await ctx.user.is2faEnabled()
			if (!enabled) {
				throw new TRPCError({code: 'UNAUTHORIZED', message: '2FA is not enabled'})
			}

			if (ctx.currentUser) {
				const ok =
					(await validateUserTotpToken(ctx.currentUser.id, input.totpToken)) ||
					(await consumeUserRecoveryCode(ctx.currentUser.id, input.totpToken))
				if (!ok) {
					throw new TRPCError({code: 'UNAUTHORIZED', message: 'Incorrect 2FA code'})
				}
				return disableUserTotp(ctx.currentUser.id)
			}

			// Legacy YAML path (no-DB boxes) unchanged.
			if (!(await ctx.user.validate2faToken(input.totpToken))) {
				throw new TRPCError({code: 'UNAUTHORIZED', message: 'Incorrect 2FA code'})
			}
			return ctx.user.disable2fa()
		}),

	// WR-04 — admin anti-lockout escape hatch (IDENT-05). An admin clears ANOTHER
	// user's TOTP so a member who lost BOTH their authenticator AND their one-time
	// recovery codes can re-enrol — the org-level counterpart to the self-service
	// recovery-codes hatch. This is a SEPARATE adminProcedure from
	// enable2fa/disable2fa (which stay privateProcedure): it is auto-audited by the
	// adminProcedure middleware (Plan 01), redact() covers the {userId} input, and
	// it NEVER reads/returns/logs the secret — it only clears it. Resetting your
	// OWN 2FA here is harmless (an authenticated admin can already disable it).
	adminResetUser2fa: adminProcedure
		.input(z.object({userId: z.string().uuid()}))
		.mutation(async ({input}) => {
			const ok = await adminResetUserTotp(input.userId)
			if (!ok) {
				throw new TRPCError({code: 'NOT_FOUND', message: 'User not found'})
			}
			return {success: true}
		}),

	// IDENT-05 — org-wide 2FA policy (admin-toggled). setRequire2fa is adminProcedure → auto-audited (Plan 01).
	// ctx.livinityd is always present on an authenticated call (typed optional; the
	// `!` matches the existing convention, e.g. system/routes.ts require2faVerified(ctx.user!)).
	getRequire2fa: adminProcedure.query(async ({ctx}) => getRequire2fa(ctx.livinityd!)),
	setRequire2fa: adminProcedure
		.input(z.object({value: z.boolean()}))
		.mutation(async ({ctx, input}) => setRequire2fa(ctx.livinityd!, input.value)),

	// Grace-period signal (Pitfall 4 / D-328-3): true when the policy is ON and the
	// CURRENT user has not enrolled — the UI redirects to enrol, it NEVER blocks login.
	requires2faSetup: privateProcedure.query(async ({ctx}) => {
		if (!ctx.currentUser) return false
		if (!(await getRequire2fa(ctx.livinityd!))) return false
		return !(await isUserTotpEnabled(ctx.currentUser.id))
	}),

	// Returns the current user
	get: privateProcedure.query(async ({ctx}) => {
		// Get YAML data as fallback defaults
		const yamlUser = await ctx.user.get()

		// If we have a multi-user session, read from PostgreSQL
		if (ctx.currentUser) {
			const dbUser = await findUserById(ctx.currentUser.id)
			const prefs = await getUserPreferences(ctx.currentUser.id, [
				'wallpaper',
				'language',
				'temperatureUnit',
				'accentColor',
			])

			return {
				// Display name from the database users table (correct per-user name)
				name: dbUser?.displayName ?? yamlUser?.name ?? '',
				// Preferences from user_preferences, falling back to YAML defaults
				wallpaper: prefs.wallpaper ?? yamlUser?.wallpaper ?? DEFAULT_WALLPAPER,
				language: prefs.language ?? yamlUser?.language,
				temperatureUnit: prefs.temperatureUnit ?? yamlUser?.temperatureUnit,
				accentColor: prefs.accentColor ?? null,
				// Multi-user info
				id: ctx.currentUser.id,
				username: ctx.currentUser.username,
				role: ctx.currentUser.role,
			}
		}

		// Legacy single-user mode: read everything from YAML
		if (yamlUser?.wallpaper === undefined && yamlUser) {
			yamlUser.wallpaper = DEFAULT_WALLPAPER
		}

		return {
			name: yamlUser?.name,
			wallpaper: yamlUser?.wallpaper ?? DEFAULT_WALLPAPER,
			language: yamlUser?.language,
			temperatureUnit: yamlUser?.temperatureUnit,
		}
	}),

	// Sets whitelisted properties on the user object
	set: privateProcedure
		.input(
			z
				.object({
					name: z.string().optional(),
					wallpaper: z.string().optional(),
					language: z.string().optional(),
					temperatureUnit: z.string().optional(),
					accentColor: z.string().nullable().optional(),
				})
				.strict(),
		)
		.mutation(async ({ctx, input}) => {
			// If multi-user mode, write preferences to PostgreSQL
			if (ctx.currentUser) {
				if (input.name) {
					await updateUserDisplayName(ctx.currentUser.id, input.name)
				}
				if (input.wallpaper) {
					await setUserPreference(ctx.currentUser.id, 'wallpaper', input.wallpaper)
				}
				if (input.language) {
					await setUserPreference(ctx.currentUser.id, 'language', input.language)
				}
				if (input.temperatureUnit) {
					await setUserPreference(ctx.currentUser.id, 'temperatureUnit', input.temperatureUnit)
				}
				if (input.accentColor !== undefined) {
					if (input.accentColor === null) {
						await deleteUserPreference(ctx.currentUser.id, 'accentColor')
					} else {
						await setUserPreference(ctx.currentUser.id, 'accentColor', input.accentColor)
					}
				}
			} else {
				// Legacy single-user mode: write to YAML
				if (input.name) await ctx.user.setName(input.name)
				if (input.wallpaper) await ctx.user.setWallpaper(input.wallpaper)
				if (input.language) await ctx.user.setLanguage(input.language)
				if (input.temperatureUnit) await ctx.user.setTemperatureUnit(input.temperatureUnit)
				if (input.accentColor !== undefined) await ctx.user.setAccentColor(input.accentColor)
			}

			return true
		}),

	// Get custom accent color
	accentColor: privateProcedure.query(async ({ctx}) => {
		// If multi-user mode, read from PostgreSQL
		if (ctx.currentUser) {
			const value = await getUserPreference(ctx.currentUser.id, 'accentColor')
			return value ?? null
		}
		// Legacy single-user mode: read from YAML
		return ctx.user.getAccentColor()
	}),

	// Returns the users wallpaper
	// This endpoint is public so it can be shown on the login screen
	wallpaper: publicProcedure.query(async ({ctx}) => {
		// Multi-user: read from PostgreSQL preferences
		if (ctx.currentUser) {
			const value = await getUserPreference(ctx.currentUser.id, 'wallpaper')
			if (value) return value
		}
		// Legacy single-user mode or fallback: read from YAML
		const user = await ctx.user.get()
		return user?.wallpaper ?? DEFAULT_WALLPAPER
	}),

	// Returns the preferred language, if any
	// This endpoint is public so it can be used on the login screen
	language: publicProcedure.query(async ({ctx}) => {
		// Multi-user: read from PostgreSQL preferences
		if (ctx.currentUser) {
			const value = await getUserPreference(ctx.currentUser.id, 'language')
			if (value) return value
		}
		// Legacy or fallback
		const user = await ctx.user.get()
		return user?.language ?? null
	}),

	// ─────────────────────────────────────────────────────────────────────────
	// Multi-User Management Routes
	// ─────────────────────────────────────────────────────────────────────────

	// Public - list users for login screen (safe data only, no passwords)
	listUsers: publicProcedure.query(async () => {
		const users = await listUsers()
		return users
			.filter((u) => u.isActive)
			.map((u) => ({
				id: u.id,
				username: u.username,
				display_name: u.displayName,
				avatar_color: u.avatarColor,
				role: u.role,
			}))
	}),

	// Admin only - list all users with full details
	listAllUsers: adminProcedure.query(async ({ctx}) => {
		const users = await listUsers()
		// Phase 325 STOR-02 — enrich each row with its quota (PG) + last-scanned
		// used bytes (cached in the FileStore by the user-quota-scan job). Both are
		// best-effort reads: a missing quota → null (unlimited), a not-yet-run scan
		// → null used (the UI shows "—" until the first tick).
		const quotas = await listUserQuotas().catch(() => [] as Array<{id: string; quotaBytes: number | null}>)
		const quotaById = new Map(quotas.map((q) => [q.id, q.quotaBytes]))
		let usedByUsername: Record<string, number> = {}
		try {
			const sq = await ctx.livinityd?.store.get('storageQuota')
			if (sq && typeof sq === 'object' && 'usedBytes' in sq) {
				usedByUsername = ((sq as {usedBytes?: Record<string, number>}).usedBytes ?? {}) as Record<string, number>
			}
		} catch {
			// Cache read failure → leave used bytes empty; quotas still surface.
		}
		return users.map((u) => ({
			id: u.id,
			username: u.username,
			display_name: u.displayName,
			avatar_color: u.avatarColor,
			role: u.role,
			is_active: u.isActive,
			created_at: u.createdAt.toISOString(),
			updated_at: u.updatedAt.toISOString(),
			quota_bytes: quotaById.get(u.id) ?? null,
			used_bytes: usedByUsername[u.username] ?? null,
		}))
	}),

	// Admin only - create invite link
	createInvite: adminProcedure
		.input(
			z.object({
				role: z.enum(['member', 'guest']).default('member'),
			}),
		)
		.mutation(async ({input, ctx}) => {
			if (!ctx.currentUser) {
				throw new TRPCError({code: 'UNAUTHORIZED', message: 'Must be logged in'})
			}

			// Generate a random token
			const rawToken = crypto.randomBytes(32).toString('hex')
			const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

			// Invite expires in 7 days
			const expiresAt = new Date(Date.now() + 7 * ONE_DAY)

			await createInvite({
				tokenHash,
				createdBy: ctx.currentUser.id,
				role: input.role,
				expiresAt,
			})

			return {token: rawToken}
		}),

	// Public - accept invite and register new user
	acceptInvite: publicProcedure
		.input(
			z.object({
				token: z.string(),
				username: z.string().min(3).max(20).regex(/^[a-z0-9-]+$/, 'Username must be lowercase letters, numbers, or hyphens'),
				display_name: z.string().min(1).max(50),
				password: z.string().min(6, 'Password must be at least 6 characters'),
			}),
		)
		.mutation(async ({input}) => {
			// Hash the token to look up the invite
			const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex')
			const invite = await findValidInvite(tokenHash)

			if (!invite) {
				throw new TRPCError({code: 'NOT_FOUND', message: 'Invalid or expired invite link'})
			}

			// Check username is not already taken
			const existing = await findUserByUsername(input.username)
			if (existing) {
				throw new TRPCError({code: 'CONFLICT', message: 'Username already taken'})
			}

			// Hash password
			const saltRounds = 12
			const hashedPassword = (await bcrypt.hash(input.password, saltRounds)).replace(/^\$2a\$/, '$2b$')

			// Pick a random avatar color
			const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6']
			const avatarColor = colors[Math.floor(Math.random() * colors.length)]

			// Create user
			const user = await createUser({
				username: input.username,
				displayName: input.display_name,
				hashedPassword,
				role: invite.role,
				avatarColor,
			})

			// Mark invite as used
			await markInviteUsed(invite.id, user.id)

			return {success: true, username: user.username}
		}),

	// Admin only - update user role
	updateUserRole: adminProcedure
		.input(
			z.object({
				userId: z.string().uuid(),
				role: z.enum(['admin', 'member', 'guest']),
			}),
		)
		.mutation(async ({input, ctx}) => {
			// Prevent admin from changing their own role
			if (ctx.currentUser && input.userId === ctx.currentUser.id) {
				throw new TRPCError({code: 'BAD_REQUEST', message: 'Cannot change your own role'})
			}

			const user = await updateUserRole(input.userId, input.role)
			if (!user) {
				throw new TRPCError({code: 'NOT_FOUND', message: 'User not found'})
			}

			return {success: true}
		}),

	// Phase 325 STOR-02 — admin sets a user's storage quota (bytes). A value <= 0
	// is treated as "no effective quota" (unlimited) by the enforcement path
	// (files.assertWithinQuota + usersOverSoftQuota), same as a NULL column; a
	// positive value is the hard byte ceiling. Clearing back to NULL has no UI
	// affordance yet (deferred) — set 0 for the unlimited-equivalent.
	// T-325-01: adminProcedure (Phase-328 audited) + z.uuid + z.int().nonnegative()
	// + parameterized UPDATE (updateUserQuota) — no string interpolation.
	setUserQuota: adminProcedure
		.input(
			z.object({
				userId: z.string().uuid(),
				quotaBytes: z.number().int().nonnegative(),
			}),
		)
		.mutation(async ({input}) => {
			const ok = await updateUserQuota(input.userId, input.quotaBytes)
			if (!ok) {
				throw new TRPCError({code: 'NOT_FOUND', message: 'User not found'})
			}
			return {success: true}
		}),

	// Admin only - disable/enable user
	toggleUserActive: adminProcedure
		.input(
			z.object({
				userId: z.string().uuid(),
				isActive: z.boolean(),
			}),
		)
		.mutation(async ({input, ctx}) => {
			// Prevent admin from disabling themselves
			if (ctx.currentUser && input.userId === ctx.currentUser.id) {
				throw new TRPCError({code: 'BAD_REQUEST', message: 'Cannot disable your own account'})
			}

			const user = await toggleUserActive(input.userId, input.isActive)
			if (!user) {
				throw new TRPCError({code: 'NOT_FOUND', message: 'User not found'})
			}

			// Phase 257-04 (LIVOS-005): deactivating a user revokes all of their
			// outstanding sessions so their existing JWT stops working immediately
			// (in addition to the is-authenticated active-user fail-closed check).
			if (!input.isActive) {
				await revokeSessionsForUser(input.userId)
			}

			return {success: true}
		}),

	// Admin only - delete a user
	deleteUser: adminProcedure
		.input(
			z.object({
				userId: z.string().uuid(),
			}),
		)
		.mutation(async ({input, ctx}) => {
			if (ctx.currentUser && input.userId === ctx.currentUser.id) {
				throw new TRPCError({code: 'BAD_REQUEST', message: 'Cannot delete your own account'})
			}

			// Phase 257-04 (LIVOS-005): revoke sessions BEFORE deletion. The
			// sessions FK is ON DELETE CASCADE so rows vanish with the user, but
			// revoking first also kills any session if the delete is soft/partial
			// and is explicit defense-in-depth.
			await revokeSessionsForUser(input.userId)

			const deleted = await deleteUser(input.userId)
			if (!deleted) {
				throw new TRPCError({code: 'NOT_FOUND', message: 'User not found'})
			}

			return {success: true}
		}),

	// Private - change own display name (multi-user)
	changeDisplayName: privateProcedure
		.input(
			z.object({
				displayName: z.string().min(1).max(50),
			}),
		)
		.mutation(async ({input, ctx}) => {
			if (!ctx.currentUser) {
				throw new TRPCError({code: 'UNAUTHORIZED', message: 'Must be logged in'})
			}

			const user = await updateUserDisplayName(ctx.currentUser.id, input.displayName)
			if (!user) {
				throw new TRPCError({code: 'NOT_FOUND', message: 'User not found'})
			}

			return {success: true}
		}),

	// Private - list the current user's own active sessions (Settings → Security &
	// Sessions). Multi-user only; legacy single-user has no sessions table so this
	// returns an empty list. The session matching the current request is flagged
	// `current` so the UI can label "this device" and avoid a self-revoke.
	listSessions: privateProcedure.query(async ({ctx}) => {
		if (!ctx.currentUser) return {hasDb: false, sessions: []}
		let currentJti: string | null = null
		try {
			const token = ctx.request?.headers.authorization?.split(' ')[1]
			if (token) {
				const verified = await ctx.server.verifyToken(token)
				currentJti = verified?.jti ?? null
			}
		} catch {
			// best-effort: the `current` flag just won't be set
		}
		const rows = await listUserSessions(ctx.currentUser.id)
		return {
			hasDb: true,
			sessions: rows.map((r) => ({
				id: r.id,
				deviceName: r.device_name,
				ipAddress: r.ip_address,
				createdAt: r.created_at.toISOString(),
				current: r.jti != null && r.jti === currentJti,
			})),
		}
	}),

	// Private - revoke ONE of the current user's sessions by id (scoped to the
	// owner so a caller can never revoke another user's session). The revoked JWT
	// is rejected on its next request by the is-authenticated jti gate.
	revokeSession: privateProcedure
		.input(z.object({sessionId: z.string().uuid()}))
		.mutation(async ({input, ctx}) => {
			if (!ctx.currentUser) {
				throw new TRPCError({code: 'BAD_REQUEST', message: 'Sessions are only tracked in multi-user mode'})
			}
			const ok = await revokeUserSession({sessionId: input.sessionId, userId: ctx.currentUser.id})
			if (!ok) {
				throw new TRPCError({code: 'NOT_FOUND', message: 'Session not found or already revoked'})
			}
			return {success: true}
		}),
})
