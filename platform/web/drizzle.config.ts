import { defineConfig } from 'drizzle-kit';

// LIVOS-021: require DATABASE_URL — no committed fallback credential.
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('[drizzle.config] DATABASE_URL is required — committed default removed (LIVOS-021)');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url,
  },
});
