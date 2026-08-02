import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://torsockets:change-me@localhost:5433/torsockets',
  },
  verbose: true,
  strict: true,
  casing: 'snake_case',
});
