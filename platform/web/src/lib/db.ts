import pg from 'pg';

// LIVOS-021: require DATABASE_URL — no committed fallback credential.
// Mirrors the fail-loud pattern in drizzle.ts.
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('[db] DATABASE_URL is required — committed default removed (LIVOS-021)');
}

const pool = new pg.Pool({
  connectionString: url,
});

export default pool;
