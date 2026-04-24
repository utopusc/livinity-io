import { pgTable, uuid, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const apps = pgTable('apps', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  tagline: text('tagline').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  version: text('version').notNull().default('1.0.0'),
  docker_compose: text('docker_compose').notNull(),
  manifest: jsonb('manifest').notNull(),
  icon_url: text('icon_url').notNull(),
  featured: boolean('featured').notNull().default(false),
  verified: boolean('verified').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const installHistory = pgTable('install_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id').notNull(),
  app_id: uuid('app_id').notNull().references(() => apps.id),
  action: text('action').notNull(),  // 'install' or 'uninstall'
  instance_name: text('instance_name').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// =========================================================================
// Devices (registered remote agents)
// =========================================================================
// NOTE: user_id has a FK constraint to users(id) ON DELETE RESTRICT enforced
// at the DB level (migration 0007_device_user_id_fk.sql + relay/src/schema.sql).
// Not expressed via Drizzle .references() because the `users` table is managed
// by platform/relay/src/schema.sql, not Drizzle — keeping a single source of
// truth for the users schema.
export const devices = pgTable('devices', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id').notNull(),  // FK -> users(id) ON DELETE RESTRICT (see migration 0007)
  device_id: uuid('device_id').notNull().unique(),
  device_name: text('device_name').notNull(),
  platform: text('platform').notNull(),  // 'win32' | 'darwin' | 'linux'
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  last_seen: timestamp('last_seen', { withTimezone: true }),
  revoked: boolean('revoked').notNull().default(false),
});

// =========================================================================
// Device Grants (OAuth device flow pending approvals)
// =========================================================================
export const deviceGrants = pgTable('device_grants', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id'),  // nullable until approved
  device_code: text('device_code').notNull().unique(),
  user_code: text('user_code').notNull().unique(),
  status: text('status').notNull().default('pending'),  // 'pending' | 'approved' | 'expired'
  device_info: jsonb('device_info'),  // { deviceName, platform, agentVersion }
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// =========================================================================
// Custom Domains (user-registered custom domains, v19.0)
// =========================================================================
export const customDomains = pgTable('custom_domains', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id').notNull(),
  domain: text('domain').notNull().unique(),
  verification_token: text('verification_token').notNull(),
  status: text('status').notNull().default('pending_dns'),
  // Status values: pending_dns | dns_verified | dns_failed | active | dns_changed | error
  dns_a_verified: boolean('dns_a_verified').notNull().default(false),
  dns_txt_verified: boolean('dns_txt_verified').notNull().default(false),
  app_mapping: jsonb('app_mapping').notNull().default({}),
  error_message: text('error_message'),
  last_dns_check: timestamp('last_dns_check', { withTimezone: true }),
  verified_at: timestamp('verified_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
