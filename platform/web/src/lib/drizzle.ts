import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '@/db/schema';

// Phase 148 v37 zero-Server5 constraint (SPEC §0.2):
// DATABASE_URL must point to Supabase. The old `127.0.0.1:5432/platform`
// fallback would silently route through Server5's local Postgres on a
// misconfigured deploy — which is exactly the regression we are barring.
// Fail-loud here so a missing env var surfaces at boot, not later via
// a "wrong rows" bug in production.
if (!process.env.DATABASE_URL) {
  throw new Error(
    '[drizzle] DATABASE_URL is required (Supabase pooler URI). ' +
      'Server5 fallback removed per v37 SPEC §0.',
  );
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
