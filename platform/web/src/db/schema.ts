import { pgTable, uuid, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const apps = pgTable('apps', {
  id: uuid('id').defaultRandom().primaryKey(),
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
