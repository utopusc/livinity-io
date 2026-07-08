import { pgTable, uuid, text, boolean, timestamp, jsonb, pgEnum, integer, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Phase 148 — section enum (see SPEC.md §1).
export const sectionEnum = pgEnum('section_enum', [
  'app',
  'webapp',
  'native',
  'ai',
  'plugin',
]);

export const apps = pgTable('apps', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  tagline: text('tagline').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  section: sectionEnum('section').notNull().default('app'),
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
  // 0029: single-use replay guard for POST /api/device/exchange. NULL = never exchanged.
  token_exchanged_at: timestamp('token_exchanged_at', { withTimezone: true }),
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

// =========================================================================
// Docs — admin-editable documentation (Supabase-backed, image-capable).
// Public reads happen in RSC via `db` directly; writes via /api/admin/docs/*
// (requireAdmin gated). Article `content` is GitHub-flavored markdown;
// `cover_url` + inline images live in the app-icons Storage bucket under a
// `docs/<slug>/` prefix (reuses the existing icon-upload route).
// =========================================================================
export const docsCategories = pgTable('docs_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  sort_order: integer('sort_order').notNull().default(100),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const docsArticles = pgTable('docs_articles', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  category_id: uuid('category_id')
    .notNull()
    .references(() => docsCategories.id, { onDelete: 'restrict' }),
  content: text('content').notNull().default(''),
  cover_url: text('cover_url'),
  published: boolean('published').notNull().default(false),
  featured: boolean('featured').notNull().default(false),
  sort_order: integer('sort_order').notNull().default(100),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// =========================================================================
// Phase 292 — Admin-authored fleet-wide announcements / pop-ups.
// Authored in /admin/announcements (requireAdmin), polled by every box via
// /api/me/announcements/poll, shown EXACTLY ONCE per user. user_id columns
// store the CLOUD users.id (cross-instance identity, resolved server-side from
// the API key) — NO Drizzle .references() because users lives in
// platform/relay/src/schema.sql (same convention as devices/installHistory).
// SQL source of truth: migrations/0025_phase_292_announcements.sql
// =========================================================================
export const announcements = pgTable('announcements', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').unique(),
  title: text('title').notNull(),
  kind: text('kind').notNull().default('announcement'),  // announcement|campaign|promo|feature|feedback
  blocks: jsonb('blocks').$type<unknown[]>().notNull().default([]),
  raw_html_sanitized: text('raw_html_sanitized'),
  raw_html_source: text('raw_html_source'),  // never served to a box
  frequency: text('frequency').notNull().default('once_ever'),  // once_ever|once_per_day|n_times
  frequency_n: integer('frequency_n'),
  priority: integer('priority').notNull().default(100),  // lower = higher priority
  dismissible: boolean('dismissible').notNull().default(true),
  start_at: timestamp('start_at', { withTimezone: true }),
  end_at: timestamp('end_at', { withTimezone: true }),
  target_kind: text('target_kind').notNull().default('all'),  // all|user_ids|plan_tier
  target_user_ids: uuid('target_user_ids').array().notNull().default(sql`'{}'::uuid[]`),
  target_plan_tier: text('target_plan_tier'),
  status: text('status').notNull().default('draft'),  // draft|published|archived
  published_at: timestamp('published_at', { withTimezone: true }),
  created_by: uuid('created_by'),  // CLOUD users.id (admin author)
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const announcementSeen = pgTable('announcement_seen', {
  announcement_id: uuid('announcement_id').notNull(),  // FK -> announcements(id) ON DELETE CASCADE (SQL only)
  user_id: uuid('user_id').notNull(),  // CLOUD users.id — no Drizzle FK (see header)
  seen_count: integer('seen_count').notNull().default(0),
  first_seen_at: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
  last_seen_at: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  dismissed_at: timestamp('dismissed_at', { withTimezone: true }),
}, (t) => ({
  pk: primaryKey({ columns: [t.announcement_id, t.user_id] }),
}));

export const announcementFeedback = pgTable('announcement_feedback', {
  id: uuid('id').defaultRandom().primaryKey(),
  announcement_id: uuid('announcement_id').notNull(),  // FK -> announcements(id) ON DELETE CASCADE (SQL only)
  user_id: uuid('user_id').notNull(),  // CLOUD users.id — no Drizzle FK (see header)
  block_id: text('block_id'),  // which poll/feedback block (null = announcement-level)
  vote_option: text('vote_option'),
  free_text: text('free_text'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
