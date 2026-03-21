import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '@/db/schema';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://platform:LivPlatform2024@127.0.0.1:5432/platform',
});

export const db = drizzle(pool, { schema });
