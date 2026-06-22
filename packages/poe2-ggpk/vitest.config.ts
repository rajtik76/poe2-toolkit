import { defineConfig } from 'vitest/config';

// Self-contained config so vitest never walks up into the host app's
// vite.config. Keeps the package extractable: nothing here references anything
// outside this directory.
export default defineConfig({
  root: __dirname,
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
