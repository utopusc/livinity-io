// Phase 92-01 stub — webapps-repository.ts.
//
// P92 ships the `webapps` Postgres table schema (92-02) but defers the
// CRUD procedures (`create / list / delete / update`) to P94, which lands
// alongside the desktop "Add WebApp" dialog UI. The stub exists so the
// module barrel typechecks and so P94 has a deterministic file path to
// extend.

import type pg from 'pg'

// Row shape mirrors the columns declared in 92-02's migration. Names are
// camelCased here for the JS surface; SQL columns stay snake_case.
export type WebAppRow = {
	id: string
	userId: string
	url: string
	title: string | null
	faviconUrl: string | null
	position: number
	createdAt: Date
}

// Helper used by P94 CRUD + the orchestrator (lookup by-url for de-dupe);
// stub returns null until the table is wired into a repo function set.
export async function findWebAppByUrl(_pool: pg.Pool, _userId: string, _url: string): Promise<WebAppRow | null> {
	return null
}
