import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://platform:LivPlatform2024@127.0.0.1:5432/platform',
});

export default pool;
