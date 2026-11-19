import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Concurrency cases fork two/three real SQLite writers themselves. Bound
    // file workers so those processes do not multiply across every CPU core.
    maxWorkers: 4,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
