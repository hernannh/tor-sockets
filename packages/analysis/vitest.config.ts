import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Integration tests share one DB; serialize to keep TRUNCATE isolation safe.
  pool: 'forks',
  poolOptions: { forks: { singleFork: true } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
    globalSetup: ['./src/test/global-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/test/**'],
      thresholds: {
        lines: 70,
        branches: 70,
        functions: 70,
        statements: 70,
      },
    },
  },
});
