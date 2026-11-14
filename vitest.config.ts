import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
    env: { DATABASE_URL: 'file:./dev.db' },
  },
});
