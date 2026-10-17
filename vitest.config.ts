import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Component callback fixtures use node:test and run through test:frontend:callbacks.
    include: ['tests/**/*.test.ts', 'frontend/tests/**/*.test.ts'],
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
  },
});
