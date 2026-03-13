import crypto from 'node:crypto'

import {TRPCError} from '@trpc/server'
import {z} from 'zod'
import bcrypt from 'bcryptjs'

import {router, publicProcedure, privateProcedure, adminProcedure} from '../server/trpc/trpc.js'
import * as totp from '../utilities/totp.js'
import {
	getPool,
	findUserByUsername,
	createUser,
	getAdminUser,
	listUsers,
	updateUserRole,
	toggleUserActive,
	updateUserDisplayName,
	createInvite,
	findValidInvite,
	markInviteUsed,
} from '../database/index.js'

const ONE_SECOND = 1000
const ONE_MINUTE = 60 * ONE_SECOND
const ONE_HOUR = 60 * ONE_MINUTE
const ONE_DAY = 24 * ONE_HOUR
const ONE_WEEK = 7 * ONE_DAY

const DEFAULT_WALLPAPER = 'aurora'

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

	// Public method to check if a user exists
	exists: publicProcedure.query(async ({ctx}) => ctx.user.exists()),

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

			const pool = getPool()

			// If a username is provided and DB is available, try DB-based auth
			if (input.username && pool) {
				const dbUser = await findUserByUsername(input.username)
				if (!dbUser) {
					throw new TRPCError({code: 'UNAUTHORIZED', message: 'Incorrect password'})
				}
				if (!dbUser.isActive) {
					throw new TRPCError({code: 'UNAUTHORIZED', message: 'Account is disabled'})
				}

				const validPassword = await bcrypt.compare(input.password, dbUser.hashedPassword)
				if (!validPassword) {
					throw new TRPCError({code: 'UNAUTHORIZED', message: 'Incorrect password'})
				}

				dbUserId = dbUser.id
				dbUserRole = dbUser.role
			} else {
				// Legacy single-user login via YAML
				if (!(await ctx.user.validatePassword(input.password))) {
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
					throw new TRPCError({code: 'UNAUTHORIZED', message: 'Missing 2FA code'})
				}

				// Verify the token
				if (!(await ctx.user.validate2faToken(input.totpToken))) {
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

			// Set domain-wide session cookie for cross-subdomain auth
			// Read the configured domain so the cookie covers *.domain too
			let cookieDomain: string | undefined
			try {
				const domainConfigRaw = await ctx.livinityd.ai.redis.get('livos:domain:config')
				if (domainConfigRaw) {
					const dc = JSON.parse(domainConfigRaw)
					if (dc.active && dc.domain) cookieDomain = `.${dc.domain}`
				}
			} catch { /* ignore – fall back to no explicit domain */ }

			ctx.response!.cookie('LIVINITY_SESSION', apiToken, {
				httpOnly: true,
				secure: true,
				sameSite: 'lax',
				maxAge: 30 * ONE_DAY,
				...(cookieDomain ? {domain: cookieDomain} : {}),
			})

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
			// Check if 2FA is already enabled
			if (await ctx.user.is2faEnabled()) {
				throw new TRPCError({code: 'UNAUTHORIZED', message: '2FA is already enabled'})
			}

			// Verify the token
			if (!totp.verify(input.totpUri, input.totpToken)) {
				throw new TRPCError({code: 'UNAUTHORIZED', message: 'Incorrect 2FA code'})
			}

			// Save URI
			return ctx.user.enable2fa(input.totpUri)
		}),

	is2faEnabled: publicProcedure.query(async ({ctx}) => ctx.user.is2faEnabled()),

	// Disables 2FA
	disable2fa: privateProcedure
		.input(
			z.object({
				totpToken: z.string(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			// Check if 2FA is already enabled
			if (!(await ctx.user.is2faEnabled())) {
				throw new TRPCError({code: 'UNAUTHORIZED', message: '2FA is not enabled'})
			}

			// Verify the token
			if (!(await ctx.user.validate2faToken(input.totpToken))) {
				throw new TRPCError({code: 'UNAUTHORIZED', message: 'Incorrect 2FA code'})
			}

			// Delete the URI
			return ctx.user.disable2fa()
		}),

	// Returns the current user
	get: privateProcedure.query(async ({ctx}) => {
		const user = await ctx.user.get()

		if (user.wallpaper === undefined) {
			user.wallpaper = DEFAULT_WALLPAPER
		}

		// Only return non sensitive data
		return {
			name: user.name,
			wallpaper: user.wallpaper,
			language: user.language,
			temperatureUnit: user.temperatureUnit,
			// Include multi-user info if available
			...(ctx.currentUser
				? {
						id: ctx.currentUser.id,
						username: ctx.currentUser.username,
						role: ctx.currentUser.role,
					}
				: {}),
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
			if (input.name) await ctx.user.setName(input.name)
			if (input.wallpaper) await ctx.user.setWallpaper(input.wallpaper)
			if (input.language) await ctx.user.setLanguage(input.language)
			if (input.temperatureUnit) await ctx.user.setTemperatureUnit(input.temperatureUnit)
			if (input.accentColor !== undefined) await ctx.user.setAccentColor(input.accentColor)

			return true
		}),

	// Get custom accent color
	accentColor: privateProcedure.query(async ({ctx}) => {
		return ctx.user.getAccentColor()
	}),

	// Returns the users wallpaper
	// This endpoint is public so it can be shown on the login screen
	wallpaper: publicProcedure.query(async ({ctx}) => {
		const user = await ctx.user.get()
		return user?.wallpaper ?? DEFAULT_WALLPAPER
	}),

	// Returns the preferred language, if any
	// This endpoint is public so it can be used on the login screen
	language: publicProcedure.query(async ({ctx}) => {
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
	listAllUsers: adminProcedure.query(async () => {
		const users = await listUsers()
		return users.map((u) => ({
			id: u.id,
			username: u.username,
			display_name: u.displayName,
			avatar_color: u.avatarColor,
			role: u.role,
			is_active: u.isActive,
			created_at: u.createdAt.toISOString(),
			updated_at: u.updatedAt.toISOString(),
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
})
