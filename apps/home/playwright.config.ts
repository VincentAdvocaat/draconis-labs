import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './browser',
  timeout: 30_000,
  workers: 1,
  outputDir: './node_modules/.cache/draconis-home-playwright',
  use: { browserName: 'chromium', screenshot: 'only-on-failure' },
});
