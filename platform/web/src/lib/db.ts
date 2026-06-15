import pg from 'pg';

// LIVOS-021: require DATABASE_URL — no committed fallback credential.
// Mirrors the fail-loud pattern in drizzle.ts.
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('[db] DATABASE_URL is required — committed default removed (LIVOS-021)');
}

const pool = new pg.Pool({
  connectionString: url,
  // Fail fast on a saturated pool instead of hanging a request forever (pg's
  // default connectionTimeoutMillis=0 waits indefinitely). Matters because some
  // paths (CF provisioning in lib/user-provisioning.ts) hold a connection across
  // multi-second external calls; under a burst the surplus connect() should
  // error out and let the caller's best-effort handler retry, not stall.
  connectionTimeoutMillis: 10_000,
});

export default pool;
